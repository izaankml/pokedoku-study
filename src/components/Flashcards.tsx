import { useCallback, useEffect, useRef, useState } from "react";
import { useStats } from "../StatsContext.ts";
import { pickFlashcard } from "../logic/picker.ts";
import {
  DECKS,
  DECK_BY_ID,
  FILTERABLE_DECKS,
  HISTORY_LIMIT,
  cardKey,
  comboDecks,
  filterFor,
  filterableOptions,
  loadFilters,
  passesFilter,
  saveFilters,
  saveSession,
  session,
} from "../logic/flashcards.ts";
import type { Card, CardState, Deck, DeckFilters, DeckOption, Picked } from "../logic/flashcards.ts";
import { hashStateFor, jumpToBrowse, useDetailHash, writeHash } from "../logic/hashState.ts";
import { formatInterval, intervalFor } from "../logic/schedule.ts";
import { POKEMON_BY_ID, pokemonBySlug, preloadSprite } from "../data/pokedex.ts";
import { CATEGORY_BY_ID, getCategory, typeClassOf } from "../data/categories.ts";
import { FLAGS } from "../data/types.ts";
import type { Flag, Pokemon } from "../data/types.ts";
import CategoryPill, { AbilityPill } from "./CategoryPill.tsx";
import type { PillCategory } from "./CategoryPill.tsx";
import PokemonAutocomplete from "./PokemonAutocomplete.tsx";
import PokemonCard from "./PokemonCard.tsx";
import PokemonDetail from "./PokemonDetail.tsx";
import ToggleGroup from "./ToggleGroup.tsx";

// the summary strip shows every group flag, in the canonical order
const GROUP_FLAGS: readonly Flag[] = FLAGS;
// Shown in the group slot when a Pokémon is in no group at all
const REGULAR: PillCategory = { id: "flag-regular", label: "Regular", short: "Regular", group: "special" };

// Typing, region and group of a Pokémon as pills, shown once a card is
// answered — the same strip whatever the deck asked: types on the left,
// region in the middle, group on the right, so the eye always finds each
// in the same place. Abilities follow as their own row of pills.
function summaryPills(pokemon: Pokemon): PillCategory[][] {
  const strips: PillCategory[][] = [
    pokemon.types.map((type) => getCategory(`type-${type}`)),
    pokemon.regions.map((region) => getCategory(`region-${region}`)),
    GROUP_FLAGS.filter((flag) => pokemon.flags.includes(flag)).map((flag) => getCategory(`flag-${flag}`)),
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
  const { merged, recordAttempt, undoLastAttempt, undoableAttempt } = useStats();
  // what each deck may ask about (persisted; empty = everything) —
  // declared before the card state, whose initializer picks under it
  const [filters, setFilters] = useState<DeckFilters>(loadFilters);
  const [showFilter, setShowFilter] = useState(false);
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
    (slug: string | null): Pokemon | null => (picked !== null ? pokemonBySlug(slug) : null),
    [picked],
  );
  const [detail, openDetail, closeDetail] = useDetailHash(resolve); // the open sheet's Pokémon

  function freshCard(forDeck: string, alsoExclude: number[] = [], withFilters: DeckFilters = filters): Card {
    const pick = pickFlashcard(merged, {
      deckId: forDeck,
      exclude: new Set([...session.recent, ...alsoExclude]),
      filters: withFilters,
    });
    return { deckId: pick.deck.id, pokemonId: pick.pokemon.id, param: pick.param };
  }

  // Include or exclude one subject of the current deck's filter. Takes
  // effect immediately: the lined-up card is re-picked, and so is the
  // current one if it no longer passes. The included set is derived from
  // filterFor — the same truth the checkboxes render — so stale stored
  // ids can never invert a toggle.
  function toggleFilter(optionId: string) {
    if (!filterDeck) return;
    const options = filterableOptions(filterDeck);
    const chosenNow = filterFor(filters, deckId);
    const active = chosenNow ? [...chosenNow] : options.map((option) => option.id);
    const nextList = active.includes(optionId) ? active.filter((id) => id !== optionId) : [...active, optionId];
    if (!nextList.length) return; // at least one subject stays on
    // everything selected = no filter; store [] so the panel reads clean
    const next = { ...filters, [deckId]: nextList.length === options.length ? [] : nextList };
    setFilters(next);
    saveFilters(next);
    session.next = null;
    if (answered || card.deckId !== deckId) return;
    if (!passesFilter(deck, pokemon, filterFor(next, deckId), card.param)) {
      commit(freshCard(deckId, [pokemon.id], next), null);
    }
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
      // a focused tab, deck chip or the Name deck's text box keeps its own
      // keyboard behaviour; with the detail sheet open, keys belong to it
      // (Escape closes)
      if (detail || document.activeElement?.closest(".tabs, .deck-picker, .autocomplete")) return;
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
      // all option buttons in DOM order — a Combo card has one grid per
      // section, and the arrows walk across them; ↑/↓ step by the
      // focused grid's column count
      const grids = [...document.querySelectorAll<HTMLElement>(".region-buttons")];
      const buttons = grids.flatMap((each) => [...each.querySelectorAll<HTMLElement>(".region-btn")]);
      if (!buttons.length) return;
      const focused = document.activeElement;
      const grid = grids.find((each) => focused instanceof HTMLElement && each.contains(focused)) ?? grids[0];
      const cols = parseInt(getComputedStyle(grid).getPropertyValue("--cols"), 10) || 1;
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
  // the Name deck types its answer instead of picking options
  const nameDeck = deck.input === "name";
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
    // the Name deck grades through its text box only — without this, the
    // Enter key could re-submit a selection restored by Undo
    if (answered || nameDeck || !selection.length) return;
    const token = recordAttempt({ categories: recordCategories, speciesId: key, correct: isRight(selection) });
    session.undo = { token, key };
    commit(card, selection);
  }

  // The Name deck grades the typed (or suggestion-tapped) Pokémon right
  // away, like Drill does.
  function gradeName(guess: Pokemon) {
    if (answered) return;
    const token = recordAttempt({ categories: recordCategories, speciesId: key, correct: guess.id === pokemon.id });
    session.undo = { token, key };
    commit(card, [String(guess.id)]);
  }

  // A submitted card can be taken back once — the grade is un-recorded
  // and the card returns unanswered with the picks still in place, so a
  // stray tap can be fixed and resubmitted.
  function undoSubmit() {
    const undo = session.undo;
    if (!undo || undo.key !== key) return;
    if (!undoLastAttempt(undo.token)) {
      // the attempt can no longer be reverted (superseded elsewhere) —
      // drop the stale undo and re-render so the button disappears
      session.undo = null;
      setSelection((current) => [...current]);
      return;
    }
    session.undo = null;
    // the Name deck's picked is a Pokémon id, not an option — nothing to
    // restore into the (empty) option grid
    commit(card, null, !nameDeck && Array.isArray(picked) ? picked : []);
  }

  function giveUp() {
    if (answered) return;
    // Don't Know is deliberate, not a misclick; recording it also
    // supersedes any pending undo
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
    setShowFilter(false); // the panel is per-deck
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
  // one grid of option buttons — the plain decks' whole answer area, and
  // each labelled section of a combo card
  const optionGrid = (gridDeck: Deck, options: DeckOption[]) => (
    <div className={`region-buttons deck-${gridDeck.id}${answered ? " answered" : ""}`}>
      {options.map((option) => (
        <button key={option.id} className={optionClass(option)} onClick={() => choose(option)}>
          {option.short}
        </button>
      ))}
    </div>
  );
  const guessedName =
    nameDeck && Array.isArray(picked) && picked.length ? POKEMON_BY_ID.get(Number(picked[0]))?.displayName : null;
  // the current deck's active filter (null = everything), its subjects,
  // and whether any deck is filtered — all cheap (filterableOptions is
  // cached per deck), so plain derivations beat memo bookkeeping
  const activeFilter = filterFor(filters, deckId);
  const filterDeck = DECK_BY_ID.get(deckId);
  const filterSubjects = filterDeck && FILTERABLE_DECKS.has(deckId) ? filterableOptions(filterDeck) : [];
  const anyDeckFiltered = DECKS.some((each) => filterFor(filters, each.id) !== null);
  const optionClass = (option: DeckOption): string => {
    let className = "region-btn";
    // a type option is type-coloured wherever it appears (Type, Matchup,
    // a Combo section, the answered reveal) — CategoryPill's rule exactly
    className += typeClassOf(CATEGORY_BY_ID.get(option.id));
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
      {/* per-deck filter: which of this deck's subjects may be asked */}
      {deckId !== "all" && FILTERABLE_DECKS.has(deckId) ? (
        <div className="deck-filter">
          <button
            className={`ghost small${activeFilter ? " on" : ""}`}
            aria-expanded={showFilter}
            aria-controls={showFilter ? "deck-filter-panel" : undefined}
            onClick={() => setShowFilter((visible) => !visible)}
          >
            Filter{activeFilter ? ` · ${activeFilter.size}` : ""}
          </button>
          {showFilter ? (
            <ToggleGroup
              id="deck-filter-panel"
              title="Ask only about"
              toggles={filterSubjects.map((option) => ({
                id: option.id,
                label: option.short,
                included: !activeFilter || activeFilter.has(option.id),
              }))}
              onToggle={toggleFilter}
              hint="Everything on means no filter. Progress still counts the same."
            />
          ) : null}
        </div>
      ) : deckId === "all" && anyDeckFiltered ? (
        // filters keep applying in the All mix; say so, since the panel
        // only shows on a single deck
        <p className="hint deck-filter-note">Some decks are filtered — open a deck to change its filter.</p>
      ) : null}
      <p className="hint card-question">{deck.question(card.param)}</p>
      {/* once answered, the card opens the detail sheet (evolution line and
          all); before that it stays inert so nothing gives the answer away —
          and on the Name deck the name itself is the answer */}
      <PokemonCard
        pokemon={pokemon}
        eager
        hint="View Detail"
        hideName={nameDeck && !answered}
        onClick={answered ? () => openDetail(pokemon) : undefined}
      />
      {detail ? <PokemonDetail pokemon={detail} onClose={closeDetail} onOpen={openDetail} /> : null}
      <div className={`answer-area${answered ? " answered" : ""}`}>
        {answered ? (
          <div className="card-facts">
            <div className="card-tags card-tags-spread">
              {/* pills jump to Browse: a type pill brings the whole typing
                  (a dual type browses both), the rest just themselves; the
                  "Regular" stand-in is no category, so it stays inert */}
              {summaryPills(pokemon).map((cats, index) => (
                <span key={index} className="tag-group">
                  {cats.map((category) => (
                    <CategoryPill
                      key={category.id}
                      cat={category}
                      useShort
                      onSelect={
                        category.id === REGULAR.id
                          ? undefined
                          : () =>
                              jumpToBrowse(
                                index === 0 ? pokemon.types.map((type) => `type-${type}`) : [category.id],
                              )
                      }
                    />
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
          {nameDeck && !answered ? (
            <PokemonAutocomplete onSubmit={gradeName} placeholder="Who's that Pokémon?" />
          ) : deck.id === "combo" && !answered ? (
            // a combo card: one option grid per asked group, labelled
            <div className="combo-sections">
              {comboDecks(card.param).map((sub) => (
                <div key={sub.id} className="combo-section">
                  <span className="tags-label">{sub.label}</span>
                  {optionGrid(sub, sub.options)}
                </div>
              ))}
            </div>
          ) : shownOptions.length ? (
            // the Name deck's answered state has no options at all — an
            // empty grid would still claim its reserved rows
            optionGrid(deck, shownOptions)
          ) : null}
          {nameDeck && answered && !gaveUp && !wasCorrect && guessedName ? (
            <p className="hint">You guessed {guessedName}.</p>
          ) : null}
          {answered && nextIn ? <p className="due-note">This card comes back in {nextIn}.</p> : null}
        </div>
        {/* ‹ sits on its own row above Skip/Submit, clear of the row it
            was too easy to hit by mistake in; one wrapper keeps the two
            rows together when .answer-area spreads its children out */}
        <div className="card-controls">
          <button
            className="ghost card-back"
            aria-label="Previous card"
            title="Previous card"
            disabled={!session.history.length}
            onClick={back}
          >
            ‹
          </button>
          <div className="card-actions">
            {answered ? (
              <>
                {/* only on the card it graded, and only while that Submit
                    is still the newest recorded attempt anywhere */}
                {!gaveUp && session.undo?.key === key && session.undo.token === undoableAttempt ? (
                  <button className="ghost" onClick={undoSubmit}>
                    Undo
                  </button>
                ) : null}
                <button className="primary" onClick={() => next()}>
                  Next Card
                </button>
              </>
            ) : (
              <>
                <button className="ghost" onClick={() => next()}>
                  Skip
                </button>
                {/* the Name deck submits from its text box */}
                {!nameDeck ? (
                  <button className="primary" disabled={!selection.length} onClick={submit}>
                    Submit
                  </button>
                ) : null}
                <button className="ghost" onClick={giveUp}>
                  Don&apos;t Know
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Flashcards;
