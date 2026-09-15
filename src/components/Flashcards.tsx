import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useStats } from "../StatsContext.ts";
import { pickFlashcard } from "../logic/picker.ts";
import {
  COMBO_IDS,
  DECKS,
  DECK_BY_ID,
  FOCUS_FACETS,
  HISTORY_MAX,
  SPECIAL_FLAGS,
  cardKey,
  dealtDeckIds,
  deckCategories,
  deckLabel,
  deckParts,
  deckPicks,
  dueCardCount,
  facetCategories,
  filterCount,
  focusPoolSize,
  isDeckId,
  isNature,
  isNatureDeck,
  isRightPick,
  loadCardFilter,
  loadSilhouette,
  matchesFocus,
  partAnswers,
  saveCardFilter,
  saveSession,
  saveSilhouette,
  session,
  subjectOf,
} from "../logic/flashcards.ts";
import type {
  Card,
  CardFilter,
  ComboVerdict,
  DashResult,
  Deck,
  DeckOption,
  FocusFacet,
  PastCard,
  Picked,
  SubjectId,
} from "../logic/flashcards.ts";
import { hashStateFor, useDetailHash, writeHash } from "../logic/hashState.ts";
import { findByName, namesSpeciesOnly, nearMiss, wordBag } from "../logic/matching.ts";
import { formatInterval, intervalFor } from "../logic/schedule.ts";
import { preloadSprite } from "../logic/sprites.ts";
import { STAT_LABELS } from "../data/natures.ts";
import { POKEMON_BY_ID, pokemonBySlug } from "../data/pokedex.ts";
import { CATEGORY_BY_ID, getCategory, pillClassOf, typeClassOf } from "../data/categories.ts";
import type { Pokemon } from "../data/types.ts";
import CategoryPill, { TypeIcon } from "./CategoryPill.tsx";
import type { PillCategory } from "./CategoryPill.tsx";
import Chevron from "./Chevron.tsx";
import NameInput from "./NameInput.tsx";
import NatureCard from "./NatureCard.tsx";
import PokemonCard from "./PokemonCard.tsx";
import PokemonDetail from "./PokemonDetail.tsx";
import { useModalShell } from "./useModalShell.ts";
import { useNow } from "./useNow.ts";

const GAVE_UP = "gaveup";
// how far the page runs past the screen (0 when everything fits)
const pageOverflow = (): number => document.documentElement.scrollHeight - window.innerHeight;
// Who's That keeps what was typed in the card's picks behind this prefix,
// after the Pokémon it resolved to (or alone, for a name that is nobody's),
// so the summary can quote it
const TYPED = "typed:";
const TYPED_MAX = 40;

// Who's That's two second chances: the species named without its form,
// and a misspelling of some Pokémon's name. Neither is graded; the card
// says so under the box and waits for another go
type NudgeKind = "form" | "spelling";
interface Nudge {
  key: string;
  kind: NudgeKind;
  // which submit it came from, so a repeat shows again
  at: number;
}
const NUDGE_TEXT: Record<NudgeKind, string> = {
  form: "Right species, but which form?",
  spelling: "Check your spelling.",
};
const DASH_SLOTS = 10;
// Shown in the group slot when a Pokémon is in no group at all
const REGULAR: PillCategory = { id: "flag-regular", label: "Regular", short: "Regular", group: "special" };

// A deck named in the URL (#cards/region) wins over the remembered one.
function initialDeck(): string {
  const fromHash = hashStateFor("cards")?.[0];
  return fromHash !== undefined && isDeckId(fromHash) ? fromHash : session.deckId;
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
    ...DECKS.map((deck) => ({
      id: deck.id,
      label: deck.label,
      desc: deck.questionNote ? `${deck.question} (${deck.questionNote})` : deck.question,
    })),
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

// The Focus filters sheet: chip sections per facet, OR within a section
// and AND across sections. Selected chips take the category's pill styling.
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
                      {on && category.group === "type" ? <TypeIcon type={category.id.slice(5)} /> : null}
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
  // the persisted focus filter, declared before the card state because the
  // card's initializer picks under it
  const [filter, setFilter] = useState<CardFilter>(loadCardFilter);
  // Who's That: silhouette (the default) or the sprite in full
  const [silhouette, setSilhouette] = useState<boolean>(loadSilhouette);
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
  // The live card: the one being asked, or just answered
  const [liveCard, setLiveCard] = useState<Card>(() => {
    if (!session.card) {
      session.card = freshCard(session.deckId);
      session.selection = [];
      session.picked = null;
      session.comboOk = null;
    }
    return session.card;
  });
  const [liveSelection, setLiveSelection] = useState<string[]>(session.selection);
  const [livePicked, setLivePicked] = useState<Picked>(session.picked);
  const [liveComboOk, setLiveComboOk] = useState<ComboVerdict | null>(session.comboOk);
  const [dashes, setDashes] = useState<DashResult[]>(session.dashes);
  const [history, setHistory] = useState<PastCard[]>(session.history);
  const [viewing, setViewing] = useState<number | null>(session.viewing);
  // Who's That's typed answer, kept with the card it's for: a new card
  // starts blank, an undone one has its text back
  const [typedFor, setTypedFor] = useState<{ key: string; text: string }>({ key: "", text: "" });
  // the last submit's second chance, if it gave one (see NudgeKind)
  const [nudge, setNudge] = useState<Nudge | null>(null);

  // What's on the table: the live card, or an earlier one Back stepped to,
  // shown as it was graded and read-only
  const past: PastCard | undefined = viewing !== null ? history[viewing] : undefined;
  const live = past === undefined;
  const card = past ? past.card : liveCard;
  const picked: Picked = past ? past.picked : livePicked;
  const comboOk = past ? past.comboOk : liveComboOk;
  const selection = past ? (Array.isArray(past.picked) ? past.picked : []) : liveSelection;

  // what the card is about: a Pokémon, or on the Natures deck a nature
  const subject = subjectOf(card);
  const pokemon = isNature(subject) ? null : subject;
  const nature = isNature(subject) ? subject : null;
  const parts = deckParts(card.deckId);
  // the deck whose options fill the pad; a combo's two (or the Natures
  // deck's), each on its own pad
  const padDecks: [Deck] | [Deck, Deck] = parts ?? [DECK_BY_ID.get(card.deckId) as Deck];
  // Who's That types its answer instead of picking options, and hides the
  // name until answered, and the sprite's colours too while the silhouette
  // is on
  const nameDeck = !parts && padDecks[0].input === "name";
  const mystery = nameDeck && picked === null;
  const silhouetted = mystery && silhouette;

  const answered = picked !== null;
  const gaveUp = picked === GAVE_UP;
  const key = cardKey(card.deckId, subject);
  const typed = typedFor.key === key ? typedFor.text : "";
  // the nudge belongs to the live card while it's still being asked
  const shownNudge = nudge !== null && nudge.key === key && live && picked === null ? nudge : null;
  // After answering, merged already reflects this attempt's new streak.
  const entry = merged.flashcards[key];
  const nextIn = answered && entry ? formatInterval(intervalFor(entry.s)) : null;
  const pickedList = Array.isArray(picked) ? picked : [];
  const pickedIds = new Set(pickedList);
  const wasCorrect =
    answered &&
    !gaveUp &&
    (parts
      ? Boolean(comboOk && comboOk.a && comboOk.b)
      : isRightPick(padDecks[0], pickedList, partAnswers(padDecks[0], subject)));
  // Submit stands ready once a multi deck has a pick, a combo has one on
  // each pad, or Who's That has a name typed (a plain single-pick deck
  // grades on the tap instead)
  const canSubmit =
    !answered &&
    (parts
      ? parts.every((deck) => deckPicks(deck, selection).length > 0)
      : nameDeck
        ? typed.trim().length > 0
        : Boolean(padDecks[0].multi) && selection.length > 0);
  // The tile fills the free space over the answer card while the card is
  // being asked (see .stage-tile) and is held at that height once
  // answered, so it stays where it was as the options collapse. A held
  // tile that would push the answered card off the screen (a one-row
  // pad gains the pills and the summary) gives the overflow back, down
  // to the tile's set height.
  const tileRef = useRef<HTMLDivElement>(null);
  const [asked, setAsked] = useState<{ height: number; overflow: number; floor: number } | null>(null);
  useEffect(() => {
    const tile = tileRef.current;
    if (answered || !tile) return undefined;
    const observer = new ResizeObserver(() => {
      setAsked({
        height: tile.getBoundingClientRect().height,
        overflow: pageOverflow(),
        floor: parseFloat(getComputedStyle(tile).minHeight) || 0,
      });
    });
    observer.observe(tile);
    return () => observer.disconnect();
  }, [answered]);
  const heldTileHeight = answered && asked ? asked.height : null;
  useLayoutEffect(() => {
    const tile = tileRef.current;
    if (!answered || !asked || !tile) return;
    const excess = pageOverflow() - asked.overflow;
    if (excess > 0) tile.style.height = `${Math.max(asked.floor, asked.height - excess)}px`;
  }, [answered, asked]);
  const filterN = filterCount(filter);
  const deckInPlay = DECK_BY_ID.get(deckId);
  const filterable = !(deckInPlay && isNatureDeck(deckInPlay));
  // the due cards this deck and filter can deal, which the picker deals
  // first. Walking the pools is costly, so this recomputes only when the
  // stats, deck or filter change, or once a minute for cards falling due
  const now = useNow(60_000);
  const due = useMemo(() => dueCardCount(merged, now, { deckId, filter }), [merged, now, deckId, filter]);

  // The open sheet lives in the URL (#cards/region/pokemon-eevee), but only
  // once the card is answered, so nothing gives the answer away
  const resolve = useCallback(
    (slug: string | null): Pokemon | null => (picked !== null ? pokemonBySlug(slug) : null),
    [picked],
  );
  const [detail, openDetail, closeDetail] = useDetailHash(resolve);

  function freshCard(forDeck: string, alsoExclude: SubjectId[] = [], withFilter: CardFilter = filter): Card {
    const pick = pickFlashcard(merged, {
      deckId: forDeck,
      exclude: new Set([...session.recent, ...alsoExclude]),
      filter: withFilter,
    });
    return { deckId: pick.deckId, subjectId: pick.subject.id };
  }

  // Whether a card lined up earlier is still one `forDeck` would deal
  // (All: any single deck the focus filter leaves in the mix)
  const inPlay = (candidate: Card, forDeck: string): boolean =>
    forDeck === "all" ? dealtDeckIds("all", filter).includes(candidate.deckId) : candidate.deckId === forDeck;

  // Writes the changed fields into the session (and localStorage) first,
  // then mirrors them into React state.
  function apply(changes: {
    card?: Card;
    selection?: string[];
    picked?: Picked;
    comboOk?: ComboVerdict | null;
    dashes?: DashResult[];
    history?: PastCard[];
    viewing?: number | null;
  }): void {
    Object.assign(session, changes);
    saveSession();
    if (changes.card !== undefined) setLiveCard(changes.card);
    if (changes.selection !== undefined) setLiveSelection(changes.selection);
    if (changes.picked !== undefined) setLivePicked(changes.picked);
    if (changes.comboOk !== undefined) setLiveComboOk(changes.comboOk);
    if (changes.dashes !== undefined) setDashes(changes.dashes);
    if (changes.history !== undefined) setHistory(changes.history);
    if (changes.viewing !== undefined) setViewing(changes.viewing);
  }

  // Line up the following card now and warm its sprite, so "Next" swaps
  // name and picture together instead of the picture trailing the name.
  useEffect(() => {
    const fits = (candidate: Card | null): candidate is Card =>
      candidate !== null &&
      inPlay(candidate, deckId) &&
      candidate.subjectId !== liveCard.subjectId &&
      matchesFocus(subjectOf(candidate), filter);
    if (!fits(session.next)) session.next = freshCard(deckId, [liveCard.subjectId]);
    const upcoming = subjectOf(session.next);
    if (!isNature(upcoming)) preloadSprite(upcoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- freshCard reads the live stats; only a new card, deck or filter should line up again
  }, [liveCard, deckId, filter]);

  // The deck lives in the URL (#cards/region), replaced rather than pushed
  // so Back still leaves the tab
  useEffect(() => {
    writeHash("cards", deckId === "all" ? [] : [deckId]);
  }, [deckId]);

  // Enter moves the card along: Submit where it stands ready, Next once
  // answered. Capture phase, so a focused option button doesn't also get
  // "clicked".
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (detail || deckSheet || filterSheet) return;
      if (answered) {
        event.preventDefault();
        event.stopPropagation();
        next();
      } else if (canSubmit) {
        event.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // Grades the picks (a combo's two pads together, each part against its
  // own options) and records the attempt.
  function grade(picks: string[]): void {
    if (!live || answered) return;
    let ok: ComboVerdict | null = null;
    let correct: boolean;
    if (parts) {
      ok = {
        a: isRightPick(parts[0], deckPicks(parts[0], picks), partAnswers(parts[0], subject)),
        b: isRightPick(parts[1], deckPicks(parts[1], picks), partAnswers(parts[1], subject)),
      };
      correct = ok.a && ok.b;
    } else {
      correct = isRightPick(padDecks[0], picks, partAnswers(padDecks[0], subject));
    }
    const token = recordAttempt({ categories: deckCategories(card.deckId, subject), speciesId: key, correct });
    session.undo = { token, key };
    setNudge(null);
    apply({
      selection: picks,
      picked: picks,
      comboOk: ok,
      dashes: [...dashes, correct ? ("correct" as const) : ("wrong" as const)].slice(-DASH_SLOTS),
    });
  }

  // Who's That: the typed name is graded against the card's Pokémon and its
  // lookalikes. Naming the species without its form, or misspelling a name,
  // gets another go instead of a grade; anything else is graded and kept
  // for the summary
  function submitName(): void {
    const text = typed.trim().slice(0, TYPED_MAX);
    const answers = partAnswers(padDecks[0], subject);
    const match = findByName(text);
    if (!match || !answers.includes(String(match.id))) {
      const accepted = answers.map((id) => POKEMON_BY_ID.get(Number(id))).filter((each) => each !== undefined);
      let kind: NudgeKind | null = null;
      if (accepted.some((each) => namesSpeciesOnly(text, each))) kind = "form";
      else if (!match && nearMiss(text)) kind = "spelling";
      if (kind) {
        setNudge({ key, kind, at: (nudge?.at ?? 0) + 1 });
        return;
      }
    }
    grade(match ? [String(match.id), `${TYPED}${text}`] : [`${TYPED}${text}`]);
  }

  // A multi pad's options toggle until Submit. A single-pick tap grades
  // right away, except on a combo, where it stands as that pad's one pick
  // until both pads are submitted together.
  function choose(deck: Deck, option: DeckOption): void {
    if (!live || answered) return;
    if (deck.multi) {
      const nextSelection = selection.includes(option.id)
        ? selection.filter((id) => id !== option.id)
        : [...selection, option.id];
      apply({ selection: nextSelection });
    } else if (parts) {
      const replaced = deckPicks(deck, selection);
      apply({ selection: [...selection.filter((id) => !replaced.includes(id)), option.id] });
    } else {
      grade([option.id]);
    }
  }

  function submit(): void {
    if (!canSubmit) return;
    if (nameDeck) submitName();
    else grade(selection);
  }

  // Don't Know reveals the whole card, a combo's two pads at once.
  function giveUp(): void {
    if (!live || answered) return;
    const token = recordAttempt({ categories: deckCategories(card.deckId, subject), speciesId: key, correct: false });
    session.undo = { token, key };
    setNudge(null);
    apply({
      picked: GAVE_UP,
      comboOk: null,
      dashes: [...dashes, "wrong" as const].slice(-DASH_SLOTS),
    });
  }

  // An answered card can be taken back once: the grade is un-recorded and
  // the card returns unanswered with its picks back in place.
  function undoAnswer(): void {
    const undo = session.undo;
    if (!live || !undo || undo.key !== key) return;
    if (!undoLastAttempt(undo.token)) {
      // superseded elsewhere: drop the stale undo and re-render so the
      // button disappears
      session.undo = null;
      setLiveSelection((current) => [...current]);
      return;
    }
    session.undo = null;
    apply({ picked: null, comboOk: null, selection: pickedList, dashes: dashes.slice(0, -1) });
  }

  // The history with the live card added, once it's answered
  function settled(): PastCard[] {
    if (livePicked === null) return history;
    return [...history, { card: liveCard, picked: livePicked, comboOk: liveComboOk }].slice(-HISTORY_MAX);
  }

  // On to the next card, or, from an earlier card, forward through the
  // history and back to the live one
  function next(forDeck: string = deckId): void {
    if (!live) {
      apply({ viewing: viewing !== null && viewing + 1 < history.length ? viewing + 1 : null });
      return;
    }
    session.recent = [...session.recent, subject.id].slice(-10);
    const lined = session.next;
    const upcoming =
      lined && inPlay(lined, forDeck) && lined.subjectId !== subject.id ? lined : freshCard(forDeck, [subject.id]);
    session.next = null;
    apply({ card: upcoming, selection: [], picked: null, comboOk: null, history: settled(), viewing: null });
  }

  // Back to the card before this one, as it was graded
  function back(): void {
    if (live) {
      if (history.length) apply({ viewing: history.length - 1 });
    } else if (viewing !== null && viewing > 0) {
      apply({ viewing: viewing - 1 });
    }
  }
  const canBack = live ? history.length > 0 : viewing !== null && viewing > 0;

  // Picking a deck deals afresh: an answered card is done (kept for
  // Back), an unanswered one gives way (the sheet is a deliberate reset).
  function changeDeck(id: string): void {
    session.deckId = id;
    setDeckId(id);
    setDeckSheet(false);
    apply({
      card: freshCard(id, [liveCard.subjectId]),
      selection: [],
      picked: null,
      comboOk: null,
      history: settled(),
      viewing: null,
    });
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
    const stays = matchesFocus(subjectOf(liveCard), filter) && inPlay(liveCard, deckId);
    if (livePicked === null && !stays) {
      apply({ card: freshCard(deckId, [liveCard.subjectId]), selection: [], picked: null, comboOk: null, viewing: null });
    }
  }

  // The eye button on the Who's That pad: silhouette on or off, for this
  // card and the ones after it
  function toggleSilhouette(): void {
    const next = !silhouette;
    setSilhouette(next);
    saveSilhouette(next);
  }

  // ---- derived view state ----

  // a deck's question, its aside ("pick all") dimmed after it
  const questionOf = (deck: Deck, withNote = true): ReactNode => (
    <>
      {deck.question}
      {withNote && deck.questionNote ? <span className="prompt-note"> · {deck.questionNote}</span> : null}
    </>
  );
  // a part's ✓ or ✕, green or red on its own
  const mark = (ok: boolean): ReactNode => <span className={ok ? "mark correct" : "mark wrong"}>{ok ? "✓" : "✕"}</span>;
  // The verdict that replaces a single deck's question over its options
  // once answered (a combo's parts each get a mark instead)
  let verdict: ReactNode = null;
  let verdictClass = "";
  if (answered) {
    if (gaveUp) {
      verdict = "Revealed";
      verdictClass = "revealed";
    } else if (parts && comboOk) {
      verdict = (
        <>
          {parts[0].label} {mark(comboOk.a)}  ·  {parts[1].label} {mark(comboOk.b)}
        </>
      );
      verdictClass = "combo";
    } else {
      verdict = wasCorrect ? "✓ Correct" : "✕ Not quite";
      verdictClass = wasCorrect ? "correct" : "wrong";
    }
  }

  // The fact pills under the name: empty while asking; the Pokémon's
  // types, region, group (and stage, when the deck asked it) once
  // answered, or a nature's raised and lowered stats.
  const involvesStage = card.deckId === "stage" || Boolean(parts?.some((sub) => sub.id === "stage"));
  let factPills: ReactNode[] = [];
  if (answered && pokemon) {
    const groupPills = SPECIAL_FLAGS.filter((flag) => pokemon.flags.includes(flag)).map((flag) =>
      getCategory(`flag-${flag}`),
    );
    const categories: PillCategory[] = [
      ...pokemon.types.map((type) => getCategory(`type-${type}`)),
      ...pokemon.regions.map((region) => getCategory(`region-${region}`)),
      ...(groupPills.length ? groupPills : [REGULAR]),
    ];
    if (involvesStage && pokemon.stage) categories.push(getCategory(`stage-${pokemon.stage}`));
    factPills = categories.map((category) => <CategoryPill key={category.id} cat={category} useShort />);
  } else if (answered && nature) {
    factPills =
      nature.raised && nature.lowered
        ? [
            <span key="up" className="pill stat-up">
              ▲ {STAT_LABELS[nature.raised].short}
            </span>,
            <span key="down" className="pill stat-down">
              ▼ {STAT_LABELS[nature.lowered].short}
            </span>,
          ]
        : [
            <span key="none" className="pill">
              No stat changes
            </span>,
          ];
  }

  // A deck's pad: its answers and the options shown. A filtered single-pick
  // facet shows only the selected options while the right answer is among
  // them; otherwise the whole pad comes back.
  const padOf = (deck: Deck): { answers: string[]; options: DeckOption[]; cols: number } => {
    const answers = partAnswers(deck, subject);
    const facetSel = deck.multi ? [] : (filter[deck.id as FocusFacet] ?? []);
    const narrowed = facetSel.length > 0 && answers.some((id) => facetSel.includes(id));
    const options = narrowed ? deck.options.filter((option) => facetSel.includes(option.id)) : deck.options;
    return { answers, options, cols: Math.max(1, Math.min(deck.cols, options.length)) };
  };

  // Once answered, only the right answers and any wrong picks stay on the
  // pad; the rest go.
  const graded = (option: DeckOption, answers: string[]): boolean =>
    !answered || answers.includes(option.id) || pickedIds.has(option.id);
  const optionClass = (option: DeckOption, answers: string[]): string => {
    // a type option is type-coloured wherever it appears, as in CategoryPill
    let className = "pad-btn" + typeClassOf(CATEGORY_BY_ID.get(option.id));
    if (!answered) {
      if (selection.includes(option.id)) className += " selected";
    } else if (answers.includes(option.id)) {
      className += pickedIds.has(option.id) ? " correct" : " correct missed";
    } else {
      className += " wrong";
    }
    return className;
  };

  const shortOf = (id: string): string =>
    padDecks.flatMap((deck) => deck.options).find((option) => option.id === id)?.short ?? getCategory(id).short;

  // The one CTA slot under the pads: Submit on a multi deck, a combo or
  // Who's That; Next card once answered. A plain single-pick deck grades
  // on tap, so its slot stays empty.
  let cta: { label: ReactNode; onClick: () => void; disabled: boolean } | null = null;
  if (answered) {
    cta = { label: "Next card", onClick: () => next(), disabled: false };
  } else if (nameDeck || parts || padDecks[0].multi) {
    cta = { label: "Submit", onClick: submit, disabled: !canSubmit };
  }

  // The line under the options once answered: what was missed and what
  // was wrong, and when the card comes back. A card answered right, or
  // revealed, says only when it comes back, as does a Natures card, whose
  // one answer per pad is already on the pad
  const listNames = (ids: string[]): string => ids.map(shortOf).join(", ");
  let summary: ReactNode = null;
  if (answered) {
    const backIn = nextIn ? `back in ${nextIn}` : null;
    const prefix: ReactNode =
      parts && comboOk ? (
        <>
          {parts[0].label} {mark(comboOk.a)} · {parts[1].label} {mark(comboOk.b)} ·{" "}
        </>
      ) : null;
    if (gaveUp || wasCorrect || nature) {
      if (backIn || prefix) {
        summary = (
          <>
            {prefix}
            {backIn ? (prefix ? backIn : `Back in ${nextIn}`) : null}
          </>
        );
      }
    } else if (nameDeck && pokemon) {
      // what was typed, and the Pokémon it resolved to, if any (an older
      // stored session has only the Pokémon)
      const typed = pickedList.find((pick) => pick.startsWith(TYPED))?.slice(TYPED.length) ?? null;
      const lead = pickedList[0];
      const resolved = lead !== undefined && !lead.startsWith(TYPED) ? POKEMON_BY_ID.get(Number(lead)) : undefined;
      let said: ReactNode = null;
      if (resolved) {
        // quoted as typed, with PokeDoku's name for it where that says
        // more ("deoxys (Deoxys Normal)")
        const asTyped = typed ?? resolved.displayName;
        const differs = wordBag(asTyped) !== wordBag(resolved.displayName);
        said = (
          <>
            ; you said <b className="miss">{asTyped}</b>
            {differs ? ` (${resolved.displayName})` : ""}
          </>
        );
      } else if (typed !== null) {
        said = (
          <>
            ; no Pokémon is called <b className="miss">{typed}</b>
          </>
        );
      }
      summary = (
        <>
          It&apos;s <b className="hit">{pokemon.displayName}</b>
          {said}. {backIn ? `Back in ${nextIn}.` : ""}
        </>
      );
    } else {
      const graded = padDecks.map((deck) => ({ picks: deckPicks(deck, pickedList), answers: partAnswers(deck, subject) }));
      const missed = graded.flatMap(({ picks, answers }) => answers.filter((id) => !picks.includes(id)));
      const wrong = graded.flatMap(({ picks, answers }) => picks.filter((id) => !answers.includes(id)));
      const clauses: ReactNode[] = [];
      if (missed.length) {
        clauses.push(
          <>
            You missed <b className="hit">{listNames(missed)}</b>
          </>,
        );
      }
      if (wrong.length) {
        clauses.push(
          <>
            <b className="miss">{listNames(wrong)}</b> {wrong.length === 1 ? "was" : "were"} wrong
          </>,
        );
      }
      summary = (
        <>
          {prefix}
          {clauses.map((clause, index) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- at most two fixed clauses, never reordered
            <span key={index}>
              {index > 0 ? "; " : ""}
              {clause}
            </span>
          ))}
          {clauses.length ? ". " : ""}
          {backIn ? `${clauses.length ? "Back" : "back"} in ${nextIn}.` : ""}
        </>
      );
    }
  }

  const canUndo = live && !gaveUp && session.undo?.key === key && session.undo.token === undoableAttempt;

  // ---- the stage and the pad ----

  // The Pokémon (or nature) on a big tile with the fact pills under it
  // (empty, and out of the layout, while asking). Once answered a
  // Pokémon's tile opens the detail sheet, and holds the height it had
  // while asking (see heldTileHeight); before that it stays inert so
  // nothing gives the answer away
  const stage = (
    <div className="card-stage">
      <div
        ref={tileRef}
        className={`stage-tile${silhouetted ? " mystery" : ""}`}
        style={heldTileHeight !== null ? { flex: "none", height: heldTileHeight } : undefined}
      >
        {isNature(subject) ? (
          <NatureCard nature={subject} />
        ) : (
          <PokemonCard
            pokemon={subject}
            eager
            hideName={mystery}
            hint="Details"
            onClick={answered ? () => openDetail(subject) : undefined}
          />
        )}
      </div>
      <div className="fact-pills">{factPills}</div>
    </div>
  );

  // The answer card: each deck's question over its options (Who's That's
  // text box), and the summary once answered
  const pad = (
    <div className="answer-pad">
      {padDecks.map((deck) => {
        const deckPad = padOf(deck);
        // every pad is captioned with its question, right over its
        // options; once graded a combo's keeps it and adds the part's
        // mark, a single deck's gives way to the verdict
        const partVerdict = parts && comboOk ? (deck === parts[0] ? comboOk.a : comboOk.b) : null;
        return (
          <div key={deck.id} className="pad-part">
            {/* Who's That's row also carries the eye button: silhouette
                on (the default) or the sprite in full */}
            <div className={`pad-head${deck.input === "name" ? " with-eye" : ""}`}>
              <p
                key={`${key}:${String(answered)}`}
                className={`pad-kicker${parts ? "" : ` ${verdictClass}`}`}
                aria-live="polite"
              >
                {parts ? (
                  <>
                    {questionOf(deck, !answered)}
                    {partVerdict !== null ? <> {mark(partVerdict)}</> : null}
                  </>
                ) : (
                  (verdict ?? questionOf(deck))
                )}
              </p>
              {deck.input === "name" ? (
                <button
                  type="button"
                  className={`pad-eye${silhouette ? " on" : ""}`}
                  aria-pressed={silhouette}
                  aria-label="Silhouette"
                  title={silhouette ? "Silhouette on: tap to show the sprite" : "Silhouette off: tap to hide the sprite"}
                  onClick={toggleSilhouette}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
                    <circle cx="12" cy="12" r="3" />
                    {silhouette ? <path d="M4 4l16 16" /> : null}
                  </svg>
                </button>
              ) : null}
            </div>
            {deck.input === "name" ? (
              // the typed answer (Enter or the foot's Submit grades it),
              // with the last submit's second chance under it, if it gave
              // one; once graded, the summary below says how it went
              answered ? null : (
                <>
                  <NameInput value={typed} onChange={(text) => setTypedFor({ key, text })} placeholder="Your answer…" />
                  {shownNudge ? (
                    <p key={shownNudge.at} className="pad-nudge" aria-live="polite">
                      {NUDGE_TEXT[shownNudge.kind]}
                    </p>
                  ) : null}
                </>
              )
            ) : (
              // once graded the remaining options take four columns
              // whatever the deck, so a type reads at the same size as a
              // region under it
              <div className={`pad-grid cols-${answered ? 4 : deckPad.cols}`}>
                {deckPad.options.filter((option) => graded(option, deckPad.answers)).map((option) => (
                  <button
                    key={option.id}
                    className={optionClass(option, deckPad.answers)}
                    disabled={answered}
                    onClick={() => choose(deck, option)}
                  >
                    {option.short}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {summary !== null ? (
        <p className="pad-summary" aria-live="polite">
          {summary}
        </p>
      ) : null}
    </div>
  );

  return (
    // a combo card stacks two pads, so its stage and buttons give some
    // height back (a Natures card's two pads are short, see
    // .flashcards.natures); Who's That's card sits up top on a phone,
    // clear of the keyboard (see .flashcards.name-deck); an answered card
    // keeps its tile where it was (see .flashcards.answered)
    <div
      className={`flashcards${parts && !nature ? " combo" : ""}${nature ? " natures" : ""}${nameDeck ? " name-deck" : ""}${answered ? " answered" : ""}`}
    >
      <div className="cards-topbar">
        <button className="deck-choose" aria-haspopup="dialog" onClick={() => setDeckSheet(true)}>
          {deckLabel(deckId)}
          <Chevron />
        </button>
        {/* the focus filters are about Pokémon, so the Natures deck has none */}
        {filterable ? (
          <button
            className={`filter-open${filterN ? " on" : ""}`}
            aria-label="Focus filters"
            aria-haspopup="dialog"
            onClick={() => setFilterSheet(true)}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 5h16l-6.3 7.2V19l-3.4-1.8v-5L4 5Z" />
            </svg>
            {filterN ? <span className="filter-badge">{filterN}</span> : null}
          </button>
        ) : null}
        <div className="dash-row" aria-hidden="true">
          {Array.from({ length: DASH_SLOTS }, (_, index) => (
            <span key={index} className={`dash${dashes[index] ? ` ${dashes[index]}` : ""}`} />
          ))}
        </div>
        <span className="due-count">{due} due</span>
      </div>

      {stage}
      {pad}

      {/* the card's controls, docked at the bottom of the screen: the CTA
          slot and the action row */}
      <div className="pad-foot">
        {cta ? (
          // Who's That's Submit leaves the focus in the text box (a click
          // would take it on mousedown), so a second chance is typed
          // straight away and a phone's keyboard stays up
          <button
            className="pad-cta"
            disabled={cta.disabled}
            onClick={cta.onClick}
            onMouseDown={nameDeck && !answered ? (event) => event.preventDefault() : undefined}
          >
            <span className="pad-cta-label">{cta.label}</span>
          </button>
        ) : (
          <div className="pad-cta-gap" aria-hidden="true" />
        )}
        {/* Back on the left; Don't Know (or Undo, once answered) centred
            under the CTA; Skip on the right while asking, or which earlier
            card this is */}
        <div className="pad-actions">
          <span className="pad-actions-side">
            {canBack ? (
              <button className="pad-ghost" onClick={back}>
                ‹ Back
              </button>
            ) : null}
          </span>
          <span className="pad-actions-mid">
            {live && !answered ? (
              <button className="pad-ghost" onClick={giveUp}>
                Don&apos;t Know
              </button>
            ) : null}
            {canUndo ? (
              <button className="pad-ghost" onClick={undoAnswer}>
                Undo
              </button>
            ) : null}
          </span>
          <span className="pad-actions-side end">
            {!live ? (
              <span className="pad-note">
                Earlier card {viewing !== null ? viewing + 1 : 0} of {history.length}
              </span>
            ) : answered ? null : (
              <button className="pad-ghost" onClick={() => next()}>
                Skip ›
              </button>
            )}
          </span>
        </div>
      </div>

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
