import { describe, expect, it } from "vitest"

import {
  buildScorePrompt,
  parseScoreAnswer,
  scoreTradesKey,
} from "@/lib/trade/pnl/score"
import type { PnlTrade } from "@/lib/trade/pnl/patterns"
import { dayStart } from "@/lib/trade/pnl/periods"

const one: PnlTrade = {
  id: "w1:BTC:1",
  symbol: "BTC",
  direction: "short",
  openedAt: dayStart("2026-09-01") + 22.5 * 3_600_000,
  closedAt: dayStart("2026-09-02") + 3_600_000,
  heldMs: 2.5 * 3_600_000,
  entryPx: 100,
  exitPx: 104,
  sz: 2,
  amountUsd: 200,
  pnl: -8.4,
  fees: 0.4,
  hadStop: false,
  overrode: true,
  ending: "closed",
}

describe("score cache key", () => {
  it("is the same whatever order the trades come in, and changes when one closes", () => {
    const key = scoreTradesKey([{ id: "a" }, { id: "b" }])
    expect(scoreTradesKey([{ id: "b" }, { id: "a" }])).toBe(key)
    expect(scoreTradesKey([{ id: "a" }, { id: "b" }, { id: "c" }])).not.toBe(
      key
    )
    expect(key.startsWith("2:")).toBe(true)
  })
})

describe("score prompt", () => {
  it("sends each trade as one plain line in Toronto time", () => {
    const prompt = buildScorePrompt([one], "month")
    expect(prompt).toContain("1 trades:")
    expect(prompt).toContain(
      "BTC, short, entered 2026-09-01 22:30, exited 2026-09-02 01:00, in at 100, out at 104, size 2, put in $200.00, lost $8.40, fees $0.40, stop off, rules overridden, ended: closed"
    )
    expect(prompt).toContain('{"score": 62')
  })
})

describe("score answer", () => {
  it("reads the JSON out of a fenced or wordy reply", () => {
    expect(
      parseScoreAnswer(
        'Here you go:\n```json\n{"score": 62.4, "reasons": ["A.", "B.", "C.", "D."]}\n```'
      )
    ).toEqual({ score: 62, reasons: ["A.", "B.", "C."] })
  })

  it("refuses an answer with no score or no reasons", () => {
    expect(parseScoreAnswer("no json here")).toBeNull()
    expect(parseScoreAnswer('{"score": "high", "reasons": ["A."]}')).toBeNull()
    expect(parseScoreAnswer('{"score": 50, "reasons": []}')).toBeNull()
    expect(parseScoreAnswer('{"score": 140, "reasons": ["A."]}')).toEqual({
      score: 100,
      reasons: ["A."],
    })
  })
})
