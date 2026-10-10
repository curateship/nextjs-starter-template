import * as React from "react"
import { Loader2Icon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { cn } from "@/lib/utils"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { showErrorToast } from "@/lib/toast/error-toast"
import { formatBytes } from "@/lib/pomodoro/media-limits"
import { binEndsOn } from "@/lib/pomodoro/upload-labels"
import {
  emptyPomodoroBin,
  getPomodoroUploadErrorMessage,
  loadUploadLibrary,
  restorePomodoroUploads,
  type StoredUpload,
  type UploadLibrary,
} from "@/lib/api/pomodoro/media-uploads"
import { SoundWave } from "@/components/pomodoro/sound-wave"

/**
 * The Bin tab on My uploads (uploads-and-sharing task 02, part 5): files a
 * member deleted, both kinds, most recently deleted first. Each can be brought
 * back for 30 days, after which the worker removes it for good. Files here
 * still count toward the member's space (Tyler, 10 Oct 2026), so Empty the
 * bin removes them all now. See "The bin" in `workspace/docs/my-uploads.md`.
 */
export function UploadBinView() {
  const [library, setLibrary] = React.useState<UploadLibrary | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [chosen, setChosen] = React.useState<string[]>([])
  const [working, setWorking] = React.useState(false)
  const [confirmingEmpty, setConfirmingEmpty] = React.useState(false)

  const refresh = React.useCallback(
    () =>
      loadUploadLibrary("bin").then(
        (next) => {
          setLibrary(next)
          setError(null)
        },
        (loadError: unknown) =>
          setError(getPomodoroUploadErrorMessage(loadError))
      ),
    []
  )

  React.useEffect(() => {
    void refresh()
  }, [refresh, reloads])

  const files = library?.uploads ?? []
  const ticked = chosen.filter((id) => files.some((file) => file.mediaId === id))

  async function bringBack(ids: string[]) {
    setWorking(true)
    try {
      const result = await restorePomodoroUploads(ids)
      setChosen((current) => current.filter((id) => !result.done.includes(id)))
      await refresh()
      const line = describeBulkResult({
        done: result.done.length,
        kept: result.skipped.length,
        one: "file",
        many: "files",
        verb: "brought back",
      })
      if (result.done.length) toast.success(line)
      else showErrorToast(line)
    } catch (restoreError) {
      showErrorToast(getPomodoroUploadErrorMessage(restoreError))
    } finally {
      setWorking(false)
    }
  }

  return (
    <section
      aria-labelledby="upload-bin"
      className="flex flex-col gap-4 rounded-[24px] border bg-[var(--p-surface)] p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id="upload-bin"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/75"
        >
          Bin
        </h3>
        {library ? (
          <span className="font-mono text-xs text-muted-foreground">
            {formatBytes(library.usedBytes)} of {formatBytes(library.limitBytes)}
          </span>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Deleted files wait here for 30 days, then go for good. They still
          count toward your space until then.
        </p>
        {files.length ? (
          <Button
            type="button"
            variant="destructive"
            className="rounded-full"
            disabled={working}
            onClick={() => setConfirmingEmpty(true)}
          >
            <Trash2Icon aria-hidden="true" />
            Empty the bin
          </Button>
        ) : null}
      </div>

      {ticked.length ? (
        <div
          role="toolbar"
          aria-label="Ticked files"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-sm font-medium">
            {ticked.length} {ticked.length === 1 ? "file" : "files"} ticked
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={working}
            onClick={() => void bringBack(ticked)}
          >
            {working ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcwIcon aria-hidden="true" />
            )}
            Bring back
          </Button>
          {ticked.length < files.length ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setChosen(files.map((file) => file.mediaId))}
            >
              Tick all
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={() => setChosen([])}>
            Clear
          </Button>
        </div>
      ) : null}

      {error ? (
        <ErrorRow message={error} onRetry={() => setReloads((count) => count + 1)} />
      ) : !library ? (
        <div className="flex justify-center py-10">
          <Loader2Icon
            className="size-5 animate-spin text-muted-foreground"
            aria-label="Loading the bin"
          />
        </div>
      ) : files.length ? (
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {files.map((file) => (
            <BinCard
              key={file.mediaId}
              file={file}
              chosen={ticked.includes(file.mediaId)}
              anyChosen={ticked.length > 0}
              working={working}
              onChoose={(on) =>
                setChosen((current) =>
                  on
                    ? [...current, file.mediaId]
                    : current.filter((id) => id !== file.mediaId)
                )
              }
              onBringBack={() => void bringBack([file.mediaId])}
            />
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          The bin is empty.
        </p>
      )}

      <ConfirmDialog
        open={confirmingEmpty}
        onOpenChange={(open) => {
          if (!working) setConfirmingEmpty(open)
        }}
        title="Empty the bin?"
        description={`${files.length} ${files.length === 1 ? "file is" : "files are"} removed for good, and the space they take comes back. This cannot be undone.`}
        confirmLabel="Empty the bin"
        loading={working}
        onConfirm={async () => {
          setWorking(true)
          try {
            const result = await emptyPomodoroBin()
            setChosen([])
            await refresh()
            const line = describeBulkResult({
              done: result.deleted,
              kept: result.kept,
              one: "file",
              many: "files",
              verb: "removed for good",
            })
            if (result.kept) showErrorToast(line)
            else toast.success(line)
            setConfirmingEmpty(false)
          } catch (emptyError) {
            showErrorToast(getPomodoroUploadErrorMessage(emptyError))
          } finally {
            setWorking(false)
          }
        }}
      />
    </section>
  )
}

/** The glass circle the card's corner buttons share. */
const cornerButton =
  "rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/60 hover:text-white"

/** One file in the bin: its picture greyed, its name, and when it goes. */
function BinCard({
  file,
  chosen,
  anyChosen,
  working,
  onChoose,
  onBringBack,
}: {
  file: StoredUpload
  chosen: boolean
  anyChosen: boolean
  working: boolean
  onChoose: (chosen: boolean) => void
  onBringBack: () => void
}) {
  const sound = file.kind === "audio"
  return (
    <Card
      className={cn(
        "relative gap-0 overflow-hidden p-0",
        sound && "rounded-[18px]",
        chosen && "ring-2 ring-[var(--p-accent)]"
      )}
    >
      <span
        className={cn(
          "relative block bg-muted opacity-60 grayscale",
          sound ? "aspect-[8/5]" : "aspect-video"
        )}
      >
        {sound ? (
          <SoundWave seed={file.mediaId} />
        ) : file.kind === "image" && file.url ? (
          <img src={file.url} alt="" className="size-full object-cover" />
        ) : file.stillUrl ? (
          <img src={file.stillUrl} alt="" className="size-full object-cover" />
        ) : file.url ? (
          <video
            src={`${file.url}#t=0.1`}
            className="size-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : null}
      </span>
      <CardContent className={cn("flex flex-col gap-0.5", sound ? "px-[18px] py-4" : "px-3 py-3")}>
        <strong
          className={cn("truncate", sound ? "text-base font-semibold" : "text-sm")}
          title={file.name}
        >
          {file.name}
        </strong>
        <small className="truncate text-xs text-muted-foreground">
          {file.deletedAt ? `Goes for good on ${binEndsOn(new Date(file.deletedAt))}` : null}
        </small>
      </CardContent>
      <span
        className={cn(
          "absolute top-2 left-2 z-[2] grid size-8 place-items-center rounded-full bg-black/45 backdrop-blur-sm transition-opacity",
          chosen || anyChosen
            ? "opacity-100"
            : "opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"
        )}
      >
        <Checkbox
          checked={chosen}
          onCheckedChange={(checked) => onChoose(checked === true)}
          aria-label={`Tick ${file.name}`}
          className="border-white/80"
        />
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("absolute top-2 right-2", cornerButton)}
        disabled={working}
        onClick={onBringBack}
        title={`Bring back ${file.name}`}
        aria-label={`Bring back ${file.name}`}
      >
        <RotateCcwIcon className="size-4" />
      </Button>
    </Card>
  )
}
