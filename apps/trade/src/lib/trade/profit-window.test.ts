import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The fence around the profit start day.
 *
 * **This rule has been broken three times, and each break passed its tests.**
 * The widgets count from one fixed day. Twice it was written as "today minus
 * N days" instead — `- 1` on 21 August, `- 2` on 23 August — which is right
 * for one day and then walks forward every midnight, quietly dropping the
 * earliest trades. Both times the test alongside it handed the function a
 * pretend clock and asserted a rolling answer, so a rolling window passed.
 *
 * The behaviour tests in `dashboard/overview.test.ts` now assert the real
 * instant. This file guards the *shape*, in the manner of
 * `server/protocols/fence.test.ts`: the two ways the rule has actually been
 * broken are made into failing tests rather than a code-review hope.
 */

const SRC = join(__dirname, "..", "..")

const read = (path: string) => readFileSync(join(SRC, path), "utf8")

/**
 * Comments stripped. The rule gets written *about* in comments — this file
 * and the helper both quote the old wording to explain the bug — and quoting
 * a mistake is not making it.
 */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")
}

/** Every file that draws the profit widgets and could name their period. */
const WIDGET_FILES = [
  "components/trade/pnl-graph-widget.tsx",
  "components/trade/account-panel.tsx",
]

describe("the profit start day", () => {
  it("takes no clock, so it cannot be made to roll", () => {
    // `walletProfitWindowStart(now)` is how both breaks were written: give it
    // today and subtract. With no parameter there is nothing to subtract
    // from, and re-adding one fails here before it can reach a screen.
    const source = code(read("lib/trade/wallets.ts"))
    expect(source).toMatch(/export function walletProfitWindowStart\(\)/)
  })

  it("shifts no dates when working out where counting began", () => {
    const source = code(read("lib/trade/wallets.ts"))
    const start = source.slice(
      source.indexOf("export function walletProfitWindowStart")
    )
    const body = start.slice(0, start.indexOf("\n}\n") + 2)
    expect(body).not.toMatch(
      /setUTCDate|setDate|getUTCDate|Date\.now|new Date\(\)/
    )
  })

  it("never writes the period as a fixed number of days on screen", () => {
    // "from two days ago until now" was true for one day. Every place that
    // names the period reads it from `walletProfitWindowLabel`, which counts
    // up with the calendar. A literal here is the bug coming back as copy
    // even when the arithmetic underneath is right.
    const literal =
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+days?\s+ago\b/i
    const offenders = WIDGET_FILES.filter((path) =>
      literal.test(code(read(path)))
    )
    expect(offenders).toEqual([])
  })

  it("gets the words for the period from the one helper", () => {
    // A second way of phrasing it is a second thing to forget to update.
    const source = read("components/trade/pnl-graph-widget.tsx")
    expect(source).toMatch(/walletProfitWindowLabel/)
  })

  it("states the start day in the rules doc", () => {
    // Tyler's rule outranks the code, so the doc has to name the day rather
    // than a count that goes stale the morning after it is written.
    const rules = readFileSync(
      join(SRC, "..", "workspace", "docs", "rules", "trading-rules.md"),
      "utf8"
    )
    expect(rules).toMatch(/20 August 2026/)
  })
})
