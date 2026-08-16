function CategoryPill({ cat, useShort = false }) {
  const typeClass = cat.group === "type" ? ` type-${cat.id.slice(5)}` : "";
  return (
    <span className={`pill${typeClass}`}>{useShort ? cat.short : cat.label}</span>
  );
}

export default CategoryPill;
