import * as React from "react"
import { CheckIcon, DownloadIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { isExportActive } from "@/components/video-editor/use-project-exports"
import {
  cancelExports,
  getExportErrorMessage,
  startExport,
  type RenderJobSummary,
} from "@/lib/api/video/exports"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { formatFileSize } from "@/lib/format/format-bytes"
import {
  EXPORT_SHAPES,
  EXPORT_TITLE_MAX,
  NO_SHAPE_MESSAGE,
  RENDER_QUALITIES,
  type RenderQuality,
} from "@/lib/video/render"
import type { AspectRatio } from "@/lib/video/timeline-schema"
import { cn } from "@/lib/utils"

/**
 * Making the file.
 *
 * Rendering happens on the server, so closing this window does not stop it —
 * the editor keeps an eye on it and says when it is done. Opening the window
 * again picks the same jobs back up, because what is running is a row in the
 * database rather than something held in this page.
 *
 * One press can make the project in several shapes, one file each. A shape
 * that is already on its way is refused by the server, so the button stays
 * pressable while others render.
 */
export function ExportDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  projectAspect,
  jobs,
  onJobsChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  /** The shape the project is edited in, ticked each time the window opens. */
  projectAspect: AspectRatio
  /** The newest export in each shape, watched by the editor. */
  jobs: RenderJobSummary[]
  onJobsChange: (jobs: RenderJobSummary[]) => void
}) {
  const [quality, setQuality] = React.useState<RenderQuality>("high")
  const [normalize, setNormalize] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [name, setName] = React.useState(projectName)
  const [shapes, setShapes] = React.useState<AspectRatio[]>([projectAspect])
  const [shapesInvalid, setShapesInvalid] = React.useState(false)

  // Opening starts from what the last export was called, or the project's own
  // name. Typing over it names only the next one — the project keeps its name.
  // The project's own shape is ticked afresh every time.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      const newest = jobs.reduce<RenderJobSummary | null>(
        (latest, job) =>
          !latest || job.created_at > latest.created_at ? job : latest,
        null
      )
      setName(newest?.title ?? projectName)
      setShapes([projectAspect])
      setShapesInvalid(false)
    }
  }

  const activeCount = jobs.filter(isExportActive).length

  function toggleShape(aspect: AspectRatio) {
    setShapesInvalid(false)
    setShapes((current) =>
      current.includes(aspect)
        ? current.filter((shape) => shape !== aspect)
        : [...current, aspect]
    )
  }

  async function handleStart() {
    if (!shapes.length) {
      setShapesInvalid(true)
      showErrorToast(NO_SHAPE_MESSAGE)
      return
    }
    setBusy(true)
    try {
      const started = await startExport(
        projectId,
        shapes,
        quality,
        normalize,
        name
      )
      dismissErrorToast()
      onJobsChange(started)
    } catch (error) {
      showErrorToast(getExportErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    setBusy(true)
    try {
      onJobsChange(await cancelExports(projectId))
      toast.success(
        activeCount > 1 ? "The exports were stopped." : "The export was stopped."
      )
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
                onChange={(event) => setName(event.target.value)}
              />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Which shapes</CardTitle>
              <CardDescription>
                One file for each shape ticked. Words keep their place in the
                frame, so look at each one before posting it.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {EXPORT_SHAPES.map((shape) => {
                const id = `export-shape-${shape.id.replace(":", "x")}`
                return (
                  <div key={shape.id} className="flex items-center gap-3">
                    <Checkbox
                      id={id}
                      checked={shapes.includes(shape.id)}
                      aria-invalid={shapesInvalid || undefined}
                      onCheckedChange={() => toggleShape(shape.id)}
                    />
                    <Label htmlFor={id} className="grid gap-0.5 font-normal">
                      <span className="font-medium">
                        {shape.label}
                        {shape.id === projectAspect ? " · this project" : ""}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {shape.note}
                      </span>
                    </Label>
                  </div>
                )
              })}
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
                  onCheckedChange={setNormalize}
                />
              </div>
            </CardContent>
          </Card>

          {jobs.length ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>
                  {jobs.length > 1 ? "The latest in each shape" : "This export"}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {jobs.map((job) => (
                  <div key={job.id} className="grid gap-2">
                    <span className="text-sm font-medium">{job.aspect}</span>
                    <ExportProgress job={job} />
                    {job.status === "ready" ? (
                      <Button asChild variant="outline">
                        <a
                          href={`/api/v1/video/exports/${job.id}/file?filename=${encodeURIComponent(job.title ?? projectName)}`}
                          download
                        >
                          <DownloadIcon />
                          Download the {job.aspect} file
                        </a>
                      </Button>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {activeCount ? (
            <Button
              type="button"
              variant="outline"
              className="mr-auto"
              disabled={busy}
              onClick={() => void handleCancel()}
            >
              {activeCount > 1 ? `Stop all ${activeCount}` : "Stop it"}
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
            disabled={busy}
            onClick={() => void handleStart()}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            {shapes.length > 1 ? `Export ${shapes.length} shapes` : "Export"}
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
    return (
      <p className="text-sm text-muted-foreground">
        You stopped this export, so no file was made.
      </p>
    )
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
