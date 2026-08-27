import { useCallback, useEffect, useRef, useState } from "react";
import { useStats } from "../StatsContext.ts";
import { pickFlashcard } from "../logic/picker.ts";
import {
  COMBO_IDS,
  DECKS,
  DECK_BY_ID,
  FOCUS_FACETS,
  SPECIAL_FLAGS,
  cardKey,
  comboParts,
  deckAnswers,
  deckLabel,
  dueCardCount,
  facetCategories,
  filterCount,
  focusPoolSize,
  isDeckId,
  isRightPick,
  loadCardFilter,
  matchesFocus,
  saveCardFilter,
  saveSession,
  session,
} from "../logic/flashcards.ts";
import type {
  Card,
  CardFilter,
  ComboVerdict,
  DashResult,
  Deck,
  DeckOption,
  FocusFacet,
  Picked,
} from "../logic/flashcards.ts";
import { hashStateFor, useDetailHash, writeHash } from "../logic/hashState.ts";
import { formatInterval, intervalFor } from "../logic/schedule.ts";
import { POKEMON_BY_ID, pokemonBySlug, preloadSprite } from "../data/pokedex.ts";
import { CATEGORY_BY_ID, getCategory, pillClassOf, typeClassOf } from "../data/categories.ts";
import type { Pokemon } from "../data/types.ts";
import CategoryPill from "./CategoryPill.tsx";
import type { PillCategory } from "./CategoryPill.tsx";
import PokemonDetail from "./PokemonDetail.tsx";
import PokemonName from "./PokemonName.tsx";
import Sprite from "./Sprite.tsx";
import { useModalShell } from "./useModalShell.ts";

const GAVE_UP = "gaveup";
// the sweep on the Next card bar runs 1.6s; the card follows just after
const AUTO_NEXT_MS = 1700;
const DASH_SLOTS = 10;
// Shown in the group slot when a Pokémon is in no group at all
const REGULAR: PillCategory = { id: "flag-regular", label: "Regular", short: "Regular", group: "special" };

const pokemonOf = (card: Card): Pokemon => {
  const pokemon = POKEMON_BY_ID.get(card.pokemonId);
  if (!pokemon) throw new Error(`unknown Pokémon on card: ${card.pokemonId}`);
  return pokemon;
};

// A deck named in the URL (#cards/region) wins over the remembered one.
function initialDeck(): string {
  const fromHash = hashStateFor("cards")?.[0];
  return fromHash !== undefined && isDeckId(fromHash) ? fromHash : session.deckId;
}

function Chevron() {
  return (
    <svg viewBox="0 0 12 8" width="11" height="8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M1.5 1.5 6 6l4.5-4.5" />
    </svg>
  );
}

interface DeckSheetProps {
  activeId: string;
  onPick: (deckId: string) => void;
  onClose: () => void;
}

// The bottom sheet the deck chooser opens: the four decks (and All),
// then the pairwise combos.
function DeckSheet({ activeId, onPick, onClose }: DeckSheetProps) {
  useModalShell(onClose);
  const rows = [
    { id: "all", label: "All", desc: "Every deck mixed together" },
    ...DECKS.map((deck) => ({ id: deck.id, label: deck.label, desc: deck.question })),
  ];
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Pick a deck" onClick={(event) => event.stopPropagation()}>
        <h3 className="sheet-title">Pick a deck</h3>
        <div className="deck-rows">
          {rows.map((row) => (
            <button
              key={row.id}
              className={`deck-row${activeId === row.id ? " active" : ""}`}
              onClick={() => onPick(row.id)}
            >
              <span className="deck-row-text">
                <span className="deck-row-label">{row.label}</span>
                <span className="deck-row-desc">{row.desc}</span>
              </span>
              {activeId === row.id ? <span className="deck-check">✓</span> : null}
            </button>
          ))}
        </div>
        <p className="sheet-kicker">Combo decks · answer both</p>
        <div className="combo-grid">
          {COMBO_IDS.map((id) => (
            <button key={id} className={`combo-cell${activeId === id ? " active" : ""}`} onClick={() => onPick(id)}>
              {deckLabel(id)}
              {activeId === id ? <span className="deck-check">✓</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface FilterSheetProps {
  deckId: string;
  filter: CardFilter;
  onToggle: (facet: FocusFacet, catId: string) => void;
  onClear: () => void;
  onDone: () => void;
}

// The Focus filters sheet: chip sections per facet — OR within a section,
// AND across sections. Selected chips take the category's pill styling.
function FilterSheet({ deckId, filter, onToggle, onClear, onDone }: FilterSheetProps) {
  useModalShell(onDone);
  return (
    <div className="sheet-backdrop" onClick={onDone}>
      <div className="sheet filter-sheet" role="dialog" aria-label="Focus filters" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-head">
          <h3 className="sheet-title">Focus filters</h3>
          <span className="filter-pool">{focusPoolSize(deckId, filter)} Pokémon in pool</span>
        </div>
        <p className="filter-help">
          Cards are drawn only from Pokémon matching every section you set. Empty sections match everything.
        </p>
        <div className="filter-scroll">
          {FOCUS_FACETS.map(([facet, label]) => (
            <div key={facet} className="filter-facet">
              <p className="sheet-kicker">{label}</p>
              <div className="filter-chips">
                {facetCategories(facet).map((category) => {
                  const on = filter[facet]?.includes(category.id) ?? false;
                  return (
                    <button
                      key={category.id}
                      className={on ? `focus-chip on pill${pillClassOf(category)}` : "focus-chip"}
                      aria-pressed={on}
                      onClick={() => onToggle(facet, category.id)}
                    >
                      {category.short.replace(/^Evolved by /, "")}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="sheet-foot">
          <button className="ghost" onClick={onClear}>
            Clear all
          </button>
          <button className="primary" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Flashcards() {
  const { merged, recordAttempt, undoLastAttempt, undoableAttempt } = useStats();
  // the persisted focus filter — declared before the card state, whose
  // initializer picks under it
  const [filter, setFilter] = useState<CardFilter>(loadCardFilter);
  const [deckSheet, setDeckSheet] = useState(false);
  const [filterSheet, setFilterSheet] = useState(false);
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
      session.selection = [];
      session.part = 0;
      session.partASel = [];
      session.picked = null;
      session.comboOk = null;
    }
    return session.card;
  });
  const [selection, setSelection] = useState<string[]>(session.selection);
  const [part, setPart] = useState<0 | 1>(session.part);
  const [partASel, setPartASel] = useState<string[]>(session.partASel);
  const [picked, setPicked] = useState<Picked>(session.picked);
  const [comboOk, setComboOk] = useState<ComboVerdict | null>(session.comboOk);
  const [dashes, setDashes] = useState<DashResult[]>(session.dashes);
  // the auto-advance sweep on the Next card bar: false = width 0, true = 100%
  const [autoFill, setAutoFill] = useState(false);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pokemon = pokemonOf(card);
  const parts = comboParts(card.deckId);
  // the deck whose options fill the pad right now (a combo's current part)
  const activeDeck: Deck = parts ? parts[part] : (DECK_BY_ID.get(card.deckId) as Deck);

  const answered = picked !== null;
  const gaveUp = picked === GAVE_UP;
  const key = cardKey(card.deckId, pokemon);
  // After answering, merged already reflects this attempt's new streak.
  const entry = merged.flashcards[key];
  const nextIn = answered && entry ? formatInterval(intervalFor(entry.s)) : null;
  const activeAnswers = activeDeck.answers(pokemon);
  const pickedIds = new Set(Array.isArray(picked) ? picked : []);
  const wasCorrect =
    answered &&
    !gaveUp &&
    (parts ? Boolean(comboOk && comboOk.a && comboOk.b) : isRightPick(activeDeck, [...pickedIds], activeAnswers));
  const filterN = filterCount(filter);
  const due = dueCardCount(merged);

  // The open sheet lives in the URL (#cards/region/pokemon-eevee) — only
  // once the card is answered, so nothing gives the answer away
  const resolve = useCallback(
    (slug: string | null): Pokemon | null => (picked !== null ? pokemonBySlug(slug) : null),
    [picked],
  );
  const [detail, openDetail, closeDetail] = useDetailHash(resolve);

  function freshCard(forDeck: string, alsoExclude: number[] = [], withFilter: CardFilter = filter): Card {
    const pick = pickFlashcard(merged, {
      deckId: forDeck,
      exclude: new Set([...session.recent, ...alsoExclude]),
      filter: withFilter,
    });
    return { deckId: pick.deckId, pokemonId: pick.pokemon.id };
  }

  // Writes the changed fields into the session (and localStorage) first,
  // then mirrors them into React state.
  function apply(changes: {
    card?: Card;
    selection?: string[];
    part?: 0 | 1;
    partASel?: string[];
    picked?: Picked;
    comboOk?: ComboVerdict | null;
    dashes?: DashResult[];
  }): void {
    Object.assign(session, changes);
    saveSession();
    if (changes.card !== undefined) setCard(changes.card);
    if (changes.selection !== undefined) setSelection(changes.selection);
    if (changes.part !== undefined) setPart(changes.part);
    if (changes.partASel !== undefined) setPartASel(changes.partASel);
    if (changes.picked !== undefined) setPicked(changes.picked);
    if (changes.comboOk !== undefined) setComboOk(changes.comboOk);
    if (changes.dashes !== undefined) setDashes(changes.dashes);
  }

  const cancelAuto = useCallback(() => {
    if (autoTimer.current !== null) clearTimeout(autoTimer.current);
    autoTimer.current = null;
    setAutoFill(false);
  }, []);
  // leaving the tab cancels the pending advance
  useEffect(() => cancelAuto, [cancelAuto]);

  function startAuto(): void {
    cancelAuto();
    // two frames so the bar mounts at width 0 before the sweep begins
    requestAnimationFrame(() => requestAnimationFrame(() => setAutoFill(true)));
    autoTimer.current = setTimeout(() => next(), AUTO_NEXT_MS);
  }

  // Line up the following card now and warm its sprite, so "Next" swaps
  // name and picture together instead of the picture trailing the name.
  useEffect(() => {
    const fits = (candidate: Card | null): candidate is Card =>
      candidate !== null &&
      (deckId === "all" ? comboParts(candidate.deckId) === null : candidate.deckId === deckId) &&
      candidate.pokemonId !== card.pokemonId &&
      matchesFocus(pokemonOf(candidate), filter);
    if (!fits(session.next)) session.next = freshCard(deckId, [card.pokemonId]);
    preloadSprite(pokemonOf(session.next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, deckId, filter]);

  // The deck lives in the URL (#cards/region) — replaced, not pushed, so
  // Back still leaves the tab
  useEffect(() => {
    writeHash("cards", deckId === "all" ? [] : [deckId]);
  }, [deckId]);

  // Enter moves the card along: Submit on a multi part with picks, Next
  // once answered. Capture phase, so a focused option button doesn't also
  // get "clicked".
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (detail || deckSheet || filterSheet) return;
      if (answered) {
        event.preventDefault();
        event.stopPropagation();
        next();
      } else if (activeDeck.multi && selection.length) {
        event.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  function grade(picks: string[]): void {
    if (answered) return;
    let ok: ComboVerdict | null = null;
    let correct: boolean;
    if (parts) {
      ok = {
        a: isRightPick(parts[0], partASel, parts[0].answers(pokemon)),
        b: isRightPick(parts[1], picks, parts[1].answers(pokemon)),
      };
      correct = ok.a && ok.b;
    } else {
      correct = isRightPick(activeDeck, picks, activeAnswers);
    }
    const token = recordAttempt({ categories: deckAnswers(card.deckId, pokemon), speciesId: key, correct });
    session.undo = { token, key };
    apply({
      selection: picks,
      picked: picks,
      comboOk: ok,
      dashes: [...dashes, correct ? ("correct" as const) : ("wrong" as const)].slice(-DASH_SLOTS),
    });
    if (correct) startAuto();
  }

  // Nothing is graded on a multi part's tap: options toggle until Submit.
  // A single-pick tap grades right away — or, on a combo's first part,
  // just moves to the second.
  function choose(option: DeckOption): void {
    if (answered) return;
    if (activeDeck.multi) {
      const nextSelection = selection.includes(option.id)
        ? selection.filter((id) => id !== option.id)
        : [...selection, option.id];
      apply({ selection: nextSelection });
    } else if (parts && part === 0) {
      apply({ partASel: [option.id], part: 1, selection: [] });
    } else {
      grade([option.id]);
    }
  }

  function submit(): void {
    if (answered || !activeDeck.multi || !selection.length) return;
    if (parts && part === 0) apply({ partASel: selection, part: 1, selection: [] });
    else grade(selection);
  }

  // Don't know reveals the whole card — a combo's pad jumps to part 2's
  // reveal, with part 1's answers in the fact pills.
  function giveUp(): void {
    if (answered) return;
    const token = recordAttempt({ categories: deckAnswers(card.deckId, pokemon), speciesId: key, correct: false });
    session.undo = { token, key };
    apply({
      picked: GAVE_UP,
      comboOk: null,
      part: parts ? 1 : part,
      dashes: [...dashes, "wrong" as const].slice(-DASH_SLOTS),
    });
  }

  // An answered card can be taken back once — the grade is un-recorded and
  // the card returns unanswered (a combo back on part 1, picks cleared).
  function undoAnswer(): void {
    const undo = session.undo;
    if (!undo || undo.key !== key) return;
    cancelAuto();
    if (!undoLastAttempt(undo.token)) {
      // the attempt can no longer be reverted (superseded elsewhere) —
      // drop the stale undo and re-render so the button disappears
      session.undo = null;
      setSelection((current) => [...current]);
      return;
    }
    session.undo = null;
    const restored = !parts && Array.isArray(picked) ? picked : [];
    apply({ picked: null, comboOk: null, part: 0, partASel: [], selection: restored, dashes: dashes.slice(0, -1) });
  }

  function next(forDeck: string = deckId): void {
    cancelAuto();
    session.recent = [...session.recent, pokemon.id].slice(-10);
    const lined = session.next;
    const upcoming =
      lined &&
      (forDeck === "all" ? comboParts(lined.deckId) === null : lined.deckId === forDeck) &&
      lined.pokemonId !== pokemon.id
        ? lined
        : freshCard(forDeck, [pokemon.id]);
    session.next = null;
    apply({ card: upcoming, selection: [], part: 0, partASel: [], picked: null, comboOk: null });
  }

  // Picking a deck deals afresh: an answered card is done, an unanswered
  // one gives way (the sheet is a deliberate reset).
  function changeDeck(id: string): void {
    cancelAuto();
    session.deckId = id;
    setDeckId(id);
    setDeckSheet(false);
    apply({ card: freshCard(id, [pokemon.id]), selection: [], part: 0, partASel: [], picked: null, comboOk: null });
  }

  // Chip toggles apply to the pool immediately; the current card is only
  // re-dealt when the sheet closes (doneFilters).
  function toggleFilterChip(facet: FocusFacet, catId: string): void {
    const current = filter[facet] ?? [];
    const nextIds = current.includes(catId) ? current.filter((id) => id !== catId) : [...current, catId];
    const nextFilter: CardFilter = { ...filter };
    if (nextIds.length) nextFilter[facet] = nextIds;
    else delete nextFilter[facet];
    setFilter(nextFilter);
    saveCardFilter(nextFilter);
    session.next = null;
  }

  function clearFilter(): void {
    setFilter({});
    saveCardFilter({});
    session.next = null;
  }

  function doneFilters(): void {
    setFilterSheet(false);
    if (!answered && !matchesFocus(pokemon, filter)) {
      apply({ card: freshCard(deckId, [pokemon.id]), selection: [], part: 0, partASel: [], picked: null, comboOk: null });
    }
  }

  // ---- derived view state ----

  const prompt = parts ? `${part + 1} of 2 · ${activeDeck.question}` : activeDeck.question;
  let verdictText: string | null = null;
  let verdictClass = "";
  if (answered) {
    if (gaveUp) {
      verdictText = "Revealed";
      verdictClass = "revealed";
    } else if (parts && comboOk) {
      verdictText = `${parts[0].label} ${comboOk.a ? "✓" : "✕"}  ·  ${parts[1].label} ${comboOk.b ? "✓" : "✕"}`;
      verdictClass = wasCorrect ? "correct" : "wrong";
    } else {
      verdictText = wasCorrect ? "✓ Correct" : "✕ Not quite";
      verdictClass = wasCorrect ? "correct" : "wrong";
    }
  }

  // The fact pills under the name: empty while asking; the Pokémon's
  // types, region, group (and stage, when the deck asked it) once
  // answered; part 1's picks during a combo's second part.
  const involvesStage = card.deckId === "stage" || Boolean(parts?.some((sub) => sub.id === "stage"));
  let factPills: PillCategory[] = [];
  if (answered) {
    const groupPills = SPECIAL_FLAGS.filter((flag) => pokemon.flags.includes(flag)).map((flag) =>
      getCategory(`flag-${flag}`),
    );
    factPills = [
      ...pokemon.types.map((type) => getCategory(`type-${type}`)),
      ...pokemon.regions.map((region) => getCategory(`region-${region}`)),
      ...(groupPills.length ? groupPills : [REGULAR]),
    ];
    if (involvesStage && pokemon.stage) factPills.push(getCategory(`stage-${pokemon.stage}`));
  } else if (parts && part === 1) {
    factPills = partASel.map(getCategory);
  }

  // Pad narrowing: a filtered single-answer facet shows only the selected
  // options — the pool is filtered by the same facet, so the correct
  // answer is always among them.
  const facetSel = activeDeck.multi ? [] : (filter[activeDeck.id as FocusFacet] ?? []);
  const shownOptions = facetSel.length
    ? activeDeck.options.filter((option) => facetSel.includes(option.id))
    : activeDeck.options;

  const optionClass = (option: DeckOption): string => {
    // a type option is type-coloured wherever it appears — CategoryPill's rule
    let cls = "pad-btn" + typeClassOf(CATEGORY_BY_ID.get(option.id));
    if (!answered) {
      if (selection.includes(option.id)) cls += " selected";
    } else {
      const right = activeAnswers.includes(option.id);
      if (right && pickedIds.has(option.id)) cls += " correct";
      else if (right) cls += " correct missed";
      else if (pickedIds.has(option.id)) cls += " wrong";
      else cls += " dim";
    }
    return cls;
  };

  const showSubmit = Boolean(activeDeck.multi);
  const submitLabel = parts && part === 0 ? "Next ›" : selection.length ? `Submit ${selection.length}` : "Submit";
  const canUndo = !gaveUp && session.undo?.key === key && session.undo.token === undoableAttempt;

  return (
    <div className="flashcards">
      <div className="cards-topbar">
        <button
          className="deck-choose"
          aria-haspopup="dialog"
          onClick={() => {
            cancelAuto();
            setDeckSheet(true);
          }}
        >
          {deckLabel(deckId)}
          <Chevron />
        </button>
        <button
          className={`filter-open${filterN ? " on" : ""}`}
          aria-label="Focus filters"
          aria-haspopup="dialog"
          onClick={() => {
            cancelAuto();
            setFilterSheet(true);
          }}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 5h16l-6.3 7.2V19l-3.4-1.8v-5L4 5Z" />
          </svg>
          {filterN ? <span className="filter-badge">{filterN}</span> : null}
        </button>
        <div className="dash-row" aria-hidden="true">
          {Array.from({ length: DASH_SLOTS }, (_, index) => (
            <span key={index} className={`dash${dashes[index] ? ` ${dashes[index]}` : ""}`} />
          ))}
        </div>
        <span className="due-count">{due} due</span>
      </div>

      <div className="card-stage">
        <p key={`${key}:${part}:${String(answered)}`} className={`card-prompt ${verdictClass}`} aria-live="polite">
          {verdictText ?? prompt}
        </p>
        <div className="stage-sprite">
          <Sprite pokemon={pokemon} eager />
        </div>
        {/* once answered, the name opens the detail sheet (evolution line
            and all); before that it stays inert so nothing gives the
            answer away */}
        <button className="stage-name" disabled={!answered} onClick={answered ? () => openDetail(pokemon) : undefined}>
          <PokemonName name={pokemon.displayName} />
          {answered ? <span className="stage-chevron">›</span> : null}
        </button>
        <div className="fact-pills">
          {factPills.map((category) => (
            <CategoryPill key={category.id} cat={category} useShort />
          ))}
        </div>
      </div>

      <div className="answer-pad">
        <div className={`pad-grid cols-${activeDeck.cols}`}>
          {shownOptions.map((option) => (
            <button key={option.id} className={optionClass(option)} disabled={answered} onClick={() => choose(option)}>
              {option.short}
            </button>
          ))}
        </div>
        <div className="pad-actions">
          {answered ? (
            <>
              {canUndo ? (
                <button className="pad-ghost" onClick={undoAnswer}>
                  Undo
                </button>
              ) : (
                <span />
              )}
              {nextIn ? (
                <span className="pad-note">
                  back in {nextIn}
                  {wasCorrect ? " · auto-next" : ""}
                </span>
              ) : null}
            </>
          ) : (
            <>
              <button className="pad-ghost" onClick={giveUp}>
                Don&apos;t know
              </button>
              {showSubmit ? (
                <button className="pad-submit" disabled={!selection.length} onClick={submit}>
                  {submitLabel}
                </button>
              ) : null}
              <button className="pad-ghost" onClick={() => next()}>
                Skip ›
              </button>
            </>
          )}
        </div>
      </div>

      {answered ? (
        <>
          <div className="next-spacer" aria-hidden="true" />
          <div className="next-bar">
            <button className="next-btn" onClick={() => next()}>
              <span className="next-fill" style={{ width: autoFill ? "100%" : "0%" }} aria-hidden="true" />
              <span className="next-label">Next card</span>
            </button>
          </div>
        </>
      ) : null}

      {deckSheet ? <DeckSheet activeId={deckId} onPick={changeDeck} onClose={() => setDeckSheet(false)} /> : null}
      {filterSheet ? (
        <FilterSheet
          deckId={deckId}
          filter={filter}
          onToggle={toggleFilterChip}
          onClear={clearFilter}
          onDone={doneFilters}
        />
      ) : null}
      {detail ? <PokemonDetail pokemon={detail} onClose={closeDetail} onOpen={openDetail} /> : null}
    </div>
  );
}

export default Flashcards;
