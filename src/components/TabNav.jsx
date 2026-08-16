function TabNav({ tabs, active, onSelect }) {
  return (
    <nav className="tabs">
      {tabs.map((t) => (
        <button
          key={t}
          className={t === active ? "tab active" : "tab"}
          onClick={() => onSelect(t)}
        >
          {t}
        </button>
      ))}
    </nav>
  );
}

export default TabNav;
