import type { TradeNoticeKind } from "@/lib/trade/trade-notice-words"

/**
 * Reading a trade notice's own sentence back into the pieces the bell draws.
 *
 * **This exists for the notices already in the inbox.** Since 4 October 2026
 * every notice saves its heading and its figures beside its sentence, so the
 * bell never has to guess. The thousands written before that date saved only
 * the sentence, and a bell that draws the new shape for today and the old shape
 * for everything else is a bell that looks broken. Backfilling the columns
 * would mean rebuilding every fill, alert and grid sale from the tables they
 * came off; reading the sentence costs nothing and reaches every row.
 *
 * Safe to guess from, because the app wrote every one of these sentences
 * itself, in `trade-notice-words.ts` and `engine-health.ts`. The shapes are
 * finite and they are in this repo. A sentence that matches none of them falls
 * through to `null`, and the bell then draws it exactly as it drew it before
 * any of this existed.
 */

export type ReadBackNotice = {
  headline: string
  meta: string[]
  kind: TradeNoticeKind
  /**
   * How loud the notice is, worked out from the same words. The saved column
   * is the truth for a notice that has one; this is what an older notice's
   * tile is coloured from, and without it a close that lost money would wear
   * the same green as one that made money.
   */
  level: "info" | "warning" | "critical"
}

/** "(Ku1)" or "(Test wallet, practice)" at the end of a title. */
const WALLET_TAG = /\s*\(([^()]+)\)\s*$/

/** "Lost $0.05 on this close." / "Made $5.00 on this close." in a body. */
const BODY_MONEY = /^(Lost|Made)\s+(\$[\d,.]+)/

function withoutTag(title: string): { words: string; wallet: string | null } {
  const found = title.match(WALLET_TAG)
  if (!found) return { words: title.trim(), wallet: null }
  return { words: title.slice(0, found.index).trim(), wallet: found[1] }
}

/** Whether a figure such as "lost $0.05" is the losing one. */
function lostMoney(money: string | null): boolean {
  return (money ?? "").startsWith("lost")
}

/** "lost $0.05", or nothing when the body does not price the close. */
function moneyFromBody(body: string | null): string | null {
  const text = body ?? ""
  if (text.length > LONGEST_SENTENCE) return null
  const found = text.match(BODY_MONEY)
  if (!found) return null
  return `${found[1].toLowerCase()} ${found[2]}`
}

/** The three figures a fill shows, with the last one left out when it is null. */
function figures(price: string, wallet: string | null, last: string | null) {
  return [`@ ${price}`, wallet, last].filter(
    (one): one is string => typeof one === "string" && one.length > 0
  )
}

/**
 * The longest sentence worth reading back.
 *
 * `message` and `detail` are unbounded `text` columns, and this runs on every
 * row on every render now that the look is worked out on the spot rather than
 * fetched. The patterns below pair lazy groups with literals, which backtrack
 * on a string that does not match — cheap on a sentence, and not worth finding
 * out on something a thousand times longer. Every real notice this app writes
 * is well inside this; anything beyond it keeps the shell's own look, exactly
 * as an unrecognised sentence already does.
 */
const LONGEST_SENTENCE = 400

export function readBackNotice(
  message: string | null,
  detail: string | null
): ReadBackNotice | null {
  const title = (message ?? "").trim()
  if (!title || title.length > LONGEST_SENTENCE) return null

  const { words, wallet } = withoutTag(title)

  // "Entered a trade: $431 of XBT at $86,194 (Ku1)"
  const fill = words.match(
    /^(Entered|Exited) a trade:\s+(.+?)\s+of\s+(.+?)\s+at\s+(.+)$/
  )
  if (fill) {
    const [, did, usd, coin, price] = fill
    const money = moneyFromBody(detail)
    return {
      headline: `${did} ${usd} of ${coin}`,
      meta: figures(price, wallet, money ?? "filled"),
      kind: did === "Exited" ? "exited" : "entered",
      level: lostMoney(money) ? "warning" : "info",
    }
  }

  // "The exchange liquidated ETH: exited $500 at $90 (Main)"
  const liquidated = words.match(
    /^The exchange liquidated\s+(.+?):\s+exited\s+(.+?)\s+at\s+(.+)$/
  )
  if (liquidated) {
    const [, coin, usd, price] = liquidated
    return {
      headline: `The exchange liquidated ${usd} of ${coin}`,
      meta: figures(price, wallet, moneyFromBody(detail) ?? "liquidated"),
      kind: "liquidated",
      level: "critical",
    }
  }

  // "Stop hit on ETH: exited at $80, lost $55.00 (Main)"
  const trigger = words.match(
    /^((?:Stop|Target) hit) on\s+(.+?):\s+exited at\s+([^,]+)(?:,\s+(lost|made)\s+(\S+))?$/
  )
  if (trigger) {
    const [, name, coin, price, verb, money] = trigger
    return {
      headline: `${name} on ${coin}`,
      meta: figures(price, wallet, verb ? `${verb} ${money}` : "closed"),
      kind: "exited",
      level: verb === "lost" ? "warning" : "info",
    }
  }

  // "USELESS grid run ended: lost $16.43 (HL1 - GRID)"
  const runEnded = words.match(
    /^(.+?)\s+grid run ended:\s+((?:lost|made)\s+\S+)$/
  )
  if (runEnded) {
    const [, coin, result] = runEnded
    return {
      headline: `${coin} grid run ended`,
      // The run's own price is only in the body, and only sometimes, so the
      // figures stop at the wallet and the money rather than inventing one.
      meta: [wallet, result].filter((one): one is string => Boolean(one)),
      kind: "exited",
      level: lostMoney(result) ? "warning" : "info",
    }
  }

  // "MARSCOIN Rung 4 sold and cleared Rung 6 - level 2: lost $13.02 (HL1)"
  const gridSale = words.match(
    /^(.+?):\s+((?:lost|made)\s+\S+)$/
  )
  if (gridSale && /\b(sold|bought back)\b/.test(gridSale[1])) {
    const [, did, result] = gridSale
    return {
      headline: did,
      meta: [wallet, result].filter((one): one is string => Boolean(one)),
      kind: "exited",
      level: lostMoney(result) ? "warning" : "info",
    }
  }

  // "USELESS ladder filled 3 rungs"
  const ladder = words.match(/^(.+\s+ladder filled\s+\d+\s+rungs?)$/)
  if (ladder) {
    // "$150 in." is the body's first sentence, and the only figure there is.
    const dollars = (detail ?? "").match(/^(\S+)\s+in\./)
    return {
      headline: ladder[1],
      meta: [dollars ? `${dollars[1]} in` : null, wallet].filter(
        (one): one is string => Boolean(one)
      ),
      kind: "entered",
      level: "info",
    }
  }

  // "ETH reached $3,600 (was rising)" — the bracket here is the direction, not
  // a wallet, so this reads the untrimmed title.
  const priceAlert = title.match(/^(.+?\s+reached\s+(\S+))\s+\(was\s+(\w+)\)$/)
  if (priceAlert) {
    const [, headline, price, movement] = priceAlert
    return {
      headline,
      meta: [`@ ${price}`, movement, "price alert"],
      kind: "alert",
      level: "info",
    }
  }

  // "BTC crossed your trendline at $61,200 (was falling)" and
  // "BTC retested 4h base (was rising)", whose price is in the body instead.
  const lineAlert = title.match(
    /^(.+?\s+(?:crossed|retested)\s+.+?)(?:\s+at\s+(\S+))?\s+\(was\s+(\w+)\)$/
  )
  if (lineAlert) {
    const [, headline, price, movement] = lineAlert
    const fromBody = (detail ?? "").match(/\bwas at\s+(\S+?)\.\s/)
    const at = price ?? fromBody?.[1] ?? null
    const buffer = (detail ?? "").match(/go\s+([\d.]+%)\s+past the/)
    return {
      headline,
      meta: [
        at ? `@ ${at}` : null,
        movement,
        buffer ? `${buffer[1]} buffer` : null,
      ].filter((one): one is string => Boolean(one)),
      kind: "alert",
      level: "info",
    }
  }

  // "The trading engine stopped at 2:37 PM EDT" / "… came back at 2:43 PM EDT"
  const engine = title.match(
    /^The trading engine (stopped|came back) at\s+(.+)$/
  )
  if (engine) {
    const [, what, time] = engine
    if (what === "stopped") {
      return {
        headline: "Trading engine stopped",
        meta: [time, "down"],
        kind: "system",
        level: "warning",
      }
    }
    // "It was unavailable for 5 minutes 13 seconds." is the only place the
    // span is written down on an old notice.
    const span = (detail ?? "").match(/unavailable for\s+(.+?)\./)
    return {
      headline: span
        ? `Trading engine was down ${shortSpan(span[1])}`
        : "Trading engine came back",
      meta: [time, "recovered"],
      kind: "system",
      level: "warning",
    }
  }

  return null
}

/** "5 minutes 13 seconds" as "5m 13s", so it fits a heading. */
function shortSpan(words: string): string {
  return words
    .replace(/\s*hours?/g, "h")
    .replace(/\s*minutes?/g, "m")
    .replace(/\s*seconds?/g, "s")
}
