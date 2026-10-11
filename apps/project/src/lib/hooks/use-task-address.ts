import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"

/**
 * The open task lives in the address as `?task=<id>`, so a pasted link or a
 * bell notice opens it. A task opened from this page's list adds a step to
 * the browser's history, and Back takes that step back, so the browser's own
 * back button and Back agree. A task that arrived from a link has no list
 * step behind it, so Back swaps the address for the list instead of leaving
 * the page.
 */
export function useTaskAddress() {
  const navigate = useNavigate()
  const router = useRouter()
  const openedHere = React.useRef<string | null>(null)

  const open = React.useCallback(
    (taskId: string) => {
      openedHere.current = taskId
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => ({ ...previous, task: taskId }),
      })
    },
    [navigate]
  )

  const back = React.useCallback(() => {
    const showing = (router.state.location.search as { task?: unknown }).task
    if (openedHere.current && openedHere.current === showing) {
      openedHere.current = null
      router.history.back()
      return
    }
    void navigate({
      to: ".",
      replace: true,
      search: (previous: Record<string, unknown>) => {
        const next = { ...previous }
        delete next.task
        return next
      },
    })
  }, [navigate, router])

  return { open, back }
}
