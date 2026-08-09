import * as React from "react"
import { toast } from "sonner"

import {
  loadProjectExport,
  type RenderJobSummary,
} from "@/lib/api/video/exports"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How often the editor asks how the render is getting on. */
const POLL_MS = 2000

/**
 * Keeps one project's export up to date while anything is happening to it, and
 * says so once when it finishes — even if the window has been closed.
 */
export function useProjectExport(projectId: string) {
  const [job, setJob] = React.useState<RenderJobSummary | null>(null)
  const previousStatus = React.useRef<string | null>(null)

  React.useEffect(() => {
    let active = true
    loadProjectExport(projectId)
      .then((loaded) => {
        if (!active) return
        previousStatus.current = loaded?.status ?? null
        setJob(loaded)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [projectId])

  const running = job?.status === "queued" || job?.status === "running"
  React.useEffect(() => {
    if (!running) return
    let active = true
    const timer = setInterval(() => {
      loadProjectExport(projectId)
        .then((loaded) => {
          if (active) setJob(loaded)
        })
        .catch(() => undefined)
    }, POLL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [projectId, running])

  // Say it once, when it changes — the window may well be closed by then.
  React.useEffect(() => {
    const status = job?.status ?? null
    const previous = previousStatus.current
    previousStatus.current = status
    if (!previous || previous === status) return
    if (status === "ready") toast.success("Your export is ready.")
    if (status === "error") {
      showErrorToast(job?.error_message ?? "The export could not be made.")
    }
  }, [job])

  return { job, setJob }
}
