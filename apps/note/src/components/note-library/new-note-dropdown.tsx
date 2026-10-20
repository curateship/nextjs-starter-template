import * as React from "react"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getLibraryErrorMessage } from "@/lib/api/note/library"
import { createNoteIn } from "@/lib/api/note/notes"
import {
  NOTE_PRIORITIES,
  NOTE_TITLE_MAX,
  PRIORITY_LABEL,
  type LibraryPage,
  type NoteDetail,
  type NotePriority,
} from "@/lib/note/library/notes"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

const LOOSE = "__loose"
const BLANK = "__blank"

/**
 * New note, the middle header's one primary button. A dropdown, not a window
 * (UI standard): the title first, then the folder and the priority side by
 * side, then a template when the library has any, and "Create note" at the
 * bottom right. It starts in the folder showing. Clicking away keeps the typed
 * title for the next opening.
 */
export function NewNoteDropdown({
  page,
  folderId,
  onMade,
}: {
  page: LibraryPage
  /** The folder showing in the middle, which the note starts in. */
  folderId: string | null
  onMade: (note: NoteDetail) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [folder, setFolder] = React.useState(folderId ?? LOOSE)
  const [priority, setPriority] = React.useState<NotePriority>("normal")
  const [template, setTemplate] = React.useState(BLANK)
  const [busy, setBusy] = React.useState(false)

  // Each opening starts from the folder showing; the title is kept.
  function openChange(next: boolean) {
    setOpen(next)
    if (next) {
      setFolder(folderId ?? LOOSE)
      setPriority("normal")
      setTemplate(BLANK)
    }
  }

  async function submit() {
    setBusy(true)
    dismissErrorToast()
    try {
      const made = await createNoteIn({
        libraryId: page.library.id,
        folderId: folder === LOOSE ? null : folder,
        templateId: template === BLANK ? null : template,
        title,
        priority,
      })
      setOpen(false)
      setTitle("")
      toast.success("Note made.")
      await onMade(made)
    } catch (error) {
      showErrorToast(getLibraryErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <NewRecordDropdown
      label="New note"
      open={open}
      onOpenChange={openChange}
      submitLabel="Create note"
      busy={busy}
      onSubmit={() => void submit()}
      trigger={
        <DashboardToolbarButton type="button" aria-label="New note">
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
          <span className="@max-3xl:sr-only">New note</span>
        </DashboardToolbarButton>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="new-note-title">Title</Label>
        <Input
          id="new-note-title"
          autoFocus
          value={title}
          maxLength={NOTE_TITLE_MAX}
          placeholder="Untitled"
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="new-note-folder">Folder</Label>
          <Select value={folder} onValueChange={setFolder}>
            <SelectTrigger id="new-note-folder" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LOOSE}>No folder</SelectItem>
              {page.folders.map((each) => (
                <SelectItem key={each.id} value={each.id}>
                  {each.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="new-note-priority">Priority</Label>
          <Select value={priority} onValueChange={(next) => setPriority(next as NotePriority)}>
            <SelectTrigger id="new-note-priority" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTE_PRIORITIES.map((each) => (
                <SelectItem key={each} value={each}>
                  {PRIORITY_LABEL[each]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {page.templates.length ? (
        <div className="grid gap-2">
          <Label htmlFor="new-note-template">Template</Label>
          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger id="new-note-template" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={BLANK}>Blank note</SelectItem>
              {page.templates.map((each) => (
                <SelectItem key={each.id} value={each.id}>
                  {each.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </NewRecordDropdown>
  )
}
