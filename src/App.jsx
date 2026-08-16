import { useState } from "react";
import TabNav from "./components/TabNav.jsx";

const TABS = ["Browse", "Drill", "Cards", "Grid", "Stats"];

function App() {
  const [tab, setTab] = useState("Drill");
  return (
    <div className="app">
      <header>
        <h1>PokeDoku Study</h1>
        <TabNav tabs={TABS} active={tab} onSelect={setTab} />
      </header>
      <main>
        <p className="placeholder">{tab} mode coming up.</p>
      </main>
    </div>
  );
}

export default App;
