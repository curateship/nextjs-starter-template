import { and, asc, eq, isNotNull, sql } from "drizzle-orm"

import {
  MAX_RECENT_FIRED_LINE_ALERTS,
  type LineAlert,
  type LineAlertList,
} from "@/lib/trade/line-alerts"

import {
  marketChartHref,
  parseMarketKey,
  type CandleBar,
  type CandleInterval,
  type MarketKey,
} from "@/lib/protocols/contracts"
import { priceAlertDirection } from "@/lib/trade/price-alerts"
import {
  alertFirePrice,
  drawingAlertArmed,
  DRAWING_VOLUME_LOOKBACK,
  priceAtTime,
  readDrawingAlert,
  readDrawingShape,
  volumeConfirmsBreak,
} from "@/lib/trade/drawings"
import {
  candleCloseTime,
  loadFinishedCandles,
} from "@/server/trade/alert-candles"
import { drawingAlertNoticeWords } from "@/lib/trade/trade-notice-words"
import { db, type CustomShellDb } from "@/server/db"
import { writeTradeNotice } from "@/server/trade/notices"
import { loadLineAlertsPaused } from "@/server/trade/prefs"
import { tradeChartDrawings, tradePrefs } from "@/server/trade/schema"

/**
 * Every line alert one account has, armed ones oldest first and fired ones
 * newest first, for the Alerts panel to list beside the price alerts.
 */
export async function loadDrawingAlerts(
  userId: string,
  now = Date.now(),
  database: CustomShellDb = db
): Promise<LineAlertList> {
  const [rows, paused] = await Promise.all([
    database
      .select({
        id: tradeChartDrawings.id,
        marketKey: tradeChartDrawings.marketKey,
        shape: tradeChartDrawings.shape,
        alert: tradeChartDrawings.alert,
      })
      .from(tradeChartDrawings)
      .where(
        and(
          eq(tradeChartDrawings.userId, userId),
          isNotNull(tradeChartDrawings.alert)
        )
      ),
    loadLineAlertsPaused(userId, database),
  ])

  const armed: LineAlert[] = []
  const fired: LineAlert[] = []
  for (const row of rows) {
    const alert = readDrawingAlert(row.alert)
    const shape = readDrawingShape(row.shape)
    if (
      !alert ||
      !shape ||
      (shape.kind !== "level" && shape.kind !== "trendline")
    )
      continue
    const listed: LineAlert = {
      id: row.id,
      marketKey: row.marketKey,
      kind: shape.kind,
      price: alert.firedPrice ?? priceAtTime(shape, alert.firedAt ?? now),
      direction: alert.direction,
      armedAt: alert.armedAt,
      firedAt: alert.firedAt,
      name: shape.name ?? null,
    }
    if (alert.firedAt === null) armed.push(listed)
    else fired.push(listed)
  }
  armed.sort((a, b) => a.armedAt - b.armedAt || a.id.localeCompare(b.id))
  fired.sort(
    (a, b) => (b.firedAt ?? 0) - (a.firedAt ?? 0) || a.id.localeCompare(b.id)
  )
  return { armed, fired: fired.slice(0, MAX_RECENT_FIRED_LINE_ALERTS), paused }
}

/**
 * One armed line, as the firing loop holds it: the stored row with its alert
 * and shape already read.
 */
type ArmedLine = {
  userId: string
  id: string
  marketKey: string
  shape: NonNullable<ReturnType<typeof readDrawingShape>>
  alert: NonNullable<ReturnType<typeof readDrawingAlert>>
}

/**
 * What a break is once one has happened: where the line was, where it had to
 * be crossed, what crossed it, and the candle that did if there was one.
 */
type Break = {
  linePrice: number
  firePrice: number
  /** The price compared: a live tick, or a finished candle's close. */
  at: number
}

/** The Touch rule, unchanged: the live price is at or past the line. */
function touchBroke(
  row: ArmedLine,
  mark: number | undefined,
  now: number
): Break | null {
  if (mark === undefined) return null
  const linePrice = priceAtTime(row.shape, now)
  if (linePrice === null) return null
  // Not the line, but the line moved by however far past it the person asked
  // the price to go before this counts as a break.
  const firePrice = alertFirePrice(
    linePrice,
    row.alert.direction,
    row.alert.buffer
  )
  const crossed =
    row.alert.direction === "above" ? mark >= firePrice : mark <= firePrice
  return crossed ? { linePrice, firePrice, at: mark } : null
}

/**
 * The Close rule: the newest finished candle closed on the far side of the
 * line, and its volume cleared the bar if one was asked for.
 *
 * **The newest finished candle only.** The store publishes some time after a
 * candle closes, so this runs a little late rather than at the close itself;
 * what it must never do is reach back and fire on a candle from this morning
 * because that is the first one it happened to read.
 *
 * **Nothing that closed before the switch went on.** Arming a line while the
 * last finished candle already sits past it would otherwise ring at once, on
 * news that was old when the alert was made.
 *
 * **The line is read at the candle's close**, not at now, so a trendline is
 * compared where it actually was when the candle finished.
 */
function closeBroke(row: ArmedLine, bars: readonly CandleBar[]): Break | null {
  const interval = row.alert.closeInterval
  if (interval === undefined) return null
  const breaking = bars.at(-1)
  if (!breaking) return null

  const closedAt = candleCloseTime(breaking.openTime, interval)
  if (closedAt <= row.alert.armedAt) return null

  const linePrice = priceAtTime(row.shape, closedAt)
  if (linePrice === null) return null
  const firePrice = alertFirePrice(
    linePrice,
    row.alert.direction,
    row.alert.buffer
  )
  const crossed =
    row.alert.direction === "above"
      ? breaking.close >= firePrice
      : breaking.close <= firePrice
  if (!crossed) return null

  // A break on thin volume is often a fake, so a line that asked for volume
  // waits rather than firing when the app cannot judge it.
  // `volumeConfirmsBreak` says which is which.
  if (row.alert.volumeMultiple !== undefined) {
    const confirmed = volumeConfirmsBreak({
      breaking: breaking.volume,
      previous: bars.slice(0, -1).map((bar) => bar.volume),
      multiple: row.alert.volumeMultiple,
    })
    if (confirmed !== true) return null
  }

  return { linePrice, firePrice, at: breaking.close }
}

/**
 * Fire every armed drawn line the price has crossed.
 *
 * The same shape as `checkPriceAlerts`, and run beside it once per engine
 * pass. A level is the same price at every moment. A trendline's price at
 * "now" is its slope carried on, so a line drawn through last week is
 * compared at today's point on it. A market with no pushed price waits.
 *
 * The conditional update is the claim, and it names the line's points as well
 * as the alert: a line dragged somewhere else after the engine read it, or an
 * alert switched off meanwhile, changes the row and the claim misses. Two
 * engine containers can both read the row, but only the one whose update
 * changes it writes the notice.
 *
 * An account whose master switch in Settings is off is read too, but a cross
 * on one of its lines fires nothing. Instead the alert is turned to face the
 * price again, so it waits for the price to come back across. That is what
 * makes a cross that happened while paused stay silent after the switch goes
 * back on: the line has to be crossed once more, and then it fires once.
 */
export async function checkDrawingAlerts({
  pushedMarks,
  finishedCandles = loadFinishedCandles,
  checkedAt = new Date(),
  database = db,
}: {
  pushedMarks: (marketKeys: readonly string[]) => {
    marks: ReadonlyMap<string, number>
    missing: string[]
  }
  /**
   * The finished bars a Close alert is judged on. Handed in so a test can say
   * what closed without a store behind it; the engine leaves it alone.
   */
  finishedCandles?: (input: {
    marketKey: MarketKey
    interval: CandleInterval
    count: number
    now: number
    database?: CustomShellDb
  }) => Promise<CandleBar[]>
  checkedAt?: Date
  database?: CustomShellDb
}): Promise<number> {
  const rows = await database
    .select({
      userId: tradeChartDrawings.userId,
      id: tradeChartDrawings.id,
      marketKey: tradeChartDrawings.marketKey,
      shape: tradeChartDrawings.shape,
      alert: tradeChartDrawings.alert,
    })
    .from(tradeChartDrawings)
    // Armed only. A fired record stays on its row for the popover to read,
    // and the engine has no business with it.
    .where(
      and(
        isNotNull(tradeChartDrawings.alert),
        sql`${tradeChartDrawings.alert}->>'firedAt' IS NULL`
      )
    )
    .orderBy(asc(tradeChartDrawings.createdAt), asc(tradeChartDrawings.id))

  const armed = rows.flatMap((row) => {
    const alert = readDrawingAlert(row.alert)
    const shape = readDrawingShape(row.shape)
    return drawingAlertArmed(alert) &&
      alert &&
      shape &&
      (shape.kind === "level" || shape.kind === "trendline")
      ? [{ ...row, alert, shape }]
      : []
  })
  if (armed.length === 0) return 0

  // Only the Touch lines need a pushed price. A Close line is judged on a
  // finished candle, so a market with no live tick still fires.
  const touchKeys = [
    ...new Set(
      armed
        .filter((row) => row.alert.closeInterval === undefined)
        .map((row) => row.marketKey)
    ),
  ]
  const { marks } = pushedMarks(touchKeys)
  const now = checkedAt.getTime()

  // One read per market and timeframe, however many lines share it, and all
  // of them together rather than one after another: each is a round trip to a
  // database a moment away, and this runs inside an engine pass that has
  // orders waiting behind it. Twenty-one bars each: the one that may have
  // broken the line, and the twenty behind it the volume condition averages
  // over.
  const pairs = new Map<
    string,
    { marketKey: MarketKey; interval: CandleInterval }
  >()
  for (const row of armed) {
    const interval = row.alert.closeInterval
    if (interval === undefined) continue
    // The key is checked rather than asserted: a row written by something
    // else, or by an older build, is left waiting instead of being read
    // under a name the catalogue cannot place.
    const marketKey = parseMarketKey(row.marketKey)
      ? (row.marketKey as MarketKey)
      : null
    if (!marketKey) continue
    pairs.set(`${row.marketKey}@${interval}`, { marketKey, interval })
  }
  const candles = new Map<string, CandleBar[]>(
    await Promise.all(
      [...pairs].map(
        async ([pair, ask]) =>
          [
            pair,
            await finishedCandles({
              ...ask,
              count: DRAWING_VOLUME_LOOKBACK + 1,
              now,
              database,
            }),
          ] as const
      )
    )
  )

  let fired = 0
  for (const row of armed) {
    const interval = row.alert.closeInterval
    const broke = interval
      ? closeBroke(row, candles.get(`${row.marketKey}@${interval}`) ?? [])
      : touchBroke(row, marks.get(row.marketKey), now)
    if (!broke) continue
    const { linePrice, firePrice, at } = broke

    // The same guarded write either way, so a line moved or switched off
    // after the read is never touched.
    const claim = and(
      eq(tradeChartDrawings.userId, row.userId),
      eq(tradeChartDrawings.id, row.id),
      eq(tradeChartDrawings.shape, row.shape),
      eq(tradeChartDrawings.alert, row.alert)
    )

    await database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'grid-line-stop:' + row.userId}, 0))`)
      const [prefs] = await tx.select({ paused: tradePrefs.lineAlertsPaused }).from(tradePrefs).where(eq(tradePrefs.userId, row.userId))
      if (prefs?.paused) {
        const direction = priceAlertDirection(linePrice, at)
        if (direction !== row.alert.direction) {
          await tx.update(tradeChartDrawings).set({ alert: { ...row.alert, direction } }).where(claim)
        }
        return
      }

      const claimed = await tx
        .update(tradeChartDrawings)
        .set({ alert: { ...row.alert, firedAt: now, firedPrice: linePrice, firedThreshold: firePrice } })
        .where(claim)
        .returning({ id: tradeChartDrawings.id })
      if (claimed.length === 0) return

      const words = drawingAlertNoticeWords({
        marketKey: row.marketKey,
        kind: row.shape.kind,
        price: linePrice,
        direction: row.alert.direction,
        name: row.shape.name ?? null,
        buffer: row.alert.buffer ?? null,
        closeInterval: row.alert.closeInterval ?? null,
        volumeMultiple: row.alert.volumeMultiple ?? null,
      })
      await writeTradeNotice({
        userId: row.userId,
        title: words.title,
        body: words.body,
        level: words.level,
        href: marketChartHref(row.marketKey),
        soundKind: "alert",
        createdAt: checkedAt,
        database: tx,
      })
      fired += 1
    })
  }
  return fired
}
