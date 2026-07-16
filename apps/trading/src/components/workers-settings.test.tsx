import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { WorkersDashboardData } from "@/lib/workers"

import { WorkersSettings } from "./workers-settings"

const worker = {
  enabled: true,
  paused: false,
  updatedAt: "2026-07-15T12:00:00.000Z",
  state: "running" as const,
  online: true,
  active: true,
  activeProcesses: 1,
  role: "leader" as const,
  startedAt: "2026-07-15T11:00:00.000Z",
  lastHeartbeatAt: "2026-07-15T12:00:00.000Z",
  lastSuccessfulWorkAt: "2026-07-15T11:59:00.000Z",
  currentActivity: "Running",
  latestError: null,
  userPaused: null,
  metrics: [{ label: "Running", value: "1" }],
}

const initial: WorkersDashboardData = {
  checkedAt: "2026-07-15T12:00:00.000Z",
  canControl: true,
  overview: { online: 5, active: 5, pausedOrOff: 0, needsAttention: 0 },
  workers: [
    {
      ...worker,
      kind: "bot",
      label: "Bot Worker",
      description: "Runs bots.",
    },
    {
      ...worker,
      kind: "whale-scanner",
      label: "Whale Scanner",
      description: "Collects whale activity.",
    },
    {
      ...worker,
      kind: "market-scanner",
      label: "Market Scanner",
      description: "Evaluates market rules.",
      userPaused: false,
    },
    {
      ...worker,
      kind: "alert",
      label: "Alert Worker",
      description: "Watches Trade alerts.",
    },
    {
      ...worker,
      kind: "backtest",
      label: "Backtest Worker",
      description: "Runs backtests.",
    },
  ],
}

describe("WorkersSettings", () => {
  it("shows every worker and keeps controls in Settings", () => {
    const markup = renderToStaticMarkup(<WorkersSettings initial={initial} />)

    expect(markup).toContain("Bot Worker")
    expect(markup).toContain("Whale Scanner")
    expect(markup).toContain("Market Scanner")
    expect(markup).toContain("Alert Worker")
    expect(markup).toContain("Backtest Worker")
    expect(markup).toContain("Pause my rules")
    expect(markup.match(/Turn off/g)).toHaveLength(5)
    expect(markup.match(/>Pause</g)).toHaveLength(5)
  })
})
