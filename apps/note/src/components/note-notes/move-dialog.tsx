import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { FolderSelect } from "@/components/note-notes/folder-select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { checkNoteMove, getNotesErrorMessage, moveNotesTo } from "@/lib/api/note/notes"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { plural } from "@/lib/format/plural"
import { listWords, type NoteFolder } from "@/lib/note/notes/notes"
import { folderPath } from "@/lib/note/notes/tree"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Moves one note or several into a folder, or out of every folder. Before
 * anything moves the server says which filled fields have nowhere to go in
 * the new folder, and the window names them: "Author and Rating will be
 * removed" (Tyler, 18 Oct 2026). A move that loses nothing goes at once.
 */
export function MoveNotesDialog({
  noteIds,
  folders,
  fromFolderId,
  onClose,
  onMoved,
}: {
  /** The notes to move; the window is open while this has any. */
  noteIds: string[]
  folders: NoteFolder[]
  /** The folder they are in now, when they share one. */
  fromFolderId: string | null | undefined
  onClose: () => void
  onMoved: (folderId: string | null, movedIds: string[]) => void
}) {
  const open = noteIds.length > 0
  const [target, setTarget] = React.useState<string | null>(null)
  const [lost, setLost] = React.useState<string[] | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setTarget(firstOther(folders, fromFolderId))
      setLost(null)
    }
  }

  async function move(confirmed: boolean) {
    setBusy(true)
    dismissErrorToast()
    try {
      if (!confirmed) {
        const check = await checkNoteMove(noteIds, target)
        if (check.lost.length) {
          setLost(check.lost)
          return
        }
      }
      const result = await moveNotesTo(noteIds, target)
      const where = target ? `“${folderPath(folders, target)}”` : "no folder"
      toast.success(
        noteIds.length === 1
          ? `Moved to ${where}.`
          : `${describeBulkResult({
              done: result.done.length,
              kept: result.skipped.length,
              one: "note",
              many: "notes",
              verb: "moved",
              keptReason: "already there",
            })}`
      )
      onMoved(target, result.done)
    } catch (error) {
      showErrorToast(getNotesErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const count = noteIds.length
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{count === 1 ? "Move note" : `Move ${count} notes`}</DialogTitle>
          <DialogDescription>
            Fields with the same name and type in the new folder keep their values. The rest are removed.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Where to</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="note-move-target">Folder</Label>
                <FolderSelect
                  id="note-move-target"
                  folders={folders}
                  value={target}
                  onChange={(next) => {
                    setTarget(next)
                    setLost(null)
                  }}
                />
              </div>
              {lost ? (
                <p className="text-sm" role="alert">
                  {listWords(lost)} will be removed, because {target ? "that folder has" : "a loose note has"} no{" "}
                  {plural(lost.length, "field")} to keep {plural(lost.length, "it", "them")}.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="lg" disabled={busy} onClick={() => void move(lost !== null)}>
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            {lost ? "Move anyway" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function firstOther(folders: NoteFolder[], from: string | null | undefined) {
  if (from === null) return folders[0]?.id ?? null
  return null
}
