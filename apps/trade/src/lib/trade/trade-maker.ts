import type { FillOwner, LiveFill } from "@/lib/trade/live-trades"

/**
 * Who placed a trade, as the Journal filter and the details panel name it
 * (Tyler, 10 Nov 2026, picks "Who placed it" and "Filter the Journal by who
 * placed it").
 */
export const TRADE_MAKERS = ["hand", "grid", "dca", "signal", "bot", "copied"] as const
export type TradeMaker = (typeof TRADE_MAKERS)[number]

export const TRADE_MAKER_LABELS: Record<TradeMaker, string> = {
  hand: "By hand",
  grid: "Grid",
  dca: "DCA",
  signal: "Signal",
  bot: "Bot",
  copied: "Copied",
}

/**
 * Who placed a run of fills.
 *
 * A copy wins, then a bot, then the first smart order found on a fill. A
 * watched price is a plain order waiting to be sent, so its fill reads as
 * placed by hand, the same as everywhere else in the app.
 */
export function tradeMaker(
  fills: readonly Pick<LiveFill, "owner">[],
  copiedFrom?: string
): TradeMaker {
  if (copiedFrom) return "copied"
  const owners = fills.flatMap((fill) => (fill.owner ? [fill.owner] : []))
  if (owners.some((owner) => owner.flowRunId !== null)) return "bot"
  for (const owner of owners) {
    if (owner.kind !== "watch") return owner.kind
  }
  return "hand"
}

/** The bot run behind a run of fills, when a bot placed any of them. */
export function tradeFlowRunId(fills: readonly Pick<LiveFill, "owner">[]): string | null {
  return fills.find((fill) => fill.owner?.flowRunId)?.owner?.flowRunId ?? null
}

/** The smart order behind a run of fills, when one placed any of them. */
export function tradeSmartOwner(fills: readonly Pick<LiveFill, "owner">[]): FillOwner | null {
  return fills.find((fill) => fill.owner && fill.owner.kind !== "watch")?.owner ?? null
}
