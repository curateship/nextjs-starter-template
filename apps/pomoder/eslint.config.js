import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // TanStack route modules and shared shadcn primitives intentionally export
      // route metadata, hooks, and style variants beside components.
      "react-refresh/only-export-components": "off",
      // These effects synchronize async data and persisted browser state. The
      // rule treats the initial synchronization as an unconditional render loop.
      "react-hooks/set-state-in-effect": "off",
      // TanStack Table is supported, but React Compiler deliberately skips
      // memoizing its stateful table object.
      "react-hooks/incompatible-library": "off",
    },
  },
])
