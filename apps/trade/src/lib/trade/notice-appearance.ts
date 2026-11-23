import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  PowerIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
} from "lucide-react"

import type { AppNoticeCategory, AppNoticeDetail } from "@/lib/app-options"
import {
  LOST_MONEY_SURFACE,
  MADE_MONEY_SURFACE,
  WARNING_SURFACE,
} from "@/lib/trade/money-tone"
import { readBackNotice } from "@/lib/trade/notice-sentences"
import type { TradeNoticeKind } from "@/lib/trade/trade-notice-words"

/**
 * How a trade notice is drawn in the bell: which tab it sits under, which
 * icon is on its tile, and what colour that tile is.
 *
 * Browser-safe and pure, because the shell draws these in the tray while the
 * figures behind them come off the server. The server sends the plain pieces —
 * a heading, a few facts, a kind and a level — and this turns them into the
 * tile. Keeping the two apart is what lets the same notice be drawn on the
 * Notifications page without a second round trip.
 */

/** The tabs this app adds to the tray, after the shell's Unread and All. */
export const TRADE_NOTICE_CATEGORIES: readonly AppNoticeCategory[] = [
  { id: "trades", label: "Trades" },
  { id: "alerts", label: "Alerts" },
  { id: "system", label: "System" },
]

/**
 * Which tab a notice sits under.
 *
 * A notice written before 4 October 2026 has no kind saved, and a notice the
 * app wrote without going through `writeTradeNotice` has no row at all. Both
 * count as System, which is the honest home for "something the app did".
 */
export function tradeNoticeCategory(kind: TradeNoticeKind | null): string {
  if (kind === "entered" || kind === "exited" || kind === "liquidated") {
    return "trades"
  }
  if (kind === "alert") return "alerts"
  return "system"
}

/**
 * The icon on the tile.
 *
 * An arrow in for money going into a trade and an arrow out for money coming
 * back, which is the same pair of arrows the chart draws on a fill. A
 * liquidation is not an exit the person chose, so it wears the warning
 * triangle rather than the ordinary way out.
 */
function tradeNoticeIcon(kind: TradeNoticeKind | null) {
  if (kind === "entered") return ArrowDownLeftIcon
  if (kind === "exited") return ArrowUpRightIcon
  if (kind === "liquidated") return TriangleAlertIcon
  if (kind === "alert") return TrendingUpIcon
  return PowerIcon
}

/**
 * The tile's colour, which is the notice's level and nothing else.
 *
 * Green for an ordinary trade, amber for one that lost money or a line that
 * fired, red for a liquidation. The level is already the judgement the words
 * made — a close that ended up losing is a warning even when its first piece
 * looked ordinary — so reading it again here would be the same call made twice
 * and two places for it to drift.
 */
function tradeNoticeTone(
  kind: TradeNoticeKind | null,
  level: "info" | "warning" | "critical"
): string | undefined {
  if (kind === null || kind === "system") return undefined
  if (level === "critical") return LOST_MONEY_SURFACE
  if (level === "warning" || kind === "alert") return WARNING_SURFACE
  return MADE_MONEY_SURFACE
}

/** What the server saved about one notice, as the browser receives it. */
export type TradeNoticeRow = {
  href: string | null
  headline: string | null
  meta: string[] | null
  kind: TradeNoticeKind | null
  level: "info" | "warning" | "critical"
}

/**
 * One notice, turned into what the shell draws.
 *
 * **Saved pieces win, and the sentence is read back when there are none.**
 * Every notice written since 4 October 2026 saved its heading, figures and kind
 * when it was written, and that is always the truth. The thousands written
 * before it saved only a sentence, and `readBackNotice` recovers the same
 * pieces from it — so the bell draws one shape for its whole history instead of
 * the new one for today and the old one for everything else.
 *
 */
export function tradeNoticeDetail(
  row: TradeNoticeRow,
  words: { message: string | null; detail: string | null }
): AppNoticeDetail {
  const readBack = row.headline
    ? null
    : readBackNotice(words.message, words.detail)
  const headline = row.headline ?? readBack?.headline ?? null
  // Checked rather than trusted. `meta` is a jsonb column typed by assertion,
  // so a row holding anything else would throw on `join` and take the whole
  // tray down with it rather than losing one line.
  const meta = Array.isArray(row.meta) ? row.meta : (readBack?.meta ?? null)
  const kind = row.kind ?? readBack?.kind ?? null
  // The saved level is the truth when the saved kind is. A row with neither is
  // an old notice, and its own words are the only judgement there is.
  const level = row.kind ? row.level : (readBack?.level ?? row.level)
  return {
    href: row.href ?? undefined,
    categoryId: tradeNoticeCategory(kind),
    title: headline ?? undefined,
    meta: meta ?? undefined,
    // The figures already carry the sentence's whole point — "filled",
    // "made $8.12" — so a notice with figures never says it twice. One whose
    // sentence could not be read back has nothing else to show, so the shell's
    // own fallback stands.
    body: headline ? "" : undefined,
    icon: tradeNoticeIcon(kind),
    toneClassName: tradeNoticeTone(kind, level),
  }
}

/** The same, for a notice this app has no saved row for at all. */
export const NO_SAVED_NOTICE_ROW: TradeNoticeRow = {
  href: null,
  headline: null,
  meta: null,
  kind: null,
  level: "info",
}
