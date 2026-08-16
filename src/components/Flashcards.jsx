import { useEffect, useRef, useState } from "react";
import { useStats } from "../StatsContext.js";
import { pickFlashcard } from "../logic/picker.js";
import { DECKS, DECK_BY_ID, cardKey, session } from "../logic/flashcards.js";
import { formatInterval, intervalFor } from "../logic/schedule.js";
import { POKEMON_BY_ID, preloadSprite } from "../data/pokedex.js";
import { CATEGORIES } from "../data/categories.js";
import CategoryPill from "./CategoryPill.jsx";
import PokemonCard from "./PokemonCard.jsx";

const GROUP_FLAGS = ["legendary", "mythical", "ultraBeast", "paradox", "fossil", "starter", "baby"];
const CAT = new Map(CATEGORIES.map((c) => [c.id, c]));

// Typing, region and group of a Pokémon as pills, shown once a card is
// answered — a reminder of what else PokeDoku can ask about it. Whatever
// the card itself asked (its answers) is left out; the buttons show that.
const abilityText = (p) =>
  p.abilityList.map((a) => (a.hidden ? `${a.name} (hidden)` : a.name)).join(" · ");
function summaryPills(p, except) {
  return [
    ...p.types.map((t) => CAT.get(`type-${t}`)),
    ...p.regions.map((r) => CAT.get(`region-${r}`)),
    ...GROUP_FLAGS.filter((f) => p.flags.includes(f)).map((f) => CAT.get(`flag-${f}`)),
  ].filter((c) => !except.has(c.id));
}

const GAVE_UP = "gaveup";

function Flashcards() {
  const { merged, recordAttempt } = useStats();
  // The card lives in the module-level session so switching tabs and back
  // shows the same card, answered or not.
  const [deckId, setDeckId] = useState(session.deckId);
  const [card, setCard] = useState(() => {
    if (!session.card) session.card = freshCard(session.deckId);
    return session.card;
  });
  const [picked, setPicked] = useState(session.picked);
  const [selection, setSelection] = useState(session.selection);
  const pickerRef = useRef(null);

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

  // On phones the deck row scrolls sideways; keep the active chip in view
  // (coming back to the tab with "Ability" selected shouldn't hide it).
  useEffect(() => {
    const row = pickerRef.current;
    const chip = row?.querySelector(".chip.active");
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    const target = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [deckId]);

  // Enter moves the card along from the keyboard: Check once something is
  // selected, Next Card once answered. Cancelling the default keeps a
  // focused option button from also being "clicked".
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.altKey) return;
      // Enter on a focused tab or deck chip still activates that
      if (document.activeElement?.closest(".tabs, .deck-picker")) return;
      if (picked !== null) {
        e.preventDefault();
        next();
      } else if (DECK_BY_ID.get(card.deckId).multi && selection.length) {
        e.preventDefault();
        check();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const deck = DECK_BY_ID.get(card.deckId);
  const pokemon = POKEMON_BY_ID.get(card.pokemonId);
  const answerIds = new Set(deck.answers(pokemon, card.param));
  const recordCategories = deck.categories(pokemon, card.param);
  const key = cardKey(deck, pokemon);
  // After answering, merged already reflects this attempt's new streak.
  const entry = merged.flashcards[key];
  const nextIn = picked && entry ? formatInterval(intervalFor(entry.s)) : null;
  const answered = picked !== null;
  const gaveUp = picked === GAVE_UP;
  const pickedIds = new Set(Array.isArray(picked) ? picked : picked && !gaveUp ? [picked] : []);
  const multi = Boolean(deck.multi);
  const wasCorrect =
    answered && !gaveUp && pickedIds.size === answerIds.size && [...pickedIds].every((id) => answerIds.has(id));

  function commit(nextCard, nextPicked) {
    session.card = nextCard;
    session.picked = nextPicked;
    session.selection = [];
    setCard(nextCard);
    setPicked(nextPicked);
    setSelection([]);
  }

  function choose(option) {
    if (answered) return;
    if (multi) {
      const implied = deck.implies?.[option.id] || [];
      let next;
      if (selection.includes(option.id)) {
        next = selection.filter((id) => id !== option.id);
      } else {
        next = [...selection, option.id, ...implied.filter((id) => !selection.includes(id))];
      }
      session.selection = next;
      setSelection(next);
      return;
    }
    const correct = answerIds.has(option.id);
    recordAttempt({ categories: recordCategories, speciesId: key, correct });
    commit(card, option.id);
  }

  // Multi decks: right only when the selection matches every answer
  function check() {
    if (answered || !selection.length) return;
    const correct = selection.length === answerIds.size && selection.every((id) => answerIds.has(id));
    recordAttempt({ categories: recordCategories, speciesId: key, correct });
    commit(card, selection);
  }

  function giveUp() {
    if (answered) return;
    recordAttempt({ categories: recordCategories, speciesId: key, correct: false });
    commit(card, GAVE_UP);
  }

  function next() {
    session.recent = [...session.recent, pokemon.id].slice(-10);
    const upcoming =
      session.next && (deckId === "all" || session.next.deckId === deckId) && session.next.pokemonId !== pokemon.id
        ? session.next
        : freshCard(deckId);
    session.next = null;
    commit(upcoming, null);
  }

  function changeDeck(id) {
    session.deckId = id;
    setDeckId(id);
    // An unanswered card from another deck is replaced; an answered one
    // stays until "Next" so the result remains visible.
    if (!answered && id !== "all" && card.deckId !== id) commit(freshCard(id), null);
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

  const facts = [
    deck.id === "method" && pokemon.evoDetail ? `Evolves: ${pokemon.evoDetail}` : null,
    `Abilities: ${abilityText(pokemon)}`,
  ].filter(Boolean);

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
      <PokemonCard pokemon={pokemon} eager />
      <div className={`answer-area${answered ? " answered" : ""}`}>
        {answered ? (
          <>
            <div className="card-facts">
              <div className="card-tags">
                {summaryPills(pokemon, answerIds).map((c) => (
                  <CategoryPill key={c.id} cat={c} useShort />
                ))}
              </div>
              {facts.map((line) => (
                <p key={line} className="card-extra">
                  {line}
                </p>
              ))}
            </div>
            <p
              key={key}
              className={`verdict ${gaveUp ? "revealed" : wasCorrect ? "correct" : "wrong"}`}
              aria-live="polite"
            >
              {gaveUp ? "Revealed." : wasCorrect ? "Correct!" : "Not quite."}
            </p>
          </>
        ) : null}
        <div className={`region-buttons deck-${deck.id}${answered ? " answered" : ""}`}>
          {shownOptions.map((option) => (
            <button key={option.id} className={optionClass(option)} onClick={() => choose(option)}>
              {option.short}
            </button>
          ))}
        </div>
        {answered && nextIn ? <p className="due-note">This card comes back in {nextIn}.</p> : null}
        <div className="card-actions">
          {answered ? (
            <button className="primary" onClick={next}>
              Next Card
            </button>
          ) : (
            <>
              {multi ? (
                <button className="primary" disabled={!selection.length} onClick={check}>
                  Check
                </button>
              ) : null}
              <button className="ghost" onClick={next}>
                Skip
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
