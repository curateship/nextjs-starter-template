import * as React from "react"

/**
 * Opening a task with new messages reads them, but the list under it keeps
 * its old "3 new" until it loads again. This asks for that load on Back, and
 * only when the task opened had something new, so plain browsing costs nothing.
 */
export function useReloadAfterReading(
  openTaskId: string | undefined,
  tasks: readonly { id: string; unread: number }[],
  reload: () => void
) {
  const read = React.useRef(false)
  React.useEffect(() => {
    if (openTaskId) {
      if (tasks.some((task) => task.id === openTaskId && task.unread > 0)) read.current = true
      return
    }
    if (!read.current) return
    read.current = false
    reload()
  }, [openTaskId, tasks, reload])
}
