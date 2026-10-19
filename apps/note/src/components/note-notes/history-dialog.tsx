import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { NoteEditor } from "@/components/note-notes/note-editor"
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
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  getNotesErrorMessage,
  loadNoteVersion,
  loadNoteVersions,
  restoreNoteVersion,
} from "@/lib/api/note/notes"
import { formatDateTime } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import {
  noteTitle,
  VERSIONS_KEPT,
  type NoteDetail,
  type NoteVersion,
  type NoteVersionSummary,
} from "@/lib/note/notes/notes"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const NO_LINKS = {}

/**
 * Earlier copies of a note, newest first, at most one per five minutes of
 * editing and the newest 100 kept (Tyler, 18 Oct 2026). Picking one shows it
 * as it was; Restore puts it back, keeping the note as it is now as a copy
 * first, so a restore can be undone the same way.
 */
export function HistoryDialog({
  noteId,
  open,
  onClose,
  onRestored,
}: {
  noteId: string
  open: boolean
  onClose: () => void
  onRestored: (detail: NoteDetail) => void
}) {
  const [versions, setVersions] = React.useState<NoteVersionSummary[] | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [picked, setPicked] = React.useState<NoteVersion | null>(null)
  const [loadingPick, setLoadingPick] = React.useState<string | null>(null)
  const [restoring, setRestoring] = React.useState(false)
  const [reloads, setReloads] = React.useState(0)

  const [wasOpen, setWasOpen] = React.useState(false)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setVersions(null)
      setFailure(null)
      setPicked(null)
    }
  }

  React.useEffect(() => {
    if (!open) return
    let live = true
    loadNoteVersions(noteId)
      .then((list) => {
        if (live) setVersions(list)
      })
      .catch((error) => {
        if (live) setFailure(getNotesErrorMessage(error))
      })
    return () => {
      live = false
    }
  }, [open, noteId, reloads])

  // Only the newest pick may show, so two quick clicks never put one copy's
  // text under the other copy's row.
  const latestPick = React.useRef<string | null>(null)
  async function pick(version: NoteVersionSummary) {
    latestPick.current = version.id
    setLoadingPick(version.id)
    try {
      const loaded = await loadNoteVersion(noteId, version.id)
      if (latestPick.current === version.id) setPicked(loaded)
    } catch (error) {
      if (latestPick.current === version.id) showErrorToast(getNotesErrorMessage(error))
    } finally {
      if (latestPick.current === version.id) setLoadingPick(null)
    }
  }

  async function restore() {
    if (!picked) {
      showErrorToast("Pick an earlier copy on the left first.")
      return
    }
    setRestoring(true)
    dismissErrorToast()
    try {
      const detail = await restoreNoteVersion(noteId, picked.id)
      toast.success(`Restored the copy from ${formatDateTime(picked.createdAt)}.`)
      onRestored(detail)
    } catch (error) {
      showErrorToast(getNotesErrorMessage(error))
    } finally {
      setRestoring(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !restoring) onClose()
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            A copy is kept at most every five minutes while you write, and the newest {VERSIONS_KEPT} stay.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid min-h-0 gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="min-h-0 rounded-md border">
            {failure ? (
              <ErrorRow
                message={failure}
                onRetry={() => {
                  setFailure(null)
                  setReloads((count) => count + 1)
                }}
              />
            ) : !versions ? (
              <LoadingRow label="Loading earlier copies" />
            ) : !versions.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                No earlier copies yet. One is kept once you have written for a while.
              </p>
            ) : (
              <ScrollArea className="h-72 md:h-[60vh]">
                <ul aria-label="Earlier copies">
                  {versions.map((version) => (
                    <li key={version.id}>
                      <button
                        type="button"
                        aria-pressed={picked?.id === version.id}
                        onClick={() => void pick(version)}
                        className={cn(
                          "grid w-full gap-0.5 border-b px-3 py-2 text-left text-sm hover:bg-muted/50 aria-pressed:bg-muted",
                          focusRing
                        )}
                      >
                        <span className="flex items-center gap-2 font-medium">
                          {formatDateTime(version.createdAt)}
                          {loadingPick === version.id ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {noteTitle(version.title)}, {version.words} words
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </div>
          <div className="min-h-0 rounded-md border px-4 py-2">
            {picked ? (
              <ScrollArea className="h-72 md:h-[60vh]">
                <h3 className="pt-2 text-lg font-semibold">{noteTitle(picked.title)}</h3>
                <NoteEditor
                  key={picked.id}
                  noteId={noteId}
                  initial={picked.body}
                  editable={false}
                  linkTitles={NO_LINKS}
                />
              </ScrollArea>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Pick a copy to see it as it was.</p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" disabled={restoring} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="lg" disabled={restoring} onClick={() => void restore()}>
            {restoring ? <Loader2Icon className="animate-spin" /> : null}
            Restore this copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
