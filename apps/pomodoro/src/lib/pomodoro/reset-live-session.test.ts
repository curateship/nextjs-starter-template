// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Tyler, 16 Oct 2026: "The reset icon beside start does not work." A poll
 * that read the session before its cancel landed, or a start that answered
 * after Reset, put the timer straight back.
 */

const api = vi.hoisted(() => ({
  startFocusSession: vi.fn(),
  cancelFocusSession: vi.fn(),
  loadLiveSession: vi.fn(),
}))

vi.mock("@/lib/api/pomodoro/productivity", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...api,
}))
vi.mock("@/lib/pomodoro/auth-state", () => ({
  productAuth: () => ({ known: true, authenticated: true }),
  subscribeProductAuth: () => () => {},
}))

const engine = await import("@/lib/pomodoro/use-pomodoro")

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

const runningRow = (id: string) => ({
  session: {
    id,
    mode: "focus",
    status: "running",
    plannedSeconds: 1500,
    accumulatedSeconds: 0,
    targetEndsAt: new Date(Date.now() + 1_400_000).toISOString(),
    taskId: null,
  },
  ending: null,
  serverNow: Date.now(),
})

const flush = () => new Promise((done) => setTimeout(done, 0))

beforeEach(async () => {
  vi.clearAllMocks()
  // Leave each test on a stopped focus with no session.
  api.cancelFocusSession.mockResolvedValue({ ok: true })
  engine.resetPomodoroTimer()
  await flush()
})

describe("Reset on a signed-in account", () => {
  it("is not undone by a poll sent before its cancel landed", async () => {
    api.startFocusSession.mockResolvedValue({ id: "s1" })
    engine.toggleTimer()
    await flush()
    expect(engine.pomodoroEngineState().serverSessionId).toBe("s1")

    const cancel = deferred<{ ok: boolean }>()
    api.cancelFocusSession.mockReturnValue(cancel.promise)
    api.loadLiveSession.mockResolvedValue(runningRow("s1"))
    engine.resetPomodoroTimer()
    await engine.syncLiveSession()

    expect(engine.pomodoroEngineState().timer.running).toBe(false)
    cancel.resolve({ ok: true })
    await flush()
    expect(engine.pomodoroEngineState().timer.running).toBe(false)
  })

  it("cancels a start that answers after Reset", async () => {
    const start = deferred<{ id: string }>()
    api.startFocusSession.mockReturnValue(start.promise)
    engine.toggleTimer()
    engine.resetPomodoroTimer()
    expect(api.cancelFocusSession).not.toHaveBeenCalled()

    start.resolve({ id: "s2" })
    await flush()

    expect(api.cancelFocusSession).toHaveBeenCalledWith("s2")
    expect(engine.pomodoroEngineState().serverSessionId).toBeNull()
    expect(engine.pomodoroEngineState().timer.running).toBe(false)
  })
})
