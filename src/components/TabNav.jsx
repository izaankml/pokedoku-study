const ICONS = {
  Browse: (
    <>
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13.2 13.2 18.5 18.5" />
    </>
  ),
  Drill: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="12" cy="12" r="0.5" />
    </>
  ),
  Cards: (
    <>
      <rect x="3" y="7" width="13" height="11" rx="2.5" />
      <rect x="8" y="4" width="13" height="11" rx="2.5" />
    </>
  ),
  Grid: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" />
    </>
  ),
  Stats: (
    <>
      <path d="M6 18v-6M12 18V7M18 18v-5" />
    </>
  ),
};

function TabNav({ tabs, active, onSelect }) {
  return (
    <nav className="tabs" role="tablist" aria-label="Modes">
      {tabs.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={t === active}
          className={t === active ? "tab active" : "tab"}
          onClick={() => onSelect(t)}
        >
          <svg
            className="tab-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {ICONS[t]}
          </svg>
          <span>{t}</span>
        </button>
      ))}
    </nav>
  );
}

export default TabNav;
