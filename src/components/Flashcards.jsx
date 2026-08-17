import { useCallback, useEffect, useRef, useState } from "react";
import { useStats } from "../StatsContext.js";
import { pickFlashcard } from "../logic/picker.js";
import { DECKS, DECK_BY_ID, cardKey, saveSession, session } from "../logic/flashcards.js";
import { hashStateFor, useDetailHash, writeHash } from "../logic/hashState.js";
import { formatInterval, intervalFor } from "../logic/schedule.js";
import { POKEMON_BY_ID, POKEMON_BY_NAME, preloadSprite } from "../data/pokedex.js";
import { CATEGORIES } from "../data/categories.js";
import CategoryPill, { AbilityPill } from "./CategoryPill.jsx";
import PokemonCard from "./PokemonCard.jsx";
import PokemonDetail from "./PokemonDetail.jsx";

const GROUP_FLAGS = ["legendary", "mythical", "ultraBeast", "paradox", "fossil", "starter", "baby", "mega", "gmax"];
const CAT = new Map(CATEGORIES.map((c) => [c.id, c]));
// Shown in the group slot when a Pokémon is in no group at all
const REGULAR = { id: "flag-regular", label: "Regular", short: "Regular", group: "special" };

// Typing, region and group of a Pokémon as pills, shown once a card is
// answered — the same strip whatever the deck asked: types on the left,
// region in the middle, group on the right, so the eye always finds each
// in the same place. Abilities follow as their own row of pills.
function summaryPills(p) {
  return [
    p.types.map((t) => CAT.get(`type-${t}`)),
    p.regions.map((r) => CAT.get(`region-${r}`)),
    GROUP_FLAGS.filter((f) => p.flags.includes(f)).map((f) => CAT.get(`flag-${f}`)),
  ].map((cats, i) => (i === 2 && !cats.length ? [REGULAR] : cats));
}

const GAVE_UP = "gaveup";

// A deck named in the URL (#cards/region) wins over the remembered one.
function initialDeck() {
  const fromHash = hashStateFor("cards")?.[0];
  return fromHash === "all" || DECK_BY_ID.has(fromHash) ? fromHash : session.deckId;
}

function Flashcards() {
  const { merged, recordAttempt } = useStats();
  // The card lives in the module-level session (mirrored to localStorage)
  // so switching tabs and back, or reloading, shows the same card.
  const [deckId, setDeckId] = useState(() => {
    const id = initialDeck();
    if (id !== session.deckId) {
      session.deckId = id;
      // a remembered card from another deck gives way to the URL's deck
      if (id !== "all" && session.card && session.card.deckId !== id) session.card = null;
    }
    return id;
  });
  const [card, setCard] = useState(() => {
    if (!session.card) {
      session.card = freshCard(session.deckId);
      session.picked = null;
      session.selection = [];
    }
    return session.card;
  });
  const [picked, setPicked] = useState(session.picked);
  const [selection, setSelection] = useState(session.selection);
  const pickerRef = useRef(null);
  const deck = DECK_BY_ID.get(card.deckId);
  const pokemon = POKEMON_BY_ID.get(card.pokemonId);

  // The open sheet lives in the URL (#cards/region/pokemon-eevee) — only
  // once the card is answered, so nothing gives the answer away (any
  // Pokémon then: a sheet's evolution tiles lead on to other sheets)
  const resolve = useCallback((slug) => (picked !== null && slug ? POKEMON_BY_NAME.get(slug) || null : null), [picked]);
  const [detail, openDetail, closeDetail] = useDetailHash(resolve); // the open sheet's Pokémon

  function freshCard(forDeck, alsoExclude = []) {
    const { deck, pokemon, param } = pickFlashcard(merged, {
      deckId: forDeck,
      exclude: new Set([...session.recent, ...alsoExclude]),
    });
    return { deckId: deck.id, pokemonId: pokemon.id, param };
  }

  // Line up the following card now and warm its sprite, so "Next" swaps
  // name and picture together instead of the picture trailing the name.
  useEffect(() => {
    const fits = (c) => c && (deckId === "all" || c.deckId === deckId) && c.pokemonId !== card.pokemonId;
    if (!fits(session.next)) session.next = freshCard(deckId, [card.pokemonId]);
    preloadSprite(POKEMON_BY_ID.get(session.next.pokemonId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, deckId]);

  // The deck lives in the URL (#cards/region) — replaced, not pushed, so
  // Back still leaves the tab
  useEffect(() => {
    writeHash("cards", deckId === "all" ? [] : [deckId]);
  }, [deckId]);

  // On phones the deck row scrolls sideways; keep the active chip in view
  // (coming back to the tab with "Ability" selected shouldn't hide it).
  useEffect(() => {
    const row = pickerRef.current;
    const chip = row?.querySelector(".chip.active");
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    const target = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [deckId]);

  // Keyboard: arrows move focus over the options (←/→ one at a time, ↑/↓
  // a row), Space toggles the focused one (native button behaviour), and
  // Enter moves the card along — Submit once something is selected, Next
  // Card once answered. Cancelling Enter's default keeps a focused option
  // from also being "clicked".
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // a focused tab or deck chip keeps its own keyboard behaviour; with
      // the detail sheet open, keys belong to it (Escape closes)
      if (detail || document.activeElement?.closest(".tabs, .deck-picker")) return;
      if (e.key === "Enter") {
        if (picked !== null) {
          e.preventDefault();
          e.stopPropagation(); // even with the card itself focused (Space opens it)
          next();
        } else if (selection.length) {
          e.preventDefault();
          submit();
        }
        return;
      }
      if (picked !== null || !e.key.startsWith("Arrow")) return;
      const grid = document.querySelector(".region-buttons");
      const buttons = grid ? [...grid.querySelectorAll(".region-btn")] : [];
      if (!buttons.length) return;
      const cols = parseInt(getComputedStyle(grid).getPropertyValue("--cols"), 10) || 1;
      const at = buttons.indexOf(document.activeElement);
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      if (step === undefined) return;
      e.preventDefault();
      const to = at < 0 ? (step > 0 ? 0 : buttons.length - 1) : Math.min(buttons.length - 1, Math.max(0, at + step));
      buttons[to].focus();
    };
    // capture phase: runs before the focused element's own handler
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const answerIds = new Set(deck.answers(pokemon, card.param));
  const recordCategories = deck.categories(pokemon, card.param);
  const key = cardKey(deck, pokemon);
  // After answering, merged already reflects this attempt's new streak.
  const entry = merged.flashcards[key];
  const nextIn = picked && entry ? formatInterval(intervalFor(entry.s)) : null;
  const answered = picked !== null;
  const gaveUp = picked === GAVE_UP;
  const pickedIds = new Set(Array.isArray(picked) ? picked : []);
  const multi = Boolean(deck.multi);
  // Multi decks need every answer; single-pick decks accept any one of them
  // (Koraidon is Legendary and Paradox)
  const isRight = (ids) =>
    ids.length > 0 && ids.every((id) => answerIds.has(id)) && (!multi || ids.length === answerIds.size);
  const wasCorrect = answered && !gaveUp && isRight([...pickedIds]);

  function commit(nextCard, nextPicked) {
    session.card = nextCard;
    session.picked = nextPicked;
    session.selection = [];
    saveSession();
    setCard(nextCard);
    setPicked(nextPicked);
    setSelection([]);
  }

  // Nothing is graded on click: options toggle (multi decks) or swap
  // (single-pick decks) until Submit.
  function choose(option) {
    if (answered) return;
    let next;
    if (selection.includes(option.id)) {
      next = selection.filter((id) => id !== option.id);
    } else if (multi) {
      const implied = deck.implies?.[option.id] || [];
      next = [...selection, option.id, ...implied.filter((id) => !selection.includes(id))];
    } else {
      next = [option.id];
    }
    session.selection = next;
    saveSession();
    setSelection(next);
  }

  function submit() {
    if (answered || !selection.length) return;
    recordAttempt({ categories: recordCategories, speciesId: key, correct: isRight(selection) });
    commit(card, selection);
  }

  function giveUp() {
    if (answered) return;
    recordAttempt({ categories: recordCategories, speciesId: key, correct: false });
    commit(card, GAVE_UP);
  }

  function next(forDeck = deckId) {
    session.recent = [...session.recent, pokemon.id].slice(-10);
    const upcoming =
      session.next && (forDeck === "all" || session.next.deckId === forDeck) && session.next.pokemonId !== pokemon.id
        ? session.next
        : freshCard(forDeck);
    session.next = null;
    commit(upcoming, null);
  }

  function changeDeck(id) {
    session.deckId = id;
    saveSession();
    setDeckId(id);
    // Switching decks moves on: an answered card is done, and an
    // unanswered one is replaced unless it already fits the new deck.
    if (answered) next(id);
    else if (id !== "all" && card.deckId !== id) commit(freshCard(id), null);
  }

  // Once answered only the right options (and any wrong picks) remain.
  // Solid green = picked and right; dashed = right but not picked (a miss
  // in a multi deck, or the reveal after a wrong pick / Don't Know); red =
  // picked and wrong.
  const shownOptions = answered
    ? deck.options.filter((o) => answerIds.has(o.id) || pickedIds.has(o.id))
    : deck.options;
  const optionClass = (option) => {
    let cls = "region-btn";
    if (deck.id === "type") cls += ` type-${option.id.slice(5)}`;
    if (answered) {
      if (answerIds.has(option.id)) cls += pickedIds.has(option.id) ? " correct" : " correct missed";
      else if (pickedIds.has(option.id)) cls += " wrong";
    } else if (selection.includes(option.id)) {
      cls += " selected";
    }
    return cls;
  };


  return (
    <div className="flashcards">
      <div className="deck-picker" role="tablist" aria-label="Deck" ref={pickerRef}>
        {[{ id: "all", label: "All" }, ...DECKS].map((d) => (
          <button
            key={d.id}
            role="tab"
            aria-selected={deckId === d.id}
            className={`chip${deckId === d.id ? " active" : ""}`}
            onClick={() => changeDeck(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>
      <p className="hint card-question">{deck.question(card.param)}</p>
      {/* once answered, the card opens the detail sheet (evolution line and
          all); before that it stays inert so nothing gives the answer away */}
      <PokemonCard pokemon={pokemon} eager onClick={answered ? () => openDetail(pokemon) : undefined} />
      {detail ? <PokemonDetail pokemon={detail} onClose={closeDetail} onOpen={openDetail} /> : null}
      <div className={`answer-area${answered ? " answered" : ""}`}>
        {answered ? (
          <div className="card-facts">
            <div className="card-tags card-tags-spread">
              {summaryPills(pokemon).map((cats, i) => (
                <span key={i} className="tag-group">
                  {cats.map((c) => (
                    <CategoryPill key={c.id} cat={c} useShort />
                  ))}
                </span>
              ))}
            </div>
            <div className="card-tags">
              <span className="tags-label">Abilities</span>
              {pokemon.abilityList.map((a) => (
                <AbilityPill key={a.name} ability={a} />
              ))}
            </div>

          </div>
        ) : null}
        <div className="answer-body">
          {answered ? (
            <p
              key={key}
              className={`verdict ${gaveUp ? "revealed" : wasCorrect ? "correct" : "wrong"}`}
              aria-live="polite"
            >
              {gaveUp ? "Revealed." : wasCorrect ? "Correct!" : "Not quite."}
            </p>
          ) : null}
          <div className={`region-buttons deck-${deck.id}${answered ? " answered" : ""}`}>
            {shownOptions.map((option) => (
              <button key={option.id} className={optionClass(option)} onClick={() => choose(option)}>
                {option.short}
              </button>
            ))}
          </div>
          {answered && nextIn ? <p className="due-note">This card comes back in {nextIn}.</p> : null}
        </div>
        <div className="card-actions">
          {answered ? (
            <button className="primary" onClick={() => next()}>
              Next Card
            </button>
          ) : (
            <>
              <button className="ghost" onClick={() => next()}>
                Skip
              </button>
              <button className="primary" disabled={!selection.length} onClick={submit}>
                Submit
              </button>
              <button className="ghost" onClick={giveUp}>
                Don&apos;t Know
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Flashcards;
