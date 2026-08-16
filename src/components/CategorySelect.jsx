import { CATEGORIES, CATEGORY_GROUPS } from "../data/categories.js";

function CategorySelect({ value, onChange, allowNone = false }) {
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
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default CategorySelect;
