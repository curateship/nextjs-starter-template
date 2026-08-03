import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    pool: "forks",
    // Nearly every test file builds a fresh in-memory Postgres and replays all
    // of `drizzle/` into it, per test. That is a few hundred milliseconds on
    // its own and several seconds when a dozen files are doing it at once, so
    // the default ten seconds started failing runs as the migration list grew —
    // always in `beforeEach`, never in an assertion, and in a different file
    // each time. The setup really does take that long under load; the tests
    // themselves are unaffected and keep the default limit.
    hookTimeout: 60_000,
  },
})
