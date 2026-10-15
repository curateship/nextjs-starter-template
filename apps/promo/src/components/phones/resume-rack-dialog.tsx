import * as React from "react"
import { Loader2Icon, PlayIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getPhoneErrorMessage,
  loadWaitingPhoneJobs,
  resumeRack,
  type WaitingPhoneJob,
} from "@/lib/api/phones/phones"
import { formatTimeAgo } from "@/lib/format/format-time"
import { JOB_KIND_WORDS } from "@/lib/social/job-words"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The question asked before the rack starts again: the phone jobs that piled
 * up while it was paused, oldest first, each with a tick to drop it. A
 * comment pressed a day ago may no longer be wanted, so nothing is dropped
 * unless it is ticked.
 */
export function ResumeRackDialog({
  open,
  onClose,
  onResumed,
}: {
  open: boolean
  onClose: () => void
  onResumed: () => Promise<void>
}) {
  const [jobs, setJobs] = React.useState<WaitingPhoneJob[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [drop, setDrop] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let live = true
    loadWaitingPhoneJobs().then(
      (next) => {
        if (!live) return
        setJobs(next)
        setError(null)
      },
      (loadError: unknown) => {
        if (live) setError(getPhoneErrorMessage(loadError))
      }
    )
    return () => {
      live = false
    }
  }, [open, attempt])

  function close() {
    setJobs(null)
    setDrop(new Set())
    onClose()
  }

  async function resume() {
    setBusy(true)
    try {
      const { dropped } = await resumeRack([...drop])
      toast.success(
        dropped
          ? `The rack is running again. ${dropped} waiting ${dropped === 1 ? "job was" : "jobs were"} dropped.`
          : "The rack is running again."
      )
      setJobs(null)
      setDrop(new Set())
      await onResumed()
    } catch (resumeError) {
      showErrorToast(getPhoneErrorMessage(resumeError))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: string) =>
    setDrop((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Resume the rack?</DialogTitle>
          <DialogDescription>
            These phone jobs waited while the rack was paused. Tick any that are no longer
            wanted to drop them. The rest start in order.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Waiting jobs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {error ? (
                <ErrorRow message={error} onRetry={() => setAttempt((count) => count + 1)} />
              ) : !jobs ? (
                <LoadingRow label="Reading the waiting jobs" className="min-h-24" />
              ) : !jobs.length ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing is waiting.</p>
              ) : (
                <div className="grid divide-y">
                  {jobs.map((job) => (
                    <div key={job.id} className="flex items-center gap-3 px-4 py-3">
                      <Checkbox
                        id={`drop-${job.id}`}
                        checked={drop.has(job.id)}
                        onCheckedChange={() => toggle(job.id)}
                      />
                      <Label htmlFor={`drop-${job.id}`} className="grid flex-1 gap-0.5 font-normal">
                        <span className="text-sm">
                          Drop: {JOB_KIND_WORDS[job.kind] ?? job.kind}
                          {job.phoneName ? ` on ${job.phoneName}` : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">Waiting since {formatTimeAgo(job.createdAt)}</span>
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void resume()}>
            {busy ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
            {drop.size ? `Drop ${drop.size} and resume` : "Resume the rack"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
