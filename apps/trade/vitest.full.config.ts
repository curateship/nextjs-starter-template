import path from "node:path"

import { configDefaults, defineConfig } from "vitest/config"

import base from "./vitest.config"

/**
 * The complete Trade suite, including every shell-origin test. Two changes
 * from the shell config. Database setup: each test restores the migration-
 * fingerprinted snapshot instead of replaying every migration. And the
 * build scripts: the shell excludes every `scripts/*.test.mjs`, because its
 * own are written for `node --test`, while Trade's `deploy-trade.test.mjs`
 * is a vitest file and has to stay in this run. So only the worker ones,
 * which come from the shell, are excluded here.
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    exclude: [...configDefaults.exclude, "scripts/worker-*.test.mjs"],
  },
  resolve: {
    alias: [
      {
        find: /^@\/server\/test-support$/,
        replacement: path.resolve(__dirname, "src/server/test-support.fast.ts"),
      },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
})
