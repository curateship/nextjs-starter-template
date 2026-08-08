import * as React from "react"
import { CheckIcon, DownloadIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  cancelExport,
  getExportErrorMessage,
  startExport,
  type RenderJobSummary,
} from "@/lib/api/video/exports"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { formatFileSize } from "@/lib/format/format-bytes"
import {
  EXPORT_TITLE_MAX,
  RENDER_QUALITIES,
  type RenderQuality,
} from "@/lib/video/render"
import { cn } from "@/lib/utils"

/**
 * Making the file.
 *
 * Rendering happens on the server, so closing this window does not stop it —
 * the editor keeps an eye on it and says when it is done. Opening the window
 * again picks the same job back up, because what is running is a row in the
 * database rather than something held in this page.
 */
export function ExportDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  job,
  onJobChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  /** The export this project is waiting on or last made, watched by the editor. */
  job: RenderJobSummary | null
  onJobChange: (job: RenderJobSummary | null) => void
}) {
  const [quality, setQuality] = React.useState<RenderQuality>("high")
  const [normalize, setNormalize] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [name, setName] = React.useState(projectName)

  // Opening starts from what the last export was called, or the project's own
  // name. Typing over it names only the next one — the project keeps its name.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setName(job?.title ?? projectName)
  }

  const running = job?.status === "queued" || job?.status === "running"
  const ready = job?.status === "ready"
  const downloadName = job?.title ?? projectName

  async function handleStart() {
    setBusy(true)
    try {
      const started = await startExport(projectId, quality, normalize, name)
      dismissErrorToast()
      onJobChange(started)
    } catch (error) {
      showErrorToast(getExportErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    setBusy(true)
    try {
      onJobChange(await cancelExport(projectId))
      toast.success("The export was stopped.")
    } catch (error) {
      showErrorToast(getExportErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export this project</DialogTitle>
          <DialogDescription>
            It is made on the server, so you can close this and keep working.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>What to call it</CardTitle>
              <CardDescription>
                Its name in Exports, and the name the file is saved under.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                id="export-name"
                aria-label="What to call this export"
                value={name}
                maxLength={EXPORT_TITLE_MAX}
                placeholder={projectName}
                disabled={running}
                onChange={(event) => setName(event.target.value)}
              />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>How good a file</CardTitle>
              <CardDescription>
                Bigger looks better and takes longer to make.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                {RENDER_QUALITIES.map((option) => {
                  const on = quality === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={running}
                      onClick={() => setQuality(option.id)}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-60",
                        on
                          ? "border-foreground bg-muted"
                          : "border-foreground/10 hover:border-foreground/25"
                      )}
                    >
                      <span className="font-medium">{option.label}</span>
                      <span className="text-sm text-muted-foreground">
                        {option.note}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="grid gap-0.5">
                  <Label htmlFor="export-normalize">Even out the sound</Label>
                  <span className="text-sm text-muted-foreground">
                    Brings the whole thing to the loudness the apps play videos
                    at.
                  </span>
                </span>
                <Switch
                  id="export-normalize"
                  checked={normalize}
                  disabled={running}
                  onCheckedChange={setNormalize}
                />
              </div>
            </CardContent>
          </Card>

          {job ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>This export</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <ExportProgress job={job} />
                {ready ? (
                  <Button asChild variant="outline">
                    <a
                      href={`/api/v1/video/exports/${job.id}/file?filename=${encodeURIComponent(downloadName)}`}
                      download
                    >
                      <DownloadIcon />
                      Download the file
                    </a>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {job?.status === "queued" ? (
            <Button
              type="button"
              variant="outline"
              className="mr-auto"
              disabled={busy}
              onClick={() => void handleCancel()}
            >
              Stop it
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            disabled={busy || running}
            onClick={() => void handleStart()}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            {ready ? "Export again" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExportProgress({ job }: { job: RenderJobSummary }) {
  if (job.status === "ready") {
    return (
      <p className="flex items-center gap-2 text-sm">
        <CheckIcon className="size-4" />
        Ready
        {job.file_size ? (
          <span className="text-muted-foreground">
            · {formatFileSize(job.file_size)}
          </span>
        ) : null}
        {job.width && job.height ? (
          <span className="text-muted-foreground">
            · {job.width}×{job.height}
          </span>
        ) : null}
      </p>
    )
  }
  if (job.status === "error") {
    return (
      <p className="text-sm text-destructive">
        {job.error_message ?? "It could not be made."}
      </p>
    )
  }
  if (job.status === "cancelled") {
    return <p className="text-sm text-muted-foreground">Stopped.</p>
  }
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2Icon className="size-4 animate-spin" />
      {job.status === "running"
        ? "Making it now…"
        : job.queue_position && job.queue_position > 1
          ? `Waiting — ${job.queue_position - 1} ahead of it`
          : "Waiting to start…"}
    </p>
  )
}
