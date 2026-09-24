import * as React from "react"
import { toast } from "sonner"

import {
  loadProjectExports,
  type RenderJobSummary,
} from "@/lib/api/video/exports"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How often the editor asks how the renders are getting on. */
const POLL_MS = 2000

export function isExportActive(job: RenderJobSummary) {
  return job.status === "queued" || job.status === "running"
}

/**
 * Keeps one project's exports up to date, the newest in each shape, while any
 * of them is waiting or rendering. Says once when each one finishes, even if
 * the window has been closed.
 */
export function useProjectExports(projectId: string) {
  const [jobs, setJobs] = React.useState<RenderJobSummary[]>([])
  const previousStatus = React.useRef(new Map<string, string>())

  React.useEffect(() => {
    let active = true
    loadProjectExports(projectId)
      .then((loaded) => {
        if (!active) return
        previousStatus.current = new Map(
          loaded.map((job) => [job.id, job.status])
        )
        setJobs(loaded)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [projectId])

  const running = jobs.some(isExportActive)
  React.useEffect(() => {
    if (!running) return
    let active = true
    const timer = setInterval(() => {
      loadProjectExports(projectId)
        .then((loaded) => {
          if (active) setJobs(loaded)
        })
        .catch(() => undefined)
    }, POLL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [projectId, running])

  // Say it once per export, when it changes. The window may well be closed by
  // then. A job seen for the first time was just asked for, so it says nothing.
  React.useEffect(() => {
    const previous = previousStatus.current
    previousStatus.current = new Map(jobs.map((job) => [job.id, job.status]))
    const several = jobs.length > 1
    for (const job of jobs) {
      const before = previous.get(job.id)
      if (!before || before === job.status) continue
      if (job.status === "ready") {
        toast.success(
          several
            ? `Your ${job.aspect} export is ready.`
            : "Your export is ready."
        )
      }
      if (job.status === "error") {
        const message = job.error_message ?? "The export could not be made."
        showErrorToast(
          several ? `The ${job.aspect} export failed. ${message}` : message
        )
      }
    }
  }, [jobs])

  return { jobs, setJobs, running }
}
