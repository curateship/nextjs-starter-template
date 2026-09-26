import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The engine's task half: a tick and a removal land on the press, the answer
 * still wins, one press sends one request, and a failure puts back only the
 * row that failed. The server calls are stood in for, because what is being
 * checked is the order the engine does things in.
 */

const togglePersistentTask = vi.fn()
const abandonTask = vi.fn()
const loadProductivity = vi.fn()
const showErrorToast = vi.fn()

vi.mock("@/lib/api/pomodoro/productivity", () => ({
  togglePersistentTask: (...args: unknown[]) => togglePersistentTask(...args),
  abandonTask: (...args: unknown[]) => abandonTask(...args),
  loadProductivity: (...args: unknown[]) => loadProductivity(...args),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  reorderTasks: vi.fn(),
  setTaskRepeatRule: vi.fn(),
  updatePreferences: vi.fn(),
  startFocusSession: vi.fn(),
  pauseFocusSession: vi.fn(),
  resumeFocusSession: vi.fn(),
  cancelFocusSession: vi.fn(),
  completeFocusSession: vi.fn(),
  saveFocusSessionNote: vi.fn(),
}))

vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: (...args: unknown[]) => showErrorToast(...args),
}))

// The engine is browser code and returns early when there is no window. These
// tests run in node, so it gets the smallest window that satisfies it, set
// before the engine is imported.
vi.stubGlobal("window", globalThis)

const { setProductAuthenticated } = await import("@/lib/pomodoro/auth-state")
const {
  pomodoroEngineState,
  reloadPomodoroData,
  removeTask,
  toggleTask,
} = await import("@/lib/pomodoro/use-pomodoro")

function serverTask(id: string, title: string, status = "active") {
  return {
    id,
    title,
    status,
    pomodoroCount: 0,
    priority: "normal",
    estimatedPomodoros: null,
    repeatWeekdays: null,
    projectId: null,
    projectName: null,
    plannedDate: "2026-09-26",
  }
}

/** What a successful load answers with: two active tasks. */
function primeLoad() {
  loadProductivity.mockResolvedValue({
    preferences: {
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      sessionsBeforeLongBreak: 4,
      autoStart: false,
    },
    tasks: [serverTask("a", "Write the thing"), serverTask("b", "Read the thing")],
    archivedTasks: [],
    projects: [],
    summary: {
      todayCompletedSessions: 0,
      dailyGoalSessions: 4,
      currentStreak: 0,
      bestStreak: 0,
    },
  })
}

/** Puts those two tasks in the engine, the way a real load would. */
async function loadTwoTasks() {
  primeLoad()
  await reloadPomodoroData()
  await vi.waitFor(() => expect(taskById("a")).toBeDefined())
}

function taskById(id: string) {
  return pomodoroEngineState().tasks.find((task) => task.id === id)
}

/** A request the test settles itself, so no row is left in flight for ever. */
function deferred<T>() {
  let settle: (value: T) => void = () => {}
  let fail: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  return { promise, settle, fail }
}

const nothingInFlight = () =>
  vi.waitFor(() => expect(pomodoroEngineState().pendingTaskIds).toEqual([]))

beforeEach(async () => {
  vi.clearAllMocks()
  // Priming the load first matters: flipping the auth flag makes the engine
  // reload on its own, and that pass has to have something to answer with.
  primeLoad()
  setProductAuthenticated(true)
  await loadTwoTasks()
})

describe("ticking a task off", () => {
  it("moves the row before the server answers, and is not loading afterwards", async () => {
    const answer = deferred<{ status: string; pomodoroCount: number }>()
    togglePersistentTask.mockReturnValue(answer.promise)

    toggleTask("a")
    expect(taskById("a")?.completed).toBe(true)
    expect(pomodoroEngineState().pendingTaskIds).toEqual(["a"])
    expect(pomodoroEngineState().loading).toBe(false)

    answer.settle({ status: "completed", pomodoroCount: 3 })
    await nothingInFlight()
    expect(taskById("a")?.pomodoros).toBe(3)
  })

  it("keeps the server's answer when it disagrees with the tick", async () => {
    togglePersistentTask.mockResolvedValue({
      status: "active",
      pomodoroCount: 1,
    })
    toggleTask("a")
    expect(taskById("a")?.completed).toBe(true)
    await nothingInFlight()
    expect(taskById("a")?.completed).toBe(false)
    expect(taskById("a")?.pomodoros).toBe(1)
  })

  it("sends one request however fast the row is pressed", async () => {
    const answer = deferred<{ status: string; pomodoroCount: number }>()
    togglePersistentTask.mockReturnValue(answer.promise)
    toggleTask("a")
    toggleTask("a")
    toggleTask("a")
    expect(togglePersistentTask).toHaveBeenCalledTimes(1)
    expect(taskById("a")?.completed).toBe(true)
    answer.settle({ status: "completed", pomodoroCount: 0 })
    await nothingInFlight()
  })

  it("still lets another row be pressed while the first is in flight", async () => {
    const first = deferred<{ status: string; pomodoroCount: number }>()
    const second = deferred<{ status: string; pomodoroCount: number }>()
    togglePersistentTask
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    toggleTask("a")
    toggleTask("b")
    expect(togglePersistentTask).toHaveBeenCalledTimes(2)
    expect(pomodoroEngineState().pendingTaskIds).toEqual(["a", "b"])
    first.settle({ status: "completed", pomodoroCount: 0 })
    second.settle({ status: "completed", pomodoroCount: 0 })
    await nothingInFlight()
  })

  it("puts the row back and says so when the request fails", async () => {
    togglePersistentTask.mockRejectedValue(new Error("offline"))
    toggleTask("a")
    await nothingInFlight()
    expect(taskById("a")?.completed).toBe(false)
    expect(showErrorToast).toHaveBeenCalledWith("The task could not be updated.")
  })

  it("puts back only the row that failed", async () => {
    togglePersistentTask.mockImplementation((taskId: string) =>
      taskId === "a"
        ? Promise.reject(new Error("offline"))
        : Promise.resolve({ status: "completed", pomodoroCount: 2 })
    )
    toggleTask("a")
    toggleTask("b")
    await nothingInFlight()
    expect(taskById("a")?.completed).toBe(false)
    expect(taskById("b")?.completed).toBe(true)
  })
})

describe("removing a task", () => {
  it("takes the row out on the press", async () => {
    const answer = deferred<void>()
    abandonTask.mockReturnValue(answer.promise)
    removeTask("a")
    expect(taskById("a")).toBeUndefined()
    expect(abandonTask).toHaveBeenCalledTimes(1)
    answer.settle(undefined)
    await nothingInFlight()
  })

  it("sends one request however fast the X is pressed", async () => {
    const answer = deferred<void>()
    abandonTask.mockReturnValue(answer.promise)
    removeTask("a")
    removeTask("a")
    expect(abandonTask).toHaveBeenCalledTimes(1)
    answer.settle(undefined)
    await nothingInFlight()
  })

  it("brings the row back and says so when the request fails", async () => {
    abandonTask.mockRejectedValue(new Error("offline"))
    removeTask("a")
    expect(taskById("a")).toBeUndefined()
    await nothingInFlight()
    expect(taskById("a")?.title).toBe("Write the thing")
    expect(pomodoroEngineState().tasks).toHaveLength(2)
    expect(showErrorToast).toHaveBeenCalledWith("The task could not be removed.")
  })
})

describe("the warning line", () => {
  it("goes up when the load fails and holds the empty state back", async () => {
    loadProductivity.mockRejectedValue(new Error("offline"))
    await reloadPomodoroData()
    expect(pomodoroEngineState().syncError).toBe(
      "Your tasks and settings could not be loaded."
    )
    expect(pomodoroEngineState().loadFailed).toBe(true)
    expect(pomodoroEngineState().loading).toBe(false)
  })

  it("comes down as soon as something saves", async () => {
    loadProductivity.mockRejectedValue(new Error("offline"))
    await reloadPomodoroData()
    expect(pomodoroEngineState().syncError).not.toBe("")

    await loadTwoTasks()
    expect(pomodoroEngineState().syncError).toBe("")
    expect(pomodoroEngineState().loadFailed).toBe(false)
  })

  it("comes down on a tick that works, without a reload", async () => {
    loadProductivity.mockRejectedValue(new Error("offline"))
    await reloadPomodoroData()
    await loadTwoTasks()
    pomodoroEngineState()
    // Put the line back up the way a failed save does, then let a tick succeed.
    togglePersistentTask.mockRejectedValueOnce(new Error("offline"))
    toggleTask("a")
    await nothingInFlight()
    togglePersistentTask.mockResolvedValue({
      status: "completed",
      pomodoroCount: 0,
    })
    toggleTask("a")
    await nothingInFlight()
    expect(pomodoroEngineState().syncError).toBe("")
  })
})
