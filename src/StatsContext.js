import { createContext, useContext } from "react";

export const StatsContext = createContext(null);

export function useStats() {
  return useContext(StatsContext);
}
