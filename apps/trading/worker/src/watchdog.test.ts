import { describe, expect, it } from "vitest"

import {
  evaluateWorkerLiveness,
  workerDownDraft,
  workerRecoveredDraft,
  type WatchdogControlRow,
} from "./watchdog"

const NOW = new Date("2026-07-16T12:00:00Z")

function heartbeat(kind: string, ageMs: number, cadenceMs = 10_000) {
  return {
    lastSeenAt: new Date(NOW.getTime() - ageMs),
    meta: { workerKind: kind, heartbeatIntervalMs: cadenceMs },
  }
}

function runningControls(): WatchdogControlRow[] {
  return ["bot", "whale-scanner", "market-scanner", "alert", "backtest"].map(
    (kind) => ({ kind, enabled: true, paused: false })
  )
}

function verdictFor(
  kind: string,
  verdicts: ReturnType<typeof evaluateWorkerLiveness>
) {
  const verdict = verdicts.find((entry) => entry.kind === kind)
  if (!verdict) throw new Error(`no verdict for ${kind}`)
  return verdict
}

describe("evaluateWorkerLiveness", () => {
  it("treats fresh heartbeats as ok and never judges itself", () => {
    const verdicts = evaluateWorkerLiveness({
      selfKind: "alert",
      now: NOW,
      heartbeats: [
        heartbeat("bot", 5_000),
        heartbeat("whale-scanner", 20_000),
        heartbeat("market-scanner", 0),
        heartbeat("backtest", 59_000),
      ],
      controls: runningControls(),
    })
    expect(verdicts.map((verdict) => verdict.kind)).not.toContain("alert")
    expect(verdicts.every((verdict) => verdict.state === "ok")).toBe(true)
  })

  it("flags a stale running worker as down with the gap start", () => {
    const verdicts = evaluateWorkerLiveness({
      selfKind: "alert",
      now: NOW,
      heartbeats: [
        heartbeat("bot", 90_000),
        heartbeat("whale-scanner", 5_000),
        heartbeat("market-scanner", 5_000),
        heartbeat("backtest", 5_000),
      ],
      controls: runningControls(),
    })
    const bot = verdictFor("bot", verdicts)
    expect(bot.state).toBe("down")
    expect(bot.gapStartedAt).toEqual(new Date(NOW.getTime() - 90_000))
  })

  it("stays quiet for a stale worker that was deliberately paused or off", () => {
    const controls = runningControls().map((control) =>
      control.kind === "bot"
        ? { ...control, paused: true }
        : control.kind === "backtest"
          ? { ...control, enabled: false }
          : control
    )
    const verdicts = evaluateWorkerLiveness({
      selfKind: "alert",
      now: NOW,
      heartbeats: [heartbeat("bot", 90_000), heartbeat("backtest", 90_000)],
      controls,
    })
    expect(verdictFor("bot", verdicts).state).toBe("paused")
    expect(verdictFor("backtest", verdicts).state).toBe("paused")
  })

  it("stays quiet for a worker that never wrote a heartbeat", () => {
    const verdicts = evaluateWorkerLiveness({
      selfKind: "alert",
      now: NOW,
      heartbeats: [],
      controls: runningControls(),
    })
    expect(verdicts.every((verdict) => verdict.state === "missing")).toBe(true)
  })

  it("scales the threshold from the worker's own cadence", () => {
    const verdicts = evaluateWorkerLiveness({
      selfKind: "alert",
      now: NOW,
      // 60s cadence → 180s threshold: 100s old is fine, 200s old is dead.
      heartbeats: [
        heartbeat("bot", 100_000, 60_000),
        heartbeat("backtest", 200_000, 60_000),
      ],
      controls: runningControls(),
    })
    expect(verdictFor("bot", verdicts).state).toBe("ok")
    expect(verdictFor("backtest", verdicts).state).toBe("down")
  })

  it("keeps a floor under the threshold so short cadences don't false-alarm", () => {
    const verdicts = evaluateWorkerLiveness({
      selfKind: "alert",
      now: NOW,
      // 3 × 10s cadence would be 30s, but the 60s floor keeps a 45s gap ok.
      heartbeats: [heartbeat("bot", 45_000)],
      controls: runningControls(),
    })
    expect(verdictFor("bot", verdicts).state).toBe("ok")
  })

  it("judges a kind by its newest heartbeat when old rows linger", () => {
    const verdicts = evaluateWorkerLiveness({
      selfKind: "alert",
      now: NOW,
      heartbeats: [heartbeat("bot", 600_000), heartbeat("bot", 5_000)],
      controls: runningControls(),
    })
    expect(verdictFor("bot", verdicts).state).toBe("ok")
  })

  it("marks a returned heartbeat ok even while the workload is paused", () => {
    const controls = runningControls().map((control) =>
      control.kind === "bot" ? { ...control, paused: true } : control
    )
    const verdicts = evaluateWorkerLiveness({
      selfKind: "alert",
      now: NOW,
      heartbeats: [heartbeat("bot", 5_000)],
      controls,
    })
    expect(verdictFor("bot", verdicts).state).toBe("ok")
  })
})

describe("watchdog alert drafts", () => {
  const gapStart = new Date("2026-07-16T11:57:00Z")

  it("keys one urgent alert per outage when the bot worker dies exposed", () => {
    const draft = workerDownDraft("bot", gapStart, true, "alert")
    expect(draft.type).toBe("worker_down")
    expect(draft.title).toContain("URGENT")
    expect(draft.dedupeKey).toBe(`worker-down:bot:${gapStart.getTime()}`)
    expect(draft.data).toMatchObject({
      workerKind: "bot",
      urgent: true,
      exposure: true,
      detectedBy: "alert",
    })
  })

  it("stays low-key when the bot worker dies with nothing at risk", () => {
    const draft = workerDownDraft("bot", gapStart, false, "backtest")
    expect(draft.title).not.toContain("URGENT")
    expect(draft.body).toContain("nothing is at risk")
    expect(draft.data).toMatchObject({ urgent: false, exposure: false })
  })

  it("never marks a non-bot death urgent, even with exposure", () => {
    const draft = workerDownDraft("alert", gapStart, true, "bot")
    expect(draft.title).toBe("Alert Worker is down")
    expect(draft.data).toMatchObject({ urgent: false, exposure: true })
  })

  it("keys the recovery notice to the same outage gap", () => {
    const draft = workerRecoveredDraft("bot", gapStart)
    expect(draft.type).toBe("worker_recovered")
    expect(draft.dedupeKey).toBe(`worker-recovered:bot:${gapStart.getTime()}`)
    expect(draft.body).toContain("rechecked")
  })
})
