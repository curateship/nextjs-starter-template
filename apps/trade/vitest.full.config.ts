import path from "node:path"

import { defineConfig } from "vitest/config"

import base from "./vitest.config"

/**
 * The complete Trade suite, including every shell-origin test. The only change
 * from the shell config is database setup: each test restores the migration-
 * fingerprinted snapshot instead of replaying every migration.
 */
export default defineConfig({
  ...base,
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
