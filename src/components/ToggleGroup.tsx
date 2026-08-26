import type { ReactNode } from "react";

export interface Toggle {
  id: string;
  label: ReactNode;
  included: boolean;
  // a small count beside the label (the Grid panel's categories-per-group)
  count?: number;
}

interface ToggleGroupProps {
  id?: string;
  title: string;
  toggles: Toggle[];
  onToggle: (toggleId: string) => void;
  hint?: ReactNode;
}

// A titled panel of include/exclude chips — the Grid tab's category
// groups and the Cards tab's per-deck filter. A plain div, not a
// fieldset: legends get browser-special layout (no wrapping, drawn into
// the border) that clips the title.
function ToggleGroup({ id, title, toggles, onToggle, hint }: ToggleGroupProps) {
  return (
    <div id={id} className="grid-groups" role="group" aria-label={title}>
      <p className="grid-groups-title">{title}</p>
      <div className="grid-groups-list">
        {toggles.map((toggle) => (
          <label key={toggle.id} className={`group-toggle${toggle.included ? " on" : ""}`}>
            <input type="checkbox" checked={toggle.included} onChange={() => onToggle(toggle.id)} />
            {toggle.label}
            {toggle.count !== undefined ? <span className="group-count">{toggle.count}</span> : null}
          </label>
        ))}
      </div>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export default ToggleGroup;
