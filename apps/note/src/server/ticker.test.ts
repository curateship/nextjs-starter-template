import { describe, expect, it, vi } from "vitest"

import { backgroundTickerRunsHere } from "@/server/ticker"
import { getDatabaseUrl } from "@/server/database-url"

/**
 * Which process does the background work, and which database it uses.
 *
 * Both answers change in production, and both are the kind of thing that is
 * only ever discovered by a deployed app behaving oddly — so they are pinned
 * here instead. The environment is passed in rather than edited, because a
 * test run is never production and could not otherwise ask the question.
 */

describe("who ticks", () => {
  it("the dev server does, because there is nothing else running", () => {
    expect(backgroundTickerRunsHere({})).toBe(true)
  })

  it("a production web container does not — its worker does", () => {
    // Otherwise every web replica would run the same jobs, and "is background
    // work running" would depend on how many web containers happen to be up.
    expect(backgroundTickerRunsHere({ NODE_ENV: "production" })).toBe(false)
  })

  it("a test run does not, whichever way it says so", () => {
    expect(backgroundTickerRunsHere({ VITEST: "true" })).toBe(false)
    expect(backgroundTickerRunsHere({ NODE_ENV: "test" })).toBe(false)
  })
})

describe("which database", () => {
  it("uses the supplied one whenever there is one", () => {
    expect(
      getDatabaseUrl({ CUSTOM_SHELL_DATABASE_URL: "postgresql://host/app" })
    ).toBe("postgresql://host/app")
  })

  it("falls back to the local one in development", () => {
    expect(getDatabaseUrl({ CUSTOM_SHELL_POSTGRES_PORT: "54320" })).toContain(
      "localhost:54320"
    )
  })

  it("refuses to guess in production", () => {
    // The failure mode this prevents is not "no database". It is finding
    // another app's database on the same host and writing to it.
    expect(() => getDatabaseUrl({ NODE_ENV: "production" })).toThrow(
      /CUSTOM_SHELL_DATABASE_URL is required/
    )
  })

  it("can be asked the address without opening a connection to anything", async () => {
    // The regression: this used to live in `db.ts`, which opens a pool as it
    // loads. The worker's health check only wanted to read the address, and a
    // missing one blew up at *import* — so instead of reporting "no database
    // is configured" and exiting quietly, it printed a stack trace with the
    // real error and the container's file paths in it.
    vi.resetModules()
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("CUSTOM_SHELL_DATABASE_URL", "")

    await expect(import("@/server/database-url")).resolves.toBeTruthy()

    vi.unstubAllEnvs()
  })
})
