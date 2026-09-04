import { describe, expect, it } from "vitest"

import { appsToDeploy, deploymentLine, deploymentOver } from "./deploy-trade.mjs"

describe("deploying all three Trade apps", () => {
  it("always goes engine, then worker, then web", () => {
    expect(appsToDeploy(null)).toEqual(["engine", "worker", "web"])
    // Whatever order --only names them in, the fixed order wins.
    expect(appsToDeploy("web,engine")).toEqual(["engine", "web"])
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
})
