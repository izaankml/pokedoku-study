import js from "@eslint/js";
import eslintReact from "@eslint-react/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist", ".cache"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      eslintReact.configs["recommended-typescript"],
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      // a leading underscore marks a deliberately unused binding
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // eslint-react re-implements the hooks and React Compiler rules that
      // eslint-plugin-react-hooks ships; keep the React team's copies only
      "@eslint-react/error-boundaries": "off",
      "@eslint-react/exhaustive-deps": "off",
      "@eslint-react/purity": "off",
      "@eslint-react/rules-of-hooks": "off",
      "@eslint-react/set-state-in-effect": "off",
      "@eslint-react/set-state-in-render": "off",
      "@eslint-react/static-components": "off",
      "@eslint-react/unsupported-syntax": "off",
      "@eslint-react/use-memo": "off",
    },
  },
  {
    files: ["src/**"],
    languageOptions: { globals: globals.browser },
  },
  {
    // Node-only code: the data/harvest scripts, the tool configs, and the
    // vitest suites (which read fixtures and stub globals).
    files: ["scripts/**", "vite.config.ts", "eslint.config.ts", "**/*.test.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    // The headless-Chrome driver kept beside the run-app skill.
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
]);
