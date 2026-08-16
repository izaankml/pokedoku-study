import { CATEGORIES, CATEGORY_GROUPS } from "../data/categories.js";
import { pairIsValid } from "../logic/matching.js";

// `partner` is the category chosen in the other dropdown; options that
// can't pair with it (no Pokémon fits both, or the same exclusive group
// like two evolution stages) are disabled.
function CategorySelect({ value, onChange, allowNone = false, partner = "" }) {
  return (
    <select
      className="category-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {allowNone ? <option value="">— none —</option> : null}
      {CATEGORY_GROUPS.map(([group, label]) => (
        <optgroup key={group} label={label}>
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
