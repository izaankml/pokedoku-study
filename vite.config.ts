import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base must match the GitHub Pages project path: izaankml.github.io/pokedoku-study/
export default defineConfig({
  base: "/pokedoku-study/",
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
