import * as React from "react"
import { CheckIcon, XIcon } from "lucide-react"

import { SESSION_NOTE_MAX_LENGTH } from "@/lib/pomodoro/session-notes"
import type { usePomodoro } from "@/lib/pomodoro/use-pomodoro"

type PomodoroApi = ReturnType<typeof usePomodoro>

/**
 * The one line about the focus that just finished, offered during the break.
 *
 * Everything here is built so it can be ignored. It appears under the focus
 * task pill instead of over the timer, it never takes keyboard focus, and
 * nothing it does touches the countdown — the break is already running and
 * saving or skipping does not interrupt it. Leaving it alone is a decision
 * the screen accepts: the next focus clears it either way.
 *
 * It is drawn as a sibling of the focus task pill above it, the same
 * rounded-[14px] frame and the same mono label, so the screen reads as one
 * thing rather than a form bolted to the old app's dashboard.
 */
export function SessionNotePrompt({ pomodoro }: { pomodoro: PomodoroApi }) {
  const noteSession = pomodoro.noteSession
  if (!noteSession) return null
  return (
    <SessionNoteField
      // Keyed on the session, so a second finished focus starts an empty
      // field rather than inheriting what was typed about the first.
      key={noteSession.id}
      saved={noteSession.note}
      onSave={pomodoro.saveSessionNote}
      onDismiss={pomodoro.dismissSessionNote}
    />
  )
}

function SessionNoteField({
  saved,
  onSave,
  onDismiss,
}: {
  saved: string
  onSave: (note: string) => Promise<boolean>
  onDismiss: () => void
}) {
  const [note, setNote] = React.useState(saved)
  const [busy, setBusy] = React.useState(false)
  const [confirmed, setConfirmed] = React.useState(false)
  const trimmed = note.trim()
  const dirty = trimmed !== saved

  return (
    <form
      className="flex min-h-[42px] w-full max-w-[min(520px,calc(100vw-36px))] flex-wrap items-center gap-2.5 rounded-[14px] border border-[rgba(var(--p-fg-rgb),0.1)] bg-[rgba(var(--p-canvas-rgb),0.75)] py-2 pl-3.5 pr-2.5"
      onSubmit={(event) => {
        event.preventDefault()
        if (busy || !dirty) return
        setBusy(true)
        setConfirmed(false)
        void onSave(note).then((ok) => {
          setBusy(false)
          setConfirmed(ok)
        })
      }}
    >
      <label
        htmlFor="session-note"
        className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
      >
        Session note
      </label>
      <input
        id="session-note"
        value={note}
        onChange={(event) => {
          setNote(event.target.value)
          setConfirmed(false)
        }}
        maxLength={SESSION_NOTE_MAX_LENGTH}
        placeholder="What did you do?"
        className="min-w-0 flex-1 border-0 bg-transparent py-1 text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground"
      />
      {/* Said out loud as well as shown, because the tick is the only sign a
          note landed and the break may have taken the reader's eyes away. */}
      <span role="status" className="sr-only">
        {confirmed ? (trimmed ? "Note saved." : "Note cleared.") : ""}
      </span>
      {confirmed && !dirty ? (
        <small className="shrink-0 font-mono text-[10px] text-[var(--p-success)]">
          {trimmed ? "Saved" : "Cleared"}
        </small>
      ) : null}
      <button
        type="submit"
        disabled={busy || !dirty}
        className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-[rgba(var(--p-fg-rgb),0.08)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
        aria-label="Save this session note"
      >
        <CheckIcon className="size-[13px]" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-[rgba(var(--p-fg-rgb),0.08)] hover:text-foreground"
        aria-label="Skip the note for this session"
      >
        <XIcon className="size-[13px]" aria-hidden="true" />
      </button>
    </form>
  )
}
