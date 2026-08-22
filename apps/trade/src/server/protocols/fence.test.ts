import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The fence around the exchange.
 *
 * The whole point of the protocol layer is that a second exchange is a new
 * folder, not a hunt through the screens for everywhere the first one leaked.
 * That only stays true if leaking is a failing test rather than a code-review
 * hope — the same reasoning as `guards.test.ts`.
 *
 * Two rules:
 *
 * 1. The exchange SDK is imported only inside its own protocol folder.
 * 2. Nothing outside `src/server/protocols/` and the contracts file ever asks
 *    which protocol it is holding. Screens read capabilities and labels off
 *    the data; they do not special-case an exchange.
 */

const SRC = join(__dirname, "..", "..")

/**
 * Each exchange package, and the only folders allowed to import it: the
 * protocol's server side, and its browser side (the live stream — public
 * data the browser subscribes to directly).
 */
const EXCHANGE_PACKAGES: Array<{ pkg: string; homes: string[] }> = [
  {
    pkg: "@nktkas/hyperliquid",
    homes: [
      join("server", "protocols", "hyperliquid"),
      join("lib", "protocols", "hyperliquid"),
    ],
  },
  {
    // The signing library. Only the exchange's server folder may touch it: it
    // exists to turn a stored trading key into signatures, and anywhere else
    // it appears is a place a key could leak toward.
    pkg: "viem",
    homes: [join("server", "protocols", "hyperliquid")],
  },
]

/** Where naming a concrete protocol id is legitimate. */
const PROTOCOL_AWARE = [
  join("server", "protocols") + sep,
  join("lib", "protocols") + sep,
]

function walk(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full)
  }
  return files
}

const sources = walk(SRC).map((file) => ({
  path: relative(SRC, file),
  text: readFileSync(file, "utf8"),
}))

describe("the protocol fence", () => {
  it("finds the source tree", () => {
    // A walker that quietly matched nothing would pass everything below.
    expect(sources.length).toBeGreaterThan(100)
  })

  it("keeps each exchange package inside its own folders", () => {
    for (const { pkg, homes } of EXCHANGE_PACKAGES) {
      // Real imports only — `from "pkg"` or `import("pkg")` — so this file
      // may name the package in its own list without fencing itself in.
      const imports = new RegExp(
        `(?:from\\s*|import\\s*\\()\\s*["'\`]${pkg.replace(/[/@]/g, "\\$&")}`
      )
      const leaks = sources
        .filter(({ text }) => imports.test(text))
        .filter(({ path }) => !homes.some((home) => path.startsWith(home + sep)))
        .map(({ path }) => path)
      expect(leaks, `${pkg} imported outside ${homes.join(", ")}`).toEqual([])
    }
  })

  it("keeps the browser-side protocol folder off the server", () => {
    // `lib/protocols/` is in the browser bundle; one `@/server` import there
    // would drag the database toward the client. Real imports only — the
    // rule gets written about in comments.
    const serverImport = /(?:from\s*|import\s*\()\s*["'`]@\/server/
    const offenders = sources
      .filter(({ path }) => path.startsWith(join("lib", "protocols") + sep))
      .filter(({ text }) => serverImport.test(text))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it("keeps protocol comparisons out of shared code", () => {
    // `=== "hyperliquid"` in a screen is the first brick of the wall this
    // layer exists to prevent. Building a key or a label belongs behind the
    // fence; shared code only carries ids around. Every id the app knows is
    // in the pattern — a new exchange joins it the day its id exists.
    const comparison =
      /[=!]==?\s*["'`](hyperliquid|binance|phemex|kucoin|aster)["'`]|["'`](hyperliquid|binance|phemex|kucoin|aster)["'`]\s*[=!]==?/
    const offenders = sources
      .filter(({ path }) => !PROTOCOL_AWARE.some((dir) => path.startsWith(dir)))
      .filter(({ text }) => comparison.test(text))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it("keeps each exchange's folder off the app's own tables", () => {
    // An exchange folder importing `@/server/trade` is the adapter reaching
    // back into the app — the leak that once had the Hyperliquid folder
    // checking the app's real-money switch itself. Policy that reads app
    // state lives one level up (`real-money.ts`), where every exchange finds
    // it; the per-exchange folders speak to their exchange and nothing else.
    const appImport = /(?:from\s*|import\s*\()\s*["'`]@\/server\/trade/
    const offenders = sources
      .filter(({ path }) => {
        const inProtocols = path.startsWith(join("server", "protocols") + sep)
        if (!inProtocols) return false
        // Only the per-exchange subfolders — the shared files at the top of
        // `server/protocols/` are exactly where app-state policy belongs.
        const rest = relative(join("server", "protocols"), path)
        return rest.includes(sep)
      })
      .filter(({ text }) => appImport.test(text))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })
})
