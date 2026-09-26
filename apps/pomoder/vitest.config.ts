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
    exclude: ["e2e/**", "node_modules/**"],
    // The server suite rebuilds a fresh in-memory PostgreSQL and replays every
    // migration before each test, which now runs past the 10s default.
    hookTimeout: 30_000,
  },
})
