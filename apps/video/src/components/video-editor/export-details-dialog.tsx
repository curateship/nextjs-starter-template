import * as React from "react"
import { ImageIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import {
  getExportErrorMessage,
  setExportCover,
  updateExport,
  type RenderJobSummary,
} from "@/lib/api/video/exports"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { formatClock } from "@/lib/video/timeline-utils"
import { EXPORT_TITLE_MAX } from "@/lib/video/render"
import { ExportCover } from "@/components/video-editor/export-cover"

/** Stands in while there is no cover picture to show. */
function CoverPlaceholder() {
  return (
    <span className="grid h-40 place-items-center text-sm text-muted-foreground">
      <ImageIcon className="size-6" />
    </span>
  )
}

/**
 * One export: what it is called, what it is about, and which moment of it
 * stands in for it in the gallery.
 *
 * The cover is chosen by picking a moment rather than by uploading a picture —
 * a still from the video itself always belongs to it, and there is nothing to
 * keep in step.
 */
export function ExportDetailsDialog({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean
  item: RenderJobSummary | null
  onClose: () => void
  onSaved: (item: RenderJobSummary) => void
}) {
  const [title, setTitle] = React.useState(item?.title ?? "")
  const [description, setDescription] = React.useState(item?.description ?? "")
  const [coverMs, setCoverMs] = React.useState(0)
  const [saving, setSaving] = React.useState(false)
  const [coverBusy, setCoverBusy] = React.useState(false)
  // Changes with every new cover, so the picture reloads instead of showing
  // the one the browser already has.
  const [coverVersion, setCoverVersion] = React.useState(0)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setTitle(item?.title ?? "")
      setDescription(item?.description ?? "")
      setCoverMs(0)
      setCoverVersion(0)
    }
  }

  if (!item) return null

  const dirty =
    title !== (item.title ?? "") || description !== (item.description ?? "")
  const lengthMs = item.duration_ms ?? 0

  async function handleSave() {
    if (!item) return
    setSaving(true)
    try {
      const saved = await updateExport(item.id, title, description)
      dismissErrorToast()
      onSaved(saved)
      toast.success("Saved.")
      onClose()
    } catch (error) {
      showErrorToast(getExportErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleCover() {
    if (!item) return
    setCoverBusy(true)
    try {
      const saved = await setExportCover(item.id, coverMs)
      dismissErrorToast()
      onSaved(saved)
      setCoverVersion((version) => version + 1)
      toast.success("Cover picture changed.")
    } catch (error) {
      showErrorToast(getExportErrorMessage(error))
    } finally {
      setCoverBusy(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Export</DialogTitle>
            <DialogDescription>
              What this one is called, and the picture that stands in for it.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Words</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="export-title">Title</Label>
                    <Input
                      id="export-title"
                      value={title}
                      maxLength={EXPORT_TITLE_MAX}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="export-description">
                      What it is about
                    </Label>
                    <Textarea
                      id="export-description"
                      rows={1}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Cover picture</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid place-items-center overflow-hidden rounded-lg bg-muted">
                    {item.has_thumbnail ? (
                      <ExportCover
                        exportId={item.id}
                        version={coverVersion}
                        className="max-h-64 w-auto"
                        fallback={<CoverPlaceholder />}
                      />
                    ) : (
                      <CoverPlaceholder />
                    )}
                  </div>
                  <div className="grid gap-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <Label htmlFor="export-cover-at">Take it from</Label>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {formatClock(coverMs)} of {formatClock(lengthMs)}
                      </span>
                    </div>
                    <Slider
                      id="export-cover-at"
                      aria-label="Where to take the cover picture from"
                      min={0}
                      max={Math.max(1000, lengthMs)}
                      step={100}
                      value={[coverMs]}
                      disabled={coverBusy}
                      onValueChange={([next]) => setCoverMs(next)}
                    />
                  </div>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={coverBusy}
                      onClick={() => void handleCover()}
                    >
                      {coverBusy ? (
                        <Loader2Icon className="animate-spin" />
                      ) : null}
                      Use this moment
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="animate-spin" /> : null}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
