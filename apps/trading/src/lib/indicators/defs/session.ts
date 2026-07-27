import { z } from "zod"

import {
  SESSION_KEYS,
  SESSION_RANGE_PAD_MS,
  sessionBoxes,
  sessionLabel,
  sessionsInRange,
} from "@/lib/trading/sessions"
import type {
  IndicatorCandle,
  IndicatorModule,
  IndicatorOutput,
  IndicatorSignal,
} from "../contract"

const paramsSchema = z.object({
  /** Which trading session the run has to happen inside. */
  session: z.enum(SESSION_KEYS).default("nyse"),
  /**
   * How many times longer than the body a wick must be before the last candle
   * counts as an inverted hammer (long) or a hanging man (short) and the
   * signal is thrown away. Same meaning and default as the Price Action
   * indicator's setting of the same name.
   */
  wickBodyRatio: z.number().min(0.5).max(10).default(2),
})

export type SessionParams = z.infer<typeof paramsSchema>

/** The timeframe of a candle series: the smallest step between two candles.
 * A gap in the data can only ever make a step bigger, never smaller. */
function intervalMsOf(candles: IndicatorCandle[]): number {
  let smallest = Infinity
  for (let i = 1; i < candles.length; i += 1) {
    const step = candles[i].t - candles[i - 1].t
    if (step > 0 && step < smallest) smallest = step
  }
  return Number.isFinite(smallest) ? smallest : 60_000
}

/** The candle body: how far it travelled from open to close, wicks ignored. */
function body(candle: IndicatorCandle): number {
  return Math.abs(candle.c - candle.o)
}

/** +1 green, -1 red, 0 for a candle that closed exactly where it opened. */
function direction(candle: IndicatorCandle): number {
  return Math.sign(candle.c - candle.o)
}

/** The body sits inside this share of the candle's range for a wick pattern. */
const BODY_ZONE = 1 / 3

/**
 * An inverted hammer: a small body parked at the BOTTOM of the candle with a
 * long wick above it — the market tried higher and was pushed back, so it is
 * not the candle to buy the third green bar on.
 */
function isInvertedHammer(candle: IndicatorCandle, wickBodyRatio: number): boolean {
  const range = candle.h - candle.l
  if (range <= 0) return false
  const upperWick = candle.h - Math.max(candle.o, candle.c)
  return (
    upperWick >= wickBodyRatio * body(candle) &&
    Math.max(candle.o, candle.c) <= candle.l + range * BODY_ZONE
  )
}

/**
 * A hanging man: the mirror image — a small body at the TOP of the candle with
 * a long wick below it. Buyers stepped in down there, so it is not the candle
 * to sell the third red bar on.
 */
function isHangingMan(candle: IndicatorCandle, wickBodyRatio: number): boolean {
  const range = candle.h - candle.l
  if (range <= 0) return false
  const lowerWick = Math.min(candle.o, candle.c) - candle.l
  return (
    lowerWick >= wickBodyRatio * body(candle) &&
    Math.min(candle.o, candle.c) >= candle.h - range * BODY_ZONE
  )
}

/**
 * The session run: inside one session, three candles in a row of the same
 * colour, where at least one of the last two has a body at least as big as the
 * first one's, and the third candle is not the rejection shape for that side.
 * Three green candles buy; three red candles sell.
 *
 * Counting restarts at every session open, and a session fires AT MOST ONCE —
 * the first run that passes every rule. Later runs in the same session are
 * ignored until the next session opens.
 *
 * A candle belongs to a session when its open time falls between the session's
 * open and close, which is the same boundary the chart's session shading snaps
 * to. A session that was already running before the first candle is skipped
 * outright: its opening candles are missing, so "the first run of the session"
 * cannot be answered honestly for it.
 */
function sessionRunSignals(
  candles: IndicatorCandle[],
  params: SessionParams
): IndicatorSignal[] {
  if (candles.length === 0) return []
  const firstMs = candles[0].t
  const lastMs = candles[candles.length - 1].t
  // Padded both ways: sessions are clipped to the range asked for, so without
  // it the first candle would look like a session open and the last candle
  // would fall outside its own session — and a live bot would then disagree
  // with the chart.
  const spans = sessionsInRange(
    params.session,
    firstMs - SESSION_RANGE_PAD_MS,
    lastMs + SESSION_RANGE_PAD_MS
  )
  const signals: IndicatorSignal[] = []
  // Sessions come back in order and never overlap, so one forward-only cursor
  // walks the candles once for the whole series.
  let cursor = 0
  for (const span of spans) {
    if (span.openMs < firstMs) continue
    while (cursor < candles.length && candles[cursor].t < span.openMs) {
      cursor += 1
    }
    const start = cursor
    for (let i = start; i < candles.length && candles[i].t < span.closeMs; i += 1) {
      // Only candles since this session opened count, so the run can never
      // reach back into the quiet hours before the open.
      if (i - start < 2) continue
      const first = candles[i - 2]
      const second = candles[i - 1]
      const last = candles[i]
      const side = direction(first)
      if (side === 0) continue
      if (direction(second) !== side || direction(last) !== side) continue
      // At least one of the last two must match or beat the first one's body:
      // a run that fades away is not the run this is looking for.
      if (Math.max(body(second), body(last)) < body(first)) continue
      const rejected =
        side > 0
          ? isInvertedHammer(last, params.wickBodyRatio)
          : isHangingMan(last, params.wickBodyRatio)
      if (rejected) continue
      signals.push({ time: last.t, side: side > 0 ? "buy" : "sell" })
      break
    }
  }
  return signals
}

/**
 * Sessions: the chart's session shading, plus a signal for the first strong
 * run of candles after the session opens. The shading is drawn through the
 * chart's own "session" overlay, so an automation using this node paints
 * exactly what the trade chart paints.
 */
export const sessionIndicator: IndicatorModule<SessionParams> = {
  type: "session",
  label: "Sessions",
  description:
    "Buys the first three green candles in a row after a session opens, and sells the first three red ones.",
  paramsSchema,
  defaultParams: {
    session: "nyse",
    wickBodyRatio: 2,
  },
  paramFields: [
    {
      key: "session",
      label: "Session",
      kind: "select",
      options: [...SESSION_KEYS],
      optionLabels: SESSION_KEYS.map(sessionLabel),
      info: "Which trading session's opening hours the run of candles has to happen inside.",
    },
    {
      key: "wickBodyRatio",
      label: "Wick/body ratio",
      step: 0.5,
      info: "How many times longer than its body a wick makes the last candle a rejection (an inverted hammer going long, a hanging man going short), which cancels the signal.",
    },
  ],
  // Enough candles to hold a whole session open on any timeframe the session
  // shading is useful on. A window that starts mid-session simply skips that
  // session rather than guessing at the candles it never saw.
  warmupBars: () => 300,

  compute: (candles, params): IndicatorOutput => ({
    paint: {
      indicators: [
        {
          id: "session",
          type: "session",
          enabled: true,
          params: { wickBodyRatio: params.wickBodyRatio },
          session: params.session,
        },
      ],
      lines: [],
      // The same shaded hours the trade chart's Sessions overlay draws, so a
      // backtest of this node shows the run arrows inside their own session.
      zones: sessionBoxes(
        params.session,
        candles,
        intervalMsOf(candles)
      ).map((box) => ({
        id: box.id,
        fromMs: box.fromMs,
        toMs: box.toMs,
        top: box.high,
        bottom: box.low,
      })),
      barColors: [],
    },
    signals: sessionRunSignals(candles, params),
  }),
}
