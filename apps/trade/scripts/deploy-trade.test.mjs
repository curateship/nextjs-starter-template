import { describe, expect, it } from "vitest"

import {
  appsToDeploy,
  buildLogTail,
  deploymentLine,
  deploymentOver,
} from "./deploy-trade.mjs"

describe("deploying all three Trade apps", () => {
  it("always goes web, then worker, then engine last", () => {
    // The engine last: its lock is free for a few seconds when it restarts,
    // and nothing old may be alive to take it — 4 Sep 2026, 22:18 UTC.
    expect(appsToDeploy(null)).toEqual(["web", "worker", "engine"])
    // Whatever order --only names them in, the fixed order wins.
    expect(appsToDeploy("engine,web")).toEqual(["web", "engine"])
  })

  it("refuses an app it does not know instead of skipping it quietly", () => {
    expect(() => appsToDeploy("engine,database")).toThrow("Unknown app database")
  })

  it("knows when Coolify has stopped working on a build", () => {
    expect(deploymentOver("queued")).toBe(false)
    expect(deploymentOver("in_progress")).toBe(false)
    expect(deploymentOver("finished")).toBe(true)
    expect(deploymentOver("failed")).toBe(true)
    expect(deploymentOver("cancelled")).toBe(true)
  })

  it("says the status and the short commit on one line", () => {
    expect(deploymentLine("engine", { status: "in_progress", commit: "abc1234def" })).toBe(
      "engine: in_progress (abc1234)"
    )
    expect(deploymentLine("web", { status: "queued" })).toBe("web: queued")
    expect(deploymentLine("web", null)).toBe("web: unknown")
  })

  it("shows the last lines of a failed build's log, skipping what Coolify hides", () => {
    const logs = JSON.stringify([
      { output: "Step 1/9 : FROM node", hidden: false },
      { output: "secret env dump", hidden: true },
      { output: "ERROR: failed to solve: process did not complete\n", hidden: false },
    ])
    expect(buildLogTail(logs)).toEqual([
      "Step 1/9 : FROM node",
      "ERROR: failed to solve: process did not complete",
    ])
    expect(buildLogTail("plain\ntext\nlog", 2)).toEqual(["text", "log"])
    expect(buildLogTail(null)).toEqual([])
  })
})
