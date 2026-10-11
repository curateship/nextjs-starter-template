import * as React from "react"
import { Loader2Icon, PlusIcon, SettingsIcon } from "lucide-react"

import { WrittenPageBody } from "@/components/pages/written-page-body"
import { DocumentEditor } from "@/components/shared/rich-text-editor"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"
import { notesForEditor, readTaskNotes, taskNotesAreEmpty } from "@/lib/project/notes"

/**
 * A task's notes: read as formatted text with links that open in a new tab,
 * and written in the shared editor (select words for bold, lists and links).
 * Edits save when the editor is left and when Done is pressed. Notes written
 * before 10 Oct 2026 are plain text and show exactly as typed until edited.
 */
export function TaskNotesField({
  notes,
  readOnly,
  onSave,
}: {
  notes: string
  readOnly: boolean
  onSave: (notes: WrittenPageNode) => Promise<boolean>
}) {
  const saved = readTaskNotes(notes)
  const [editing, setEditing] = React.useState(false)
  // Null until something is typed, so leaving an untouched editor saves nothing.
  const [draft, setDraft] = React.useState<WrittenPageNode | null>(null)
  const editorBox = React.useRef<HTMLDivElement>(null)

  // The editor draws itself a moment after it mounts, so the cursor goes in
  // once its writing area exists.
  React.useEffect(() => {
    if (!editing) return
    let tries = 0
    const timer = window.setInterval(() => {
      const area = editorBox.current?.querySelector<HTMLElement>(".tiptap")
      tries += 1
      if (area || tries > 20) window.clearInterval(timer)
      area?.focus()
    }, 25)
    return () => window.clearInterval(timer)
  }, [editing])

  async function save() {
    if (!draft) return true
    const ok = await onSave(draft)
    if (ok) setDraft(null)
    return ok
  }

  // Done spins while the notes save, and a second press waits for the first.
  const [finishing, setFinishing] = React.useState(false)
  async function finish() {
    if (finishing) return
    setFinishing(true)
    const ok = await save()
    setFinishing(false)
    if (ok) setEditing(false)
  }

  return (
    <div className="grid gap-2" role="group" aria-labelledby="task-notes-label">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <Label id="task-notes-label" asChild>
          <span>Notes</span>
        </Label>
        {readOnly ? null : editing ? (
          <Button type="button" variant="outline" size="sm" disabled={finishing} onClick={() => void finish()}>
            {finishing ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Done
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            {taskNotesAreEmpty(saved) ? (
              <>
                <PlusIcon className="size-4" />
                Add notes
              </>
            ) : (
              <>
                <SettingsIcon className="size-4" />
                Edit notes
              </>
            )}
          </Button>
        )}
      </div>
      {editing ? (
        <div
          ref={editorBox}
          className="[&_.page-rte_.tiptap]:min-h-28 [&_.page-rte_.tiptap]:px-3 [&_.page-rte_.tiptap]:py-2 [&_.page-rte_.tiptap]:text-sm"
          onBlur={(event) => {
            const next = event.relatedTarget
            // The link box opens outside this box, so moving into it isn't leaving.
            if (next instanceof Element && (event.currentTarget.contains(next) || next.closest("[data-slot=popover-content]"))) {
              return
            }
            void save()
          }}
        >
          <DocumentEditor
            value={notesForEditor(saved)}
            onChange={setDraft}
            placeholder="Anything the person doing it should know. Select words to make them bold, a list or a link."
          />
        </div>
      ) : taskNotesAreEmpty(saved) ? (
        <p className="text-sm text-muted-foreground">No notes.</p>
      ) : saved.kind === "text" ? (
        <p className="text-sm break-words whitespace-pre-wrap">{saved.text}</p>
      ) : (
        <div
          className="break-words"
          // Links in notes open in a new tab, so the task stays where it is.
          onClickCapture={(event) => {
            const link = (event.target as Element).closest("a")
            if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return
            event.preventDefault()
            window.open(link.href, "_blank", "noopener,noreferrer")
          }}
        >
          <WrittenPageBody body={saved.body} />
        </div>
      )}
    </div>
  )
}
