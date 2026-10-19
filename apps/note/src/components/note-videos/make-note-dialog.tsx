import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon, NotebookPenIcon } from "lucide-react"
import { toast } from "sonner"

import { FolderSelect } from "@/components/note-notes/folder-select"
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
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { getNotesErrorMessage, makeNoteFromVideo } from "@/lib/api/note/notes"
import { loadNoteFolders } from "@/lib/api/note/notes-folders"
import type { NoteFolder } from "@/lib/note/notes/notes"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * "Make a note" on a video: asks which notes folder (or none), then makes a
 * note with the video's title, its summary as bullets, its action plan as a
 * checklist with the same ticks and its quotes as quote blocks, linked back
 * to the video, and opens it on Notes. The note is a copy: analysing the
 * video again changes nothing in it.
 */
export function MakeNoteButton({ videoId }: { videoId: string }) {
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [folders, setFolders] = React.useState<NoteFolder[] | null>(null)
  const [target, setTarget] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  function show() {
    setOpen(true)
    setFolders(null)
    setTarget(null)
    loadNoteFolders()
      .then((tree) => setFolders(tree.folders))
      .catch((error) => {
        setOpen(false)
        showErrorToast(getNotesErrorMessage(error))
      })
  }

  async function make() {
    setBusy(true)
    dismissErrorToast()
    try {
      const note = await makeNoteFromVideo(videoId, target)
      toast.success("Made a note from the video.")
      setOpen(false)
      void navigate({ to: "/notes", search: { folder: undefined, view: undefined, open: note.id } })
    } catch (error) {
      showErrorToast(getNotesErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={show}>
        <NotebookPenIcon />
        Make a note
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !busy) setOpen(false)
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Make a note from this video</DialogTitle>
            <DialogDescription>
              The note starts with the summary, the action plan with its ticks, and the key quotes. It is your own
              copy to change.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {folders ? (
              <div className="grid gap-2">
                <Label htmlFor="note-from-video-folder">Folder</Label>
                <FolderSelect id="note-from-video-folder" folders={folders} value={target} onChange={setTarget} />
              </div>
            ) : (
              <LoadingRow label="Loading your folders" />
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="lg" disabled={busy} onClick={() => void make()}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              Make note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
