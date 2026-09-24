import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  clearOutExports,
  getExportErrorMessage,
  previewClearOut,
} from "@/lib/api/video/exports"
import { formatFileSize } from "@/lib/format/format-bytes"
import { plural } from "@/lib/format/plural"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  CLEAR_OUT_AGE_CHOICES,
  DEFAULT_CLEAR_OUT_AGE,
  type ClearOutAgeChoice,
  type ClearOutPreview,
} from "@/lib/video/export-clear-out"

type Counted =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; preview: ClearOutPreview }

/**
 * Deleting every finished export made before a chosen date, behind one
 * confirmation that names how many go and how much space that frees.
 *
 * The counting happens on the server, because the gallery only holds the first
 * hundred exports. One with a live share link is counted apart and kept unless
 * its box is ticked. Mounted fresh each time it opens, so the numbers are
 * always read as the window appears.
 */
export function ExportClearOutDialog({
  onClose,
  onCleared,
}: {
  onClose: () => void
  onCleared: () => Promise<void>
}) {
  const [age, setAge] = React.useState<ClearOutAgeChoice>(DEFAULT_CLEAR_OUT_AGE)
  const [includeShared, setIncludeShared] = React.useState(false)
  const [counted, setCounted] = React.useState<Counted>({ state: "loading" })
  const [attempt, setAttempt] = React.useState(0)
  const [run, busy] = useAsyncAction(getExportErrorMessage)

  React.useEffect(() => {
    let cancelled = false
    previewClearOut(age).then(
      (preview) => {
        if (!cancelled) setCounted({ state: "ready", preview })
      },
      (error) => {
        if (cancelled) return
        showErrorToast(getExportErrorMessage(error))
        setCounted({ state: "failed" })
      }
    )
    return () => {
      cancelled = true
    }
  }, [age, attempt])

  const preview = counted.state === "ready" ? counted.preview : null
  const sharedCount = preview?.shared_exports ?? 0
  const takeShared = includeShared && sharedCount > 0
  const count = (preview?.exports ?? 0) + (takeShared ? sharedCount : 0)
  const bytes = preview
    ? preview.bytes + (takeShared ? preview.shared_bytes : 0)
    : 0

  async function handleConfirm() {
    if (!preview) {
      showErrorToast(
        "The old exports could not be counted, so nothing was deleted. Press Try again."
      )
      return
    }
    if (!count) {
      showErrorToast(
        sharedCount
          ? "Only exports with a live share link are that old. Tick the box to delete them too."
          : "Nothing is that old. Pick a more recent date."
      )
      return
    }
    await run(async () => {
      const result = await clearOutExports(preview.before, takeShared)
      if (result.failed) {
        showErrorToast(
          `${result.failed} ${plural(result.failed, "export was", "exports were")} kept because the file could not be removed from storage. Try again in a minute.`
        )
      } else if (!result.deleted) {
        showErrorToast("Nothing was deleted — those may already be gone.")
      }
      if (result.deleted) {
        toast.success(
          `Deleted ${result.deleted} ${plural(result.deleted, "export")} and freed ${formatFileSize(result.bytes_freed)}.`
        )
      }
      await onCleared()
      onClose()
    })
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Clear out old exports?"
      description={describeClearOut(counted, count, bytes, takeShared)}
      confirmLabel={
        count ? `Delete ${count} ${plural(count, "export")}` : "Delete exports"
      }
      disabled={counted.state === "loading"}
      loading={busy}
      onConfirm={() => void handleConfirm()}
    >
      <Card size="sm">
        <CardHeader>
          <CardTitle>Which exports</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="export-clear-out-age">Finished before</Label>
            <Select
              value={age}
              onValueChange={(next) => {
                setAge(next as ClearOutAgeChoice)
                setCounted({ state: "loading" })
              }}
            >
              <SelectTrigger id="export-clear-out-age" className="w-full sm:w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLEAR_OUT_AGE_CHOICES.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {counted.state === "loading" ? (
            <LoadingRow label="Counting…" className="py-2" />
          ) : counted.state === "failed" ? (
            <div className="grid justify-items-start gap-2">
              <p className="text-sm text-muted-foreground">
                The old exports could not be counted.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCounted({ state: "loading" })
                  setAttempt((value) => value + 1)
                }}
              >
                Try again
              </Button>
            </div>
          ) : sharedCount ? (
            <div className="flex items-center gap-3">
              <Checkbox
                id="export-clear-out-shared"
                checked={includeShared}
                onCheckedChange={(checked) => setIncludeShared(checked === true)}
              />
              <Label
                htmlFor="export-clear-out-shared"
                className="grid gap-0.5 font-normal"
              >
                <span className="font-medium">
                  Also delete the {sharedCount} with a live share link
                </span>
                <span className="text-sm text-muted-foreground">
                  {`${formatFileSize(counted.preview.shared_bytes)}. ${plural(sharedCount, "Its link stops", "Their links stop")} working.`}
                </span>
              </Label>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </ConfirmDialog>
  )
}

/** The consequence, in the numbers the confirm button will act on. */
function describeClearOut(
  counted: Counted,
  count: number,
  bytes: number,
  takeShared: boolean
) {
  if (counted.state === "loading") return "Counting the exports that old…"
  if (counted.state === "failed") return "Nothing can be cleared out until the exports are counted."

  const { preview } = counted
  const date = formatDate(preview.before)
  const shared = preview.shared_exports
  if (!count && !shared) {
    return `Nothing you exported was finished before ${date}, so there is nothing to clear out.`
  }
  if (!count) {
    return `The only ${plural(shared, "export", `${shared} exports`)} finished before ${date} ${plural(shared, "has", "have")} a live share link, so ${plural(shared, "it is", "they are")} kept unless you tick the box below.`
  }

  const main = `${count} ${plural(count, "export")} finished before ${date} ${plural(count, "goes", "go")} for good, file and cover, which frees ${formatFileSize(bytes)}. The projects they came from stay as they are.`
  if (!shared) return main
  return takeShared
    ? `${main} ${shared} of them ${plural(shared, "has", "have")} a live share link, which stops working.`
    : `${main} ${shared} more with a live share link ${plural(shared, "is", "are")} kept.`
}
