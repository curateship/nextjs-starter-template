import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * One pass, and the promise it hands back.
 *
 * Two things matter here and neither is obvious from reading the code. A job
 * that throws must not take the other jobs down with it — the newsletter still
 * has to go out on the pass where an automation blew up. And the returned
 * promise must never reject, because the worker awaits it to know the pass is
 * over and then writes its heartbeat; a rejection there would look like a
 * stopped loop and get a healthy container killed.
 */

const jobs = vi.hoisted(() => ({
  automations: vi.fn(async () => {}),
  broadcasts: vi.fn(async () => {}),
  appWorkers: [] as { name: string; tick: () => Promise<void> }[],
}))

vi.mock("@/server/automations/engine", () => ({
  runAutomationTick: () => jobs.automations(),
}))
vi.mock("@/server/email/broadcast-send", () => ({
  processDueBroadcasts: () => jobs.broadcasts(),
}))
vi.mock("@/server/app-options", () => ({
  appBackgroundWorkers: () => jobs.appWorkers,
}))

let complained: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  jobs.automations.mockReset().mockResolvedValue(undefined)
  jobs.broadcasts.mockReset().mockResolvedValue(undefined)
  jobs.appWorkers = []
  complained = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  complained.mockRestore()
})

async function pass() {
  const { runBackgroundPass } = await import("@/server/background-pass")
  return runBackgroundPass()
}

describe("a background pass", () => {
  it("runs the shell's own two jobs", async () => {
    await expect(pass()).resolves.toEqual({ failed: 0 })

    expect(jobs.automations).toHaveBeenCalledOnce()
    expect(jobs.broadcasts).toHaveBeenCalledOnce()
  })

  it("also runs the workers the app registered", async () => {
    const ownJob = vi.fn(async () => {})
    jobs.appWorkers = [{ name: "Preview builder", tick: ownJob }]

    await pass()

    expect(ownJob).toHaveBeenCalledOnce()
  })

  it("keeps going when one job throws, and says which", async () => {
    jobs.automations.mockRejectedValue(new Error("boom"))

    // The point of the whole file: the newsletter still went out.
    await expect(pass()).resolves.toEqual({ failed: 1 })
    expect(jobs.broadcasts).toHaveBeenCalledOnce()
    expect(String(complained.mock.calls[0]?.[0])).toContain("Automation tick")
  })

  it("does not let an app's own worker take the shell's jobs down", async () => {
    jobs.appWorkers = [
      { name: "Preview builder", tick: vi.fn(async () => { throw new Error("boom") }) },
    ]

    await expect(pass()).resolves.toEqual({ failed: 1 })
    expect(jobs.automations).toHaveBeenCalledOnce()
    expect(jobs.broadcasts).toHaveBeenCalledOnce()
  })

  it("never rejects, however many jobs fail", async () => {
    jobs.automations.mockRejectedValue(new Error("boom"))
    jobs.broadcasts.mockRejectedValue(new Error("boom"))

    // A rejection here would reach the worker as a stopped loop.
    await expect(pass()).resolves.toEqual({ failed: 2 })
  })
})
