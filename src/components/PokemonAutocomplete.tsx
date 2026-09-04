import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Pokemon } from "../data/types.ts";
import { findByName, searchNames } from "../logic/matching.ts";
import type { PokemonFilter } from "../logic/matching.ts";
import Sprite from "./Sprite.tsx";

interface PokemonAutocompleteProps {
  onSubmit: (pokemon: Pokemon) => void;
  disabled?: boolean;
  placeholder?: string;
  // narrows what can be picked: suggestions and the Enter-to-submit exact
  // match both skip Pokémon it rejects
  eligible?: PokemonFilter;
  autoFocus?: boolean;
  // no suggestion list as the user types (Who's That would give the
  // name away): Enter submits the name typed, or nothing
  suggest?: boolean;
}

function PokemonAutocomplete({
  onSubmit,
  disabled,
  placeholder,
  eligible = null,
  autoFocus = false,
  suggest = true,
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
    setQuery("");
    setOpen(false);
    setHighlighted(0);
    onSubmit(pokemon);
    inputRef.current?.focus();
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
      submit(findByName(query, eligible) || suggestions[highlighted] || suggestions[0]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="autocomplete">
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
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
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
