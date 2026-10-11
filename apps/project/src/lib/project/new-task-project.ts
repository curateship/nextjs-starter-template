import { NEW_TASK_PROJECT_KEY } from "@/lib/project/panel-keys"

/** The project New task last went into, in this browser. */
export function lastProject() {
  try {
    return localStorage.getItem(NEW_TASK_PROJECT_KEY)
  } catch {
    return null
  }
}

/** The project New task starts on next time, kept in this browser. */
export function rememberProject(projectId: string) {
  try {
    localStorage.setItem(NEW_TASK_PROJECT_KEY, projectId)
  } catch {
    // A browser that keeps nothing just starts on the first project next time.
  }
}
