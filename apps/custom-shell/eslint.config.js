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
      // Real, and worth doing — a screen that sets state straight from an
      // effect draws once, then draws again to correct itself. The two where
      // that was actually visible are fixed: `hooks/use-mobile.ts` (every page
      // assumed a desktop first, so a phone flickered on load) and the paging
      // reset in `automations-list-page.tsx`, now on `useClientPage`.
      //
      // The nine left are all loading spinners and form drafts, and each needs
      // its own careful rewrite rather than one sweep:
      //   automations/automation-runs-panel.tsx:301
      //   feedback/feedback-comments-modal.tsx:65
      //   feedback/feedback-dashboard.tsx:154, :725
      //   feedback/feedback-modal.tsx:247
      //   media/media-picker.tsx:144, :187
      //   system-emails/system-email-sends-panel.tsx:46
      //   pages/dashboard/sticky-header/notification-center.tsx:158
      // A warning so they stay on screen, without a red build standing for
      // work nobody has done yet. Put it back to 'error' once the list is empty.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
