import { importGuestState } from "@/lib/api/pomodoro/productivity"
import {
  GUEST_STATE_KEY,
  readGuestJson,
  removeGuestKey,
} from "@/lib/pomodoro/guest-storage"
import {
  normalizeEstimatedPomodoros,
  normalizeTaskPriority,
} from "@/lib/pomodoro/tasks"
import { browserTimezone } from "@/lib/pomodoro/timer"
import { normalizeSessionsBeforeLongBreak } from "@/lib/pomodoro/timer-presets"

/**
 * The first signed-in visit after working as a guest copies the guest's
 * tasks and timer settings to the account. The server does it exactly once
 * (guest_imported_at on the profile row), so calling this on every load is
 * safe; the browser copy is cleared after the call either way, exactly as
 * the old app's login did.
 */
export async function maybeImportGuestState() {
  const saved = readGuestJson<{
    tasks?: unknown
    durations?: { focus?: unknown; short?: unknown; long?: unknown }
    dailyGoalSessions?: unknown
    sessionsBeforeLongBreak?: unknown
    autoStart?: unknown
  }>(GUEST_STATE_KEY)
  if (!saved) return false
  const minutes = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 90
      ? value
      : fallback
  const tasks = Array.isArray(saved.tasks)
    ? saved.tasks
        .filter(
          (task): task is { title: string } & Record<string, unknown> =>
            !!task &&
            typeof (task as { title?: unknown }).title === "string" &&
            Boolean((task as { title: string }).title.trim())
        )
        .slice(0, 100)
        .map((task) => ({
          title: String(task.title).trim().slice(0, 160),
          completed: task.completed === true,
          pomodoros:
            typeof task.pomodoros === "number" &&
            Number.isInteger(task.pomodoros) &&
            task.pomodoros >= 0
              ? Math.min(task.pomodoros, 100)
              : 0,
          priority: normalizeTaskPriority(task.priority),
          estimatedPomodoros: normalizeEstimatedPomodoros(
            task.estimatedPomodoros
          ),
        }))
    : []
  try {
    const result = await importGuestState({
      tasks,
      focusMinutes: minutes(saved.durations?.focus, 25),
      shortBreakMinutes: minutes(saved.durations?.short, 5),
      longBreakMinutes: minutes(saved.durations?.long, 15),
      dailyGoalSessions:
        typeof saved.dailyGoalSessions === "number" &&
        Number.isInteger(saved.dailyGoalSessions) &&
        saved.dailyGoalSessions >= 1 &&
        saved.dailyGoalSessions <= 20
          ? saved.dailyGoalSessions
          : 4,
      sessionsBeforeLongBreak: normalizeSessionsBeforeLongBreak(
        saved.sessionsBeforeLongBreak
      ),
      autoStart: saved.autoStart === true,
      timezone: browserTimezone(),
    })
    removeGuestKey(GUEST_STATE_KEY)
    return result.imported
  } catch {
    // A failed import leaves the browser copy alone for the next visit.
    return false
  }
}
