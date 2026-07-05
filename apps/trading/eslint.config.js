import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'worker/dist']),
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
      globals: globals.browser,
    },
  },
  {
    // The worker is a plain Node process: it must never pull in the web
    // server runtime or React — one bad import crashes it at boot.
    files: ['worker/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@tanstack/react-start*',
                'react',
                'react-dom',
                '@/components/*',
                '@/routes/*',
                '@/lib/api/*',
                '@/server/security',
                '@/server/origin',
              ],
              message:
                'Worker code must stay free of web-server and React imports.',
            },
          ],
        },
      ],
    },
  },
])
