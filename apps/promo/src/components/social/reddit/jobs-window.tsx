import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { JobsDashboard } from "@/components/social/jobs/jobs-dashboard"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { getJobsErrorMessage, loadJobs, type JobList } from "@/lib/api/social/jobs"

/**
 * The Jobs window, opened by the Jobs button in the Reddit module's middle
 * header. Tyler, 14 Oct 2026: "Jobs can be a button in middle header panel
 * that opens up a modal".
 *
 * It reads the list when it opens, so a window nobody opens costs nothing, and
 * shows a spinner in its frame until the list is in. The list is every job,
 * not this project's alone, because one reader browser searches for every
 * project.
 */
export function JobsWindow({
  open,
  onClose,
}: {
  open: boolean
  /** The window was shut, so the project's queue is worth reading again. */
  onClose: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent variant="admin" className="data-[variant=admin]:sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Jobs</DialogTitle>
          <DialogDescription>
            Whether the browser program is running, and every search, read, comment and check it is doing or did
            lately.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>{open ? <JobsLoaded /> : null}</DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The list, read once as the window opens: still reading, failed, or in. */
function JobsLoaded() {
  const [state, setState] = React.useState<{ list: JobList | null; error: string | null }>({ list: null, error: null })
  const [attempt, setAttempt] = React.useState(0)
  React.useEffect(() => {
    let live = true
    loadJobs().then(
      (list) => {
        if (live) setState({ list, error: null })
      },
      (error: unknown) => {
        if (live) setState({ list: null, error: getJobsErrorMessage(error) })
      }
    )
    return () => {
      live = false
    }
  }, [attempt])

  if (state.error) {
    return (
      <ErrorRow
        message={state.error}
        onRetry={() => {
          setState({ list: null, error: null })
          setAttempt((count) => count + 1)
        }}
      />
    )
  }
  if (!state.list) {
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        Reading the jobs
      </p>
    )
  }
  return <JobsDashboard initial={state.list} />
}
