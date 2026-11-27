import * as React from "react"

import {
  loadVideoExports,
  type RenderJobSummary,
} from "@/lib/api/video/exports"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How often the editor asks how the renders are getting on. */
const POLL_MS = 2000

const LOAD_FAILED_MESSAGE =
  "Your exports could not be checked, so the Export button may not show one that is running."

export function isExportActive(job: RenderJobSummary) {
  return job.status === "queued" || job.status === "running"
}

/**
 * Keeps one project's exports up to date, the newest in each shape, while any
 * of them is waiting or rendering. Says once when each one finishes, even if
 * the window has been closed.
 */
export function useProjectExports(videoId: string) {
  const [jobs, setJobs] = React.useState<RenderJobSummary[]>([])
  const [loads, setLoads] = React.useState(0)
  const previousStatus = React.useRef(new Map<string, string>())
  // Said once when asking starts failing, and again only after an answer came
  // back in between, so a poll every two seconds never stacks up notices.
  const failing = React.useRef(false)

  React.useEffect(() => {
    let active = true
    loadVideoExports(videoId)
      .then((loaded) => {
        if (!active) return
        failing.current = false
        previousStatus.current = new Map(
          loaded.map((job) => [job.id, job.status])
        )
        setJobs(loaded)
      })
      .catch(() => {
        if (!active || failing.current) return
        failing.current = true
        showErrorToast(LOAD_FAILED_MESSAGE, {
          label: "Try again",
          onClick: () => setLoads((count) => count + 1),
        })
      })
    return () => {
      active = false
    }
  }, [videoId, loads])

  const running = jobs.some(isExportActive)
  React.useEffect(() => {
    if (!running) return
    let active = true
    const timer = setInterval(() => {
      loadVideoExports(videoId)
        .then((loaded) => {
          if (!active) return
          failing.current = false
          setJobs(loaded)
        })
        .catch(() => {
          if (!active || failing.current) return
          failing.current = true
          showErrorToast(LOAD_FAILED_MESSAGE)
        })
    }, POLL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [videoId, running])

  // Say it once per export, when it changes. The window may well be closed by
  // then. A job seen for the first time was just asked for, so it says nothing.
  React.useEffect(() => {
    const previous = previousStatus.current
    previousStatus.current = new Map(jobs.map((job) => [job.id, job.status]))
    const several = jobs.length > 1
    for (const job of jobs) {
      const before = previous.get(job.id)
      if (!before || before === job.status) continue
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
