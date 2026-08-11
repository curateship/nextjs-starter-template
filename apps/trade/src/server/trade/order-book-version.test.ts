import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The one rule that keeps "is this order still on the book?" cheap.
 *
 * That question is the hottest in the app: every ladder asks it about every
 * rung, on every pass. It used to be answered by walking the whole book each
 * time, which on a replay of 500 coins came to about fifty billion reads and
 * turned a two-minute run into twenty. Now the answer is worked out once and
 * kept until the book actually changes — see `liveOrderIds` in `paper.ts`.
 *
 * Keeping it depends on one thing: **anything that adds or removes an order
 * bumps `ordersVersion`.** Miss that once and a ladder reads a list of orders
 * that no longer exists, which means rungs treated as filled when they were
 * cancelled, and real money placed on the strength of it.
 *
 * A comment cannot enforce that, so this does. It is the same idea as
 * `fence.test.ts`: a rule worth relying on is a failing test, not a hope that
 * the next person reads the note above the field.
 */

const SRC = join(__dirname, "..", "..")

/**
 * Anything that lengthens or shortens an order list.
 *
 * Deliberately blind to what it is hanging off. Matching only `book.orders`
 * would wave through `input.book.orders.push(...)`, which is the same mutation
 * wearing a longer name — and a rule with a hole in it is worse than no rule,
 * because it reads as cover. Nothing else in this app has an `.orders` it
 * mutates, so a false alarm here costs one `bumpOrders` call or a rename.
 */
const MUTATIONS =
  /\.orders\s*(=[^=]|\.push\(|\.splice\(|\.pop\(|\.shift\(|\.unshift\()/

/**
 * How many lines of CODE after a change a `bumpOrders` still counts as going
 * with it.
 *
 * Counted with the comments taken out, because an order is written as an object
 * literal with a paragraph in the middle of it, and a plain line count then
 * fails on perfectly correct code. This is not measuring tidiness — it is
 * catching a change that forgot to bump at all.
 */
const NEARBY = 20

/** The file's code lines, comments and blanks dropped, each with its real number. */
function codeLines(text: string): Array<{ at: number; text: string }> {
  const out: Array<{ at: number; text: string }> = []
  let inBlock = false
  for (const [index, raw] of text.split("\n").entries()) {
    const line = raw.trim()
    if (inBlock) {
      if (line.includes("*/")) inBlock = false
      continue
    }
    if (line.startsWith("/*")) {
      if (!line.includes("*/")) inBlock = true
      continue
    }
    if (line === "" || line.startsWith("//")) continue
    out.push({ at: index + 1, text: raw })
  }
  return out
}

function tsFilesUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name === "node_modules") continue
      out.push(...tsFilesUnder(path))
      continue
    }
    if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue
    if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue
    out.push(path)
  }
  return out
}

describe("the order book's version counter", () => {
  it("is bumped everywhere an order goes on or off the book", () => {
    const offenders: string[] = []

    for (const path of tsFilesUnder(SRC)) {
      const lines = codeLines(readFileSync(path, "utf8"))
      for (const [index, line] of lines.entries()) {
        if (!MUTATIONS.test(line.text)) continue
        // `bumpOrders` itself, and the reader that checks the counter, are
        // allowed to talk about the list without bumping anything.
        if (line.text.includes("ordersVersion")) continue
        const window = lines
          .slice(index, index + NEARBY)
          .map((one) => one.text)
          .join("\n")
        if (window.includes("bumpOrders(")) continue
        offenders.push(
          `${relative(SRC, path).split(sep).join("/")}:${line.at}  ${line.text.trim()}`
        )
      }
    }

    expect(offenders).toEqual([])
  })

  it("catches a mutation that forgot to bump", () => {
    // Proving the rule above can fail. Without this the test would pass just as
    // happily if the pattern matched nothing at all.
    const lines = ["input.book.orders.push(order)", "return id"]
    const missed = lines.filter(
      (line, index) =>
        MUTATIONS.test(line) &&
        !lines.slice(index, index + NEARBY).join("\n").includes("bumpOrders(")
    )
    expect(missed).toEqual(["input.book.orders.push(order)"])
  })
})
