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

/** Each exchange package, and the one folder allowed to import it. */
const EXCHANGE_PACKAGES: Array<{ pkg: string; home: string }> = [
  { pkg: "@nktkas/hyperliquid", home: join("server", "protocols", "hyperliquid") },
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

  it("keeps each exchange package inside its own folder", () => {
    for (const { pkg, home } of EXCHANGE_PACKAGES) {
      // Real imports only — `from "pkg"` or `import("pkg")` — so this file
      // may name the package in its own list without fencing itself in.
      const imports = new RegExp(
        `(?:from\\s*|import\\s*\\()\\s*["'\`]${pkg.replace(/[/@]/g, "\\$&")}`
      )
      const leaks = sources
        .filter(({ text }) => imports.test(text))
        .filter(({ path }) => !path.startsWith(home + sep))
        .map(({ path }) => path)
      expect(leaks, `${pkg} imported outside ${home}`).toEqual([])
    }
  })

  it("keeps protocol comparisons out of shared code", () => {
    // `=== "hyperliquid"` in a screen is the first brick of the wall this
    // layer exists to prevent. Building a key or a label belongs behind the
    // fence; shared code only carries ids around.
    const comparison = /[=!]==?\s*["'`]hyperliquid["'`]|["'`]hyperliquid["'`]\s*[=!]==?/
    const offenders = sources
      .filter(({ path }) => !PROTOCOL_AWARE.some((dir) => path.startsWith(dir)))
      .filter(({ text }) => comparison.test(text))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })
})
