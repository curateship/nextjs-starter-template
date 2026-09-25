import type { PnlTrade } from "@/lib/trade/pnl/patterns"
import {
  PNL_PERIOD_LABELS,
  PNL_TIMEZONE,
  type PnlPeriod,
} from "@/lib/trade/pnl/periods"

/** The most trades one score call is fed, newest first. */
const SCORE_MAX_TRADES = 300

/** What the score card can be showing. */
export type PnlScore =
  | {
      state: "scored"
      score: number
      reasons: string[]
      provider: string
      model: string
      /** When the model answered, epoch ms. */
      at: number
      trades: number
    }
  /** No AI key is saved for any provider that writes. */
  | { state: "no-key" }
  /** Nothing closed in the period, so there is nothing to score. */
  | { state: "no-trades" }
  /** The provider was asked and did not answer usefully. */
  | { state: "failed"; message: string }

/**
 * What the cached answer was built from: the ids of the trades in the period,
 * so a cached score is reused until a trade closes, is removed, or the period
 * rolls over to a different set. Order-free, so a re-read that lists the same
 * trades in another order still hits.
 */
export function scoreTradesKey(trades: readonly { id: string }[]): string {
  const ids = trades.map((trade) => trade.id).sort()
  // A short, stable digest rather than the whole list: the row it is kept in
  // would otherwise grow with every trade.
  let hash = 0x811c9dc5
  for (const id of ids) {
    for (let index = 0; index < id.length; index += 1) {
      hash ^= id.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    hash ^= 0x2c
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${ids.length}:${hash.toString(16)}`
}

function torontoClock(at: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PNL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(at))
    .replace(",", "")
}

function money(value: number): string {
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`
}

/**
 * The words sent to the model. One line per trade, newest first, and the
 * exact shape of answer wanted back, so the reply can be read by a machine.
 * Everything here is what the Journal already shows; nothing about the
 * account, the wallet or the person goes with it.
 */
export function buildScorePrompt(
  trades: readonly PnlTrade[],
  period: PnlPeriod
): string {
  const listed = [...trades]
    .sort((left, right) => right.closedAt - left.closedAt)
    .slice(0, SCORE_MAX_TRADES)
  const lines = listed.map((trade) =>
    [
      trade.symbol,
      trade.direction,
      `entered ${torontoClock(trade.openedAt)}`,
      `exited ${torontoClock(trade.closedAt)}`,
      `in at ${trade.entryPx}`,
      `out at ${trade.exitPx}`,
      `size ${trade.sz}`,
      `put in ${money(trade.amountUsd)}`,
      `${trade.pnl >= 0 ? "made" : "lost"} ${money(Math.abs(trade.pnl))}`,
      `fees ${money(trade.fees)}`,
      trade.hadStop ? "stop on" : "stop off",
      trade.overrode ? "rules overridden" : "rules kept",
      `ended: ${trade.ending}`,
    ].join(", ")
  )
  return [
    `You are reviewing a trader's closed trades for the period "${PNL_PERIOD_LABELS[period]}". Times are in Toronto.`,
    "Score the trading from 0 to 100, where 100 is disciplined and profitable: consistent sizing, stops on, rules kept, losses cut, and winners that outweigh losers. Then give three reasons in plain sentences a non-trader would follow, each naming what the trades show, with dollars where it helps.",
    "Answer with JSON only, exactly this shape and nothing else:",
    '{"score": 62, "reasons": ["First reason.", "Second reason.", "Third reason."]}',
    "",
    `${listed.length} trades${trades.length > listed.length ? ` (the newest ${listed.length} of ${trades.length})` : ""}:`,
    ...lines,
  ].join("\n")
}

/**
 * The model's answer read back into a score and three reasons, or null when
 * the reply is not the shape that was asked for. Tolerates prose or a code
 * fence around the JSON, which every provider produces now and then.
 */
export function parseScoreAnswer(
  text: string
): { score: number; reasons: string[] } | null {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object") return null
  const { score, reasons } = parsed as { score?: unknown; reasons?: unknown }
  if (typeof score !== "number" || !Number.isFinite(score)) return null
  if (!Array.isArray(reasons)) return null
  const sentences = reasons
    .filter((reason): reason is string => typeof reason === "string")
    .map((reason) => reason.trim())
    .filter((reason) => reason !== "")
    .slice(0, 3)
  if (sentences.length === 0) return null
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: sentences,
  }
}
