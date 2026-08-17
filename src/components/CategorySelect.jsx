import { CATEGORIES, CATEGORY_GROUPS } from "../data/categories.js";
import { pairIsValid } from "../logic/matching.js";

// A category dropdown, blank at the top (no category). `partner` is the
// category chosen in the other dropdown; options that can't pair with it
// (no Pokémon fits both, or the same exclusive group like two evolution
// stages) are disabled.
function CategorySelect({ value, onChange, partner = "", label }) {
  return (
    <select
      className="category-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    >
      <option value=""></option>
      {CATEGORY_GROUPS.map(([group, glabel]) => (
        <optgroup key={group} label={glabel}>
          {CATEGORIES.filter((c) => c.group === group).map((c) => (
            <option
              key={c.id}
              value={c.id}
              disabled={Boolean(partner) && !pairIsValid(partner, c.id)}
            >
              {c.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default CategorySelect;
