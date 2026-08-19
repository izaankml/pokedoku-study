import { CATEGORIES, CATEGORY_GROUPS } from "../data/categories.ts";
import { pairIsValid } from "../logic/matching.ts";

interface CategorySelectProps {
  // the chosen category id, "" for none
  value: string;
  onChange: (categoryId: string) => void;
  // the category chosen in the other dropdown, "" for none
  partner?: string;
  label: string;
}

// A category dropdown, blank at the top (no category). `partner` is the
// category chosen in the other dropdown; options that can't pair with it
// (no Pokémon fits both, or the same exclusive group like two evolution
// stages) are disabled.
function CategorySelect({ value, onChange, partner = "", label }: CategorySelectProps) {
  return (
    <select
      className="category-select"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
    >
      <option value=""></option>
      {CATEGORY_GROUPS.map(([group, groupLabel]) => (
        <optgroup key={group} label={groupLabel}>
          {CATEGORIES.filter((category) => category.group === group).map((category) => (
            <option
              key={category.id}
              value={category.id}
              disabled={Boolean(partner) && !pairIsValid(partner, category.id)}
            >
              {category.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default CategorySelect;
