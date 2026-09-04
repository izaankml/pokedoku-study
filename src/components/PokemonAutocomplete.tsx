import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, TouchEvent } from "react";
import type { Pokemon } from "../data/types.ts";
import { findByName, searchNames } from "../logic/matching.ts";
import type { PokemonFilter } from "../logic/matching.ts";
import Sprite from "./Sprite.tsx";

interface PokemonAutocompleteProps {
  // the Pokémon picked, and the text it was typed as ("mega charizard x")
  onSubmit: (pokemon: Pokemon, typed: string) => void;
  disabled?: boolean;
  placeholder?: string;
  // narrows what can be picked: suggestions and the Enter-to-submit exact
  // match both skip Pokémon it rejects
  eligible?: PokemonFilter;
  autoFocus?: boolean;
  // no suggestion list as the user types (Who's That would give the
  // name away): Enter submits the name typed, or nothing
  suggest?: boolean;
  // when given, Enter on a name that is no Pokémon's hands the text here
  // (Who's That grades it as a miss) instead of doing nothing
  onMiss?: (typed: string) => void;
  // a Submit button beside the box, disabled while it's empty — for a
  // deck with no suggestion list to pick from
  submitLabel?: string;
  // Focus the box without the page moving. An iPhone scrolls a tapped
  // text box into the middle of what the keyboard leaves whether or not
  // the keyboard would have covered it (WebKit forces that scroll whenever
  // the keyboard carries its accessory bar), but honours preventScroll on
  // a scripted focus — so the tap is taken over and the box focused that
  // way. The caller keeps the box clear of the keyboard by layout
  focusWithoutScroll?: boolean;
}

function PokemonAutocomplete({
  onSubmit,
  disabled,
  placeholder,
  eligible = null,
  autoFocus = false,
  suggest = true,
  onMiss,
  submitLabel,
  focusWithoutScroll = false,
}: PokemonAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const highlightedRef = useRef<HTMLButtonElement | null>(null);

  const suggestions = suggest && open && query ? searchNames(query, 8, eligible) : [];

  useEffect(() => {
    highlightedRef.current?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  function submit(pokemon: Pokemon | null | undefined) {
    if (!pokemon) return;
    const typed = query.trim();
    setQuery("");
    setOpen(false);
    setHighlighted(0);
    onSubmit(pokemon, typed);
    inputRef.current?.focus();
  }

  // Enter, or the Submit button: the name typed (spelt right, its words
  // in any order), else the highlighted suggestion; a name that is
  // nobody's goes to onMiss when there is one
  function submitTyped(): void {
    const match = findByName(query, eligible) || suggestions[highlighted] || suggestions[0];
    if (match) submit(match);
    else if (onMiss && query.trim()) onMiss(query.trim());
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      submitTyped();
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  // the tap that would focus the box, taken over (see focusWithoutScroll):
  // only while it isn't focused, so taps to place the caret or select
  // text keep working
  function onTouchEnd(event: TouchEvent<HTMLInputElement>): void {
    const input = inputRef.current;
    if (!input || document.activeElement === input || !event.cancelable) return;
    event.preventDefault();
    input.focus({ preventScroll: true });
  }

  return (
    <div className={`autocomplete${submitLabel ? " with-submit" : ""}`}>
      <input
        ref={inputRef}
        type="text"
        inputMode="search"
        autoCapitalize="off"
        autoCorrect="off"
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-autocomplete={suggest ? "list" : "none"}
        value={query}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder || "Type a Pokémon name…"}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onKeyDown={onKeyDown}
        onTouchEnd={focusWithoutScroll ? onTouchEnd : undefined}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {submitLabel ? (
        // mousedown is swallowed so the box keeps its focus (and, on a
        // phone, its keyboard) through the click
        <button
          type="button"
          className="autocomplete-submit primary"
          disabled={disabled || !query.trim()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={submitTyped}
        >
          {submitLabel}
        </button>
      ) : null}
      {suggestions.length > 0 && (
        <ul className="suggestions" role="listbox">
          {suggestions.map((pokemon, index) => (
            <li key={pokemon.id} role="presentation">
              <button
                role="option"
                aria-selected={index === highlighted}
                ref={index === highlighted ? highlightedRef : null}
                className={index === highlighted ? "highlighted" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => submit(pokemon)}
              >
                <span className="suggestion-thumb">
                  <Sprite pokemon={pokemon} />
                </span>
                {pokemon.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PokemonAutocomplete;
