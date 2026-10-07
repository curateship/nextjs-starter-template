import * as React from "react"
import { CheckIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

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
    // The box inside is borderless, so the ring goes on this rounded frame
    // while the box has focus. Same colour and width as `focusRing` in
    // `src/lib/layout/focus-ring.ts`, which every other field draws. Only the
    // text box lights it: the Save button inside draws its own.
    <form
      className="flex min-h-9 w-full max-w-[min(520px,calc(100vw-36px))] flex-wrap items-center gap-2.5 rounded-[14px] border bg-[rgba(var(--p-canvas-rgb),0.75)] py-2 pl-3.5 pr-2.5 has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50"
      onSubmit={(event) => {
        event.preventDefault()
        if (busy) return
        // Nothing typed since the last save, so there is nothing to send.
        // Saying so beats a dead Save button: the rulebook keeps the action
        // pressable and answers on the press.
        if (!dirty) {
          setConfirmed(true)
          return
        }
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
      {/* Enabled with nothing typed. "Nothing has changed" is not a reason
          worth greying a button out for, and a faded Save with no word is the
          exact thing the rest of this screen stopped doing. */}
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        disabled={busy}
        className="shrink-0 text-muted-foreground hover:bg-[rgba(var(--p-fg-rgb),0.08)] hover:text-foreground"
        aria-label="Save this session note"
      >
        <CheckIcon className="size-[13px]" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onDismiss}
        className="shrink-0 text-muted-foreground hover:bg-[rgba(var(--p-fg-rgb),0.08)] hover:text-foreground"
        aria-label="Skip the note for this session"
      >
        <XIcon className="size-[13px]" aria-hidden="true" />
      </Button>
    </form>
  )
}
