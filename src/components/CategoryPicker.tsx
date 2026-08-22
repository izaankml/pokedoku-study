import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { CATEGORIES, CATEGORY_GROUPS, getCategory } from "../data/categories.ts";
import type { Category } from "../data/categories.ts";
import { normalizeName, pairIsValid } from "../logic/matching.ts";

interface CategoryPickerProps {
  // the chosen category id, "" for none
  value: string;
  onChange: (categoryId: string) => void;
  // the category chosen in the other picker, "" for none
  partner?: string;
  label: string;
}

// A category picker: a field showing the choice (or "Any category") that
// opens a panel with a search box over every category, grouped as in
// Stats. Typing narrows the list by label or group ("fire", "galar",
// "stone", "move"); the arrows and Enter pick from the keyboard. Tapping
// the chosen category again — or the ×on the field — clears it. `partner`
// is the category chosen in the other picker: options that can't pair with
// it (no Pokémon fits both, or the same exclusive group, like two
// evolution stages) are disabled.
function CategoryPicker({ value, onChange, partner = "", label }: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selected = value ? getCategory(value) : null;

  const close = () => {
    setOpen(false);
    setQuery("");
    setHighlighted(0);
  };

  // Escape and a tap outside close the panel; the search box takes focus
  // as it opens
  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        event.stopPropagation();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const normalizedQuery = normalizeName(query);
  const matches = (category: Category, groupLabel: string): boolean =>
    !normalizedQuery ||
    normalizeName(category.label).includes(normalizedQuery) ||
    normalizeName(groupLabel).includes(normalizedQuery);
  const groups = CATEGORY_GROUPS.map(([group, groupLabel]) => ({
    group,
    groupLabel,
    categories: CATEGORIES.filter((category) => category.group === group && matches(category, groupLabel)),
  })).filter((entry) => entry.categories.length);
  const disabled = (category: Category): boolean => Boolean(partner) && !pairIsValid(partner, category.id);
  // what the keyboard can land on, top to bottom
  const selectable = groups.flatMap((entry) => entry.categories).filter((category) => !disabled(category));
  const highlightedId = selectable[Math.min(highlighted, selectable.length - 1)]?.id;

  const pick = (category: Category) => {
    onChange(category.id === value ? "" : category.id);
    close();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => Math.min(current + 1, selectable.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const category = selectable[Math.min(highlighted, selectable.length - 1)];
      if (category) pick(category);
    }
  };

  return (
    <div className={`category-picker${open ? " open" : ""}`} ref={rootRef}>
      <div className="category-field-wrap">
        <button
          type="button"
          className={`category-field${selected ? " has-value" : ""}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <span className="category-field-text">{selected ? selected.label : "Any category"}</span>
        </button>
        {selected ? (
          <button type="button" className="category-clear" aria-label={`Clear ${label}`} onClick={() => onChange("")}>
            ×
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="category-panel">
          <input
            ref={inputRef}
            type="search"
            className="category-search"
            placeholder="Search categories…"
            aria-label="Search categories"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlighted(0);
            }}
            onKeyDown={onKeyDown}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <ul className="category-options" role="listbox" aria-label={label}>
            {groups.map((entry) => (
              <li key={entry.group} role="presentation" className="category-group">
                <div className="category-group-head">{entry.groupLabel}</div>
                <ul role="group" aria-label={entry.groupLabel}>
                  {entry.categories.map((category) => {
                    const isSelected = category.id === value;
                    const isDisabled = disabled(category);
                    const className = `category-option${isSelected ? " selected" : ""}${
                      category.id === highlightedId ? " highlighted" : ""
                    }`;
                    return (
                      <li key={category.id} role="option" aria-selected={isSelected} aria-disabled={isDisabled}>
                        <button
                          type="button"
                          className={className}
                          disabled={isDisabled}
                          onMouseDown={(event) => event.preventDefault()} // keep the search box focused
                          onClick={() => pick(category)}
                        >
                          {category.label}
                          {isSelected ? (
                            <span className="category-tick" aria-hidden="true">
                              ✓
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {!groups.length ? <li className="category-empty">Nothing matches “{query.trim()}”.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default CategoryPicker;
