import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // Put into the code at build time; declared in `src/globals.d.ts`.
        __DEV_APP_PORT__: 'readonly',
      },
    },
    rules: {
      // Dropping a key by destructuring it out is how this codebase removes
      // one, and it names the leftover with a leading underscore to say it is
      // deliberate. Without this the idiom reads as a mistake.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // A warning, not an error. It only affects how neatly the dev server
      // reloads a file — nothing a reader sees — and as an error its 55 hits
      // buried the handful of complaints that were about real bugs.
      'react-refresh/only-export-components': 'warn',
      // State needed by the current render is derived before commit. Effects
      // synchronize with external systems and update only from their callbacks.
      'react-hooks/set-state-in-effect': 'error',
    },
  },
])
