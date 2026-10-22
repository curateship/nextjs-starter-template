import * as React from "react"
import { Loader2Icon, MessageSquarePlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { PanelCard } from "@/components/fitness/panel-card"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { changeCoachNote, type CoachNote } from "@/lib/api/fitness/coaching"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Coach notes on a finished workout in History (Tyler, 21 Oct 2026: "The
 * workout and each lift"). The person reads them; a coach they said yes to
 * writes, changes and deletes their own. They go one way: there are no
 * replies.
 */

type Notes = {
  notes: CoachNote[]
  canNote: boolean
  finished: boolean
  workoutId: string
  onChange: (notes: CoachNote[]) => void
}

/** The card under the workout's summary: the notes on the whole workout, and a coach's box to write one. */
export function WorkoutCoachNotes({ notes, canNote, finished, workoutId, onChange }: Notes) {
  const whole = notes.filter((note) => note.position === null)
  const own = whole.find((note) => note.mine) ?? null
  if (whole.length === 0 && !canNote) return null
  return (
    <PanelCard storageId="fitness-history-coach-notes" title="Coach notes" meta={whole.length || undefined}>
      <ul className="grid gap-2 empty:hidden">
        {whole
          .filter((note) => !note.mine || !canNote)
          .map((note) => (
            <NoteLine key={note.id} note={note} />
          ))}
      </ul>
      {canNote ? (
        finished ? (
          <NoteEditor
            label="Your note on this workout"
            note={own}
            workoutId={workoutId}
            position={null}
            onChange={onChange}
          />
        ) : (
          <p className="text-[13px] text-muted-foreground">A note can go on the workout once it's finished.</p>
        )
      ) : null}
    </PanelCard>
  )
}

/** Under one lift in the Lifts card: its coach notes, and for a coach a button to write one. */
export function LiftCoachNotes({
  notes,
  canNote,
  finished,
  workoutId,
  position,
  liftName,
  onChange,
}: Notes & { position: number; liftName: string }) {
  const mine = notes.filter((note) => note.position === position)
  const own = mine.find((note) => note.mine) ?? null
  const [writing, setWriting] = React.useState(false)
  const others = mine.filter((note) => !note.mine || !canNote)
  return (
    <>
      {others.length ? (
        <ul className="grid gap-2">
          {others.map((note) => (
            <NoteLine key={note.id} note={note} />
          ))}
        </ul>
      ) : null}
      {canNote && finished ? (
        own || writing ? (
          <NoteEditor
            label={`Your note on ${liftName}`}
            note={own}
            workoutId={workoutId}
            position={position}
            onChange={onChange}
            onDone={() => setWriting(false)}
          />
        ) : (
          <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setWriting(true)}>
            <MessageSquarePlusIcon />
            Note on this lift
          </Button>
        )
      ) : null}
    </>
  )
}

function NoteLine({ note }: { note: CoachNote }) {
  return (
    <li className="rounded-md bg-muted/60 px-2.5 py-2 text-[13px]">
      <span className="font-medium">{note.coachName}: </span>
      <span className="whitespace-pre-line">{note.text}</span>
    </li>
  )
}

/**
 * A coach's own note: the text with a cog to change it and a bin, or the box
 * to write it. Save note keeps the text; a refused save keeps what was typed.
 */
function NoteEditor({
  label,
  note,
  workoutId,
  position,
  onChange,
  onDone,
}: {
  label: string
  note: CoachNote | null
  workoutId: string
  position: number | null
  onChange: (notes: CoachNote[]) => void
  onDone?: () => void
}) {
  const id = React.useId()
  const [editing, setEditing] = React.useState(note === null)
  const [text, setText] = React.useState(note?.text ?? "")
  const [busy, setBusy] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [invalid, setInvalid] = React.useState(false)

  async function save() {
    if (!text.trim()) {
      setInvalid(true)
      showErrorToast(FITNESS_ERRORS.noteNeeded)
      return
    }
    setInvalid(false)
    setBusy(true)
    try {
      onChange(await changeCoachNote({ action: "save", workoutId, position, text }))
      toast.success(note ? "Note changed." : "Note saved. They get a notice in their bell.")
      setEditing(false)
      onDone?.()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!note) return
    setBusy(true)
    try {
      onChange(await changeCoachNote({ action: "delete", workoutId, noteId: note.id }))
      toast.success("Note deleted.")
      setDeleting(false)
      setText("")
      onDone?.()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  if (note && !editing) {
    return (
      <div className="flex items-start gap-1 rounded-md bg-muted/60 py-1 pr-1 pl-2.5 text-[13px]">
        <p className="min-w-0 flex-1 py-1 whitespace-pre-line">
          <span className="font-medium">You: </span>
          {note.text}
        </p>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Change your note" onClick={() => setEditing(true)}>
              <SettingsIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Change your note</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Delete your note" onClick={() => setDeleting(true)}>
              <Trash2Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete your note</TooltipContent>
        </Tooltip>
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title="Delete your note?"
          description="It goes from their History. The notice they already got stays in their bell."
          confirmLabel="Delete note"
          destructive
          loading={busy}
          onConfirm={() => void remove()}
        />
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={1}
        maxLength={1000}
        placeholder="Good depth on every set. Add 2.5 kg next week."
        aria-invalid={invalid || undefined}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex justify-end gap-2">
        {note || onDone ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              setText(note?.text ?? "")
              setEditing(false)
              setInvalid(false)
              onDone?.()
            }}
          >
            Cancel
          </Button>
        ) : null}
        <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          Save note
        </Button>
      </div>
    </div>
  )
}
