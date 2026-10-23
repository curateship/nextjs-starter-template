import * as React from "react"
import { getRouteApi, useNavigate } from "@tanstack/react-router"

const authenticatedRoute = getRouteApi("/_authenticated")

/**
 * The right panel always holds a task (Tyler, 23 Oct 2026: "There is no 'x'
 * icon to close the right panel to show an empty panel. The first load always
 * show the first task and then it remembers what task I'm on afterwards").
 *
 * On arrival with no `?task=` in the address, the task last open here opens
 * again, or the list's first row when that task is no longer listed. A link's
 * own task wins. Whenever the address loses its task after that (the task was
 * deleted, or the browser's Back undid opening it), the first row opens. The
 * move replaces the address. The task is kept in this browser, once per person.
 *
 * Returns the id this last opened by itself, so a narrow screen stays on the
 * list instead of jumping to a task nobody pressed.
 */
export function useRememberedTask({
  storageKey,
  taskId,
  ids,
}: {
  storageKey: string
  /** The address's `?task=`. */
  taskId: string | undefined
  /** The list's rows as shown, first row first; null until the list has drawn. */
  ids: string[] | null
}) {
  const navigate = useNavigate()
  const { user } = authenticatedRoute.useLoaderData()
  const key = `${storageKey}:${user.id}`
  const arrivedRef = React.useRef(false)
  // A move waiting on its microtask, so a second pass doesn't open twice.
  const openingRef = React.useRef(false)
  const [quiet, setQuiet] = React.useState<string | null>(null)
  const idsJson = ids ? JSON.stringify(ids) : null

  React.useEffect(() => {
    if (idsJson === null || openingRef.current) return
    const arriving = !arrivedRef.current
    arrivedRef.current = true
    if (taskId) return
    const rows = JSON.parse(idsJson) as string[]
    const saved = arriving ? readTask(key) : null
    const pick = saved && rows.includes(saved) ? saved : rows[0]
    if (!pick) return
    openingRef.current = true
    // Off the effect's own pass, so the quiet id and the address change in one render.
    void Promise.resolve()
      .then(() => {
        setQuiet(pick)
        return navigate({
          to: ".",
          replace: true,
          search: (previous: Record<string, unknown>) => ({ ...previous, task: pick }),
        })
      })
      .finally(() => {
        openingRef.current = false
      })
  }, [idsJson, taskId, key, navigate])

  React.useEffect(() => {
    if (taskId) writeTask(key, taskId)
  }, [taskId, key])

  return quiet
}

function readTask(key: string): string | null {
  try {
    const saved = localStorage.getItem(key)
    return saved && /^[\w-]{1,36}$/.test(saved) ? saved : null
  } catch {
    return null
  }
}

function writeTask(key: string, taskId: string) {
  try {
    localStorage.setItem(key, taskId)
  } catch {
    // Storage may be blocked; the dashboard still opens its first task.
  }
}
