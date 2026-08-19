import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "@fontsource-variable/nunito";
import "./App.css";
import { startUpdateChecks } from "./logic/updateCheck.ts";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

startUpdateChecks();
