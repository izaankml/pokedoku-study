import { useCallback, useEffect, useRef, useState } from "react";
import { useStats } from "../StatsContext.ts";
import { pickFlashcard } from "../logic/picker.ts";
import { DECKS, DECK_BY_ID, HISTORY_LIMIT, cardKey, saveSession, session } from "../logic/flashcards.ts";
import type { Card, CardState, Deck, DeckOption, Picked } from "../logic/flashcards.ts";
import { hashStateFor, useDetailHash, writeHash } from "../logic/hashState.ts";
import { formatInterval, intervalFor } from "../logic/schedule.ts";
import { POKEMON_BY_ID, POKEMON_BY_NAME, preloadSprite } from "../data/pokedex.ts";
import { CATEGORIES } from "../data/categories.ts";
import type { Category } from "../data/categories.ts";
import type { Flag, Pokemon } from "../data/types.ts";
import CategoryPill, { AbilityPill } from "./CategoryPill.tsx";
import type { PillCategory } from "./CategoryPill.tsx";
import PokemonCard from "./PokemonCard.tsx";
import PokemonDetail from "./PokemonDetail.tsx";

const GROUP_FLAGS: Flag[] = ["legendary", "mythical", "ultraBeast", "paradox", "fossil", "starter", "baby", "mega", "gmax"];
const CAT = new Map<string, Category>(CATEGORIES.map((category) => [category.id, category]));
// Shown in the group slot when a Pokémon is in no group at all
const REGULAR: PillCategory = { id: "flag-regular", label: "Regular", short: "Regular", group: "special" };

const categoryOf = (id: string): Category => {
  const category = CAT.get(id);
  if (!category) throw new Error(`unknown category: ${id}`);
  return category;
};

// Typing, region and group of a Pokémon as pills, shown once a card is
// answered — the same strip whatever the deck asked: types on the left,
// region in the middle, group on the right, so the eye always finds each
// in the same place. Abilities follow as their own row of pills.
function summaryPills(pokemon: Pokemon): PillCategory[][] {
  const strips: PillCategory[][] = [
    pokemon.types.map((type) => categoryOf(`type-${type}`)),
    pokemon.regions.map((region) => categoryOf(`region-${region}`)),
    GROUP_FLAGS.filter((flag) => pokemon.flags.includes(flag)).map((flag) => categoryOf(`flag-${flag}`)),
  ];
  return strips.map((cats, index) => (index === 2 && !cats.length ? [REGULAR] : cats));
}

const GAVE_UP = "gaveup";

// A deck named in the URL (#cards/region) wins over the remembered one.
function initialDeck(): string {
  const fromHash = hashStateFor("cards")?.[0];
  return fromHash !== undefined && (fromHash === "all" || DECK_BY_ID.has(fromHash)) ? fromHash : session.deckId;
}

const pokemonOf = (card: Card): Pokemon => {
  const pokemon = POKEMON_BY_ID.get(card.pokemonId);
  if (!pokemon) throw new Error(`unknown Pokémon on card: ${card.pokemonId}`);
  return pokemon;
};
const deckOf = (card: Card): Deck => {
  const deck = DECK_BY_ID.get(card.deckId);
  if (!deck) throw new Error(`unknown deck on card: ${card.deckId}`);
  return deck;
};

function Flashcards() {
  const { merged, recordAttempt } = useStats();
  // The card lives in the module-level session (mirrored to localStorage)
  // so switching tabs and back, or reloading, shows the same card.
  const [deckId, setDeckId] = useState<string>(() => {
    const id = initialDeck();
    if (id !== session.deckId) {
      session.deckId = id;
      // a remembered card from another deck gives way to the URL's deck
      if (id !== "all" && session.card && session.card.deckId !== id) session.card = null;
    }
    return id;
  });
  const [card, setCard] = useState<Card>(() => {
    if (!session.card) {
      session.card = freshCard(session.deckId);
      session.picked = null;
      session.selection = [];
    }
    return session.card;
  });
  const [picked, setPicked] = useState<Picked>(session.picked);
  const [selection, setSelection] = useState<string[]>(session.selection);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const deck = deckOf(card);
  const pokemon = pokemonOf(card);

  // The open sheet lives in the URL (#cards/region/pokemon-eevee) — only
  // once the card is answered, so nothing gives the answer away (any
  // Pokémon then: a sheet's evolution tiles lead on to other sheets)
  const resolve = useCallback(
    (slug: string | null): Pokemon | null => (picked !== null && slug ? POKEMON_BY_NAME.get(slug) || null : null),
    [picked],
  );
  const [detail, openDetail, closeDetail] = useDetailHash(resolve); // the open sheet's Pokémon

  function freshCard(forDeck: string, alsoExclude: number[] = []): Card {
    const pick = pickFlashcard(merged, {
      deckId: forDeck,
      exclude: new Set([...session.recent, ...alsoExclude]),
    });
    return { deckId: pick.deck.id, pokemonId: pick.pokemon.id, param: pick.param };
  }

  // Line up the following card now and warm its sprite, so "Next" swaps
  // name and picture together instead of the picture trailing the name.
  useEffect(() => {
    const fits = (candidate: Card | null): candidate is Card =>
      candidate !== null && (deckId === "all" || candidate.deckId === deckId) && candidate.pokemonId !== card.pokemonId;
    if (!fits(session.next)) session.next = freshCard(deckId, [card.pokemonId]);
    preloadSprite(pokemonOf(session.next));
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
    const chip = row?.querySelector<HTMLElement>(".chip.active");
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    const target = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [deckId]);

  // Keyboard: arrows move focus over the options (←/→ one at a time, ↑/↓
  // a row), Space toggles the focused one (native button behaviour), and
  // Enter moves the card along — Submit once something is selected, Next
  // Card once answered — and Backspace/Delete take back the last pick. Cancelling Enter's default keeps a focused option
  // from also being "clicked".
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // a focused tab or deck chip keeps its own keyboard behaviour; with
      // the detail sheet open, keys belong to it (Escape closes)
      if (detail || document.activeElement?.closest(".tabs, .deck-picker")) return;
      if (event.key === "Enter") {
        if (picked !== null) {
          event.preventDefault();
          event.stopPropagation(); // even with the card itself focused (Space opens it)
          next();
        } else if (selection.length) {
          event.preventDefault();
          submit();
        }
        return;
      }
      if (picked !== null) return;
      // Backspace / Delete take back the last pick (Escape stays with the sheet)
      if (event.key === "Backspace" || event.key === "Delete") {
        if (selection.length) {
          event.preventDefault();
          undoPick();
        }
        return;
      }
      if (!event.key.startsWith("Arrow")) return;
      const grid = document.querySelector<HTMLElement>(".region-buttons");
      const buttons = grid ? [...grid.querySelectorAll<HTMLElement>(".region-btn")] : [];
      if (!grid || !buttons.length) return;
      const cols = parseInt(getComputedStyle(grid).getPropertyValue("--cols"), 10) || 1;
      const focused = document.activeElement;
      const at = focused instanceof HTMLElement ? buttons.indexOf(focused) : -1;
      const STEPS: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
      const step = STEPS[event.key];
      if (step === undefined) return;
      event.preventDefault();
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
  const isRight = (ids: string[]): boolean =>
    ids.length > 0 && ids.every((id) => answerIds.has(id)) && (!multi || ids.length === answerIds.size);
  const wasCorrect = answered && !gaveUp && isRight([...pickedIds]);

  function commit(nextCard: Card, nextPicked: Picked, nextSelection: string[] = []) {
    session.card = nextCard;
    session.picked = nextPicked;
    session.selection = nextSelection;
    saveSession();
    setCard(nextCard);
    setPicked(nextPicked);
    setSelection(nextSelection);
  }
  // this card as it stands, for the history
  const currentState = (): CardState => ({ card, picked, selection });

  // Nothing is graded on click: options toggle (multi decks) or swap
  // (single-pick decks) until Submit.
  function choose(option: DeckOption) {
    if (answered) return;
    let nextSelection: string[];
    if (selection.includes(option.id)) {
      nextSelection = selection.filter((id) => id !== option.id);
    } else if (multi) {
      const implied = deck.implies?.[option.id] || [];
      nextSelection = [...selection, option.id, ...implied.filter((id) => !selection.includes(id))];
    } else {
      nextSelection = [option.id];
    }
    session.selection = nextSelection;
    saveSession();
    setSelection(nextSelection);
  }

  // Backspace: drop the most recent pick, one at a time (on multi decks
  // implied picks sit after the one that implied them, so they go first)
  function undoPick() {
    if (answered || !selection.length) return;
    const nextSelection = selection.slice(0, -1);
    session.selection = nextSelection;
    saveSession();
    setSelection(nextSelection);
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

  // On to the next card: the one Back stepped away from, if any (as it was
  // left), else the one lined up. This card joins the history.
  function next(forDeck: string = deckId) {
    session.recent = [...session.recent, pokemon.id].slice(-10);
    session.history = [...session.history, currentState()].slice(-HISTORY_LIMIT);
    const ahead = session.forward.pop();
    if (ahead) {
      commit(ahead.card, ahead.picked, ahead.selection);
      return;
    }
    const upcoming =
      session.next && (forDeck === "all" || session.next.deckId === forDeck) && session.next.pokemonId !== pokemon.id
        ? session.next
        : freshCard(forDeck);
    session.next = null;
    commit(upcoming, null);
  }

  // Back to the previous card, as it was left (answered cards stay
  // answered); this card waits ahead for Next
  function back() {
    const previous = session.history[session.history.length - 1];
    if (!previous) return;
    session.history = session.history.slice(0, -1);
    session.forward = [...session.forward, currentState()];
    commit(previous.card, previous.picked, previous.selection);
  }

  function changeDeck(id: string) {
    session.deckId = id;
    session.forward = []; // cards stepped away from may not fit the new deck
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
    ? deck.options.filter((option) => answerIds.has(option.id) || pickedIds.has(option.id))
    : deck.options;
  const optionClass = (option: DeckOption): string => {
    let className = "region-btn";
    if (deck.id === "type") className += ` type-${option.id.slice(5)}`;
    if (answered) {
      if (answerIds.has(option.id)) className += pickedIds.has(option.id) ? " correct" : " correct missed";
      else if (pickedIds.has(option.id)) className += " wrong";
    } else if (selection.includes(option.id)) {
      className += " selected";
    }
    return className;
  };

  return (
    <div className="flashcards">
      <div className="deck-picker" role="tablist" aria-label="Deck" ref={pickerRef}>
        {/* tapping the deck already in play deselects it: back to All */}
        {[{ id: "all", label: "All" }, ...DECKS].map((option) => (
          <button
            key={option.id}
            role="tab"
            aria-selected={deckId === option.id}
            className={`chip${deckId === option.id ? " active" : ""}`}
            onClick={() => changeDeck(deckId === option.id && option.id !== "all" ? "all" : option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="hint card-question">{deck.question(card.param)}</p>
      {/* once answered, the card opens the detail sheet (evolution line and
          all); before that it stays inert so nothing gives the answer away */}
      <PokemonCard pokemon={pokemon} eager hint="View Detail" onClick={answered ? () => openDetail(pokemon) : undefined} />
      {detail ? <PokemonDetail pokemon={detail} onClose={closeDetail} onOpen={openDetail} /> : null}
      <div className={`answer-area${answered ? " answered" : ""}`}>
        {answered ? (
          <div className="card-facts">
            <div className="card-tags card-tags-spread">
              {summaryPills(pokemon).map((cats, index) => (
                <span key={index} className="tag-group">
                  {cats.map((category) => (
                    <CategoryPill key={category.id} cat={category} useShort />
                  ))}
                </span>
              ))}
            </div>
            <div className="card-tags">
              <span className="tags-label">Abilities</span>
              {pokemon.abilityList.map((ability) => (
                <AbilityPill key={ability.name} ability={ability} />
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
          <button
            className="ghost card-back"
            aria-label="Previous card"
            title="Previous card"
            disabled={!session.history.length}
            onClick={back}
          >
            ‹
          </button>
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
