import { useEffect, useRef, useState } from "react";
import { findByName, searchNames } from "../logic/matching.js";
import Sprite from "./Sprite.jsx";

// `eligible` (optional) narrows what can be picked: suggestions and the
// Enter-to-submit exact match both skip Pokémon it rejects.
function PokemonAutocomplete({ onSubmit, disabled, placeholder, eligible = null, autoFocus = false }) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const highlightedRef = useRef(null);

  const suggestions = open && query ? searchNames(query, 8, eligible) : [];

  useEffect(() => {
    highlightedRef.current?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  function submit(pokemon) {
    if (!pokemon) return;
    setQuery("");
    setOpen(false);
    setHighlighted(0);
    onSubmit(pokemon);
    inputRef.current?.focus();
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit(findByName(query, eligible) || suggestions[highlighted] || suggestions[0]);
    } else if (e.key === "Escape") {
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
        aria-expanded={open && suggestions.length > 0}
        aria-autocomplete="list"
        value={query}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder || "Type a Pokémon name…"}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {suggestions.length > 0 && (
        <ul className="suggestions" role="listbox">
          {suggestions.map((p, i) => (
            <li key={p.id} role="presentation">
              <button
                role="option"
                aria-selected={i === highlighted}
                ref={i === highlighted ? highlightedRef : null}
                className={i === highlighted ? "highlighted" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => submit(p)}
              >
                <span className="suggestion-thumb">
                  <Sprite pokemon={p} />
                </span>
                {p.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PokemonAutocomplete;
