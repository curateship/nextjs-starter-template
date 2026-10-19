import * as React from "react"
import type { JSONContent } from "@tiptap/core"

import { getNotesErrorMessage, isChangedElsewhere, saveNoteChanges } from "@/lib/api/note/notes"
import type { NoteCard } from "@/lib/note/notes/notes"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Saving an open note: 700ms after the last change, at once when the note is
 * left, one save at a time.
 *
 * Every save carries the revision it started from. A save the server refuses
 * because the note moved on (another tab saved first) stops and asks which
 * version to keep. A save that fails for any other reason, which in practice
 * is a dropped connection, keeps the unsaved change in this browser under the
 * note's id, says "Not saved yet, trying again", and tries every 10 seconds
 * and the moment the browser says it is back online. Opening the note again
 * in this browser picks the kept change up.
 */

export type NoteChanges = {
  title?: string
  body?: JSONContent
  icon?: string | null
  coverUrl?: string | null
}

export type AutosaveStatus = "idle" | "saving" | "saved" | "offline" | "conflict"

/** What is kept in the browser while a change has not reached the server. */
type KeptChanges = { revision: number; changes: NoteChanges; at: string }

const SAVE_DELAY_MS = 700
const RETRY_MS = 10_000

export function keptChangesKey(noteId: string) {
  return `note-unsaved-${noteId}`
}

/** Unsaved changes this browser kept for a note, or null. Never throws. */
export function readKeptChanges(noteId: string): KeptChanges | null {
  try {
    const raw = window.localStorage.getItem(keptChangesKey(noteId))
    if (!raw) return null
    const kept = JSON.parse(raw) as KeptChanges
    return typeof kept?.revision === "number" && kept.changes && typeof kept.changes === "object" ? kept : null
  } catch {
    return null
  }
}

function keep(noteId: string, revision: number, changes: NoteChanges) {
  try {
    window.localStorage.setItem(
      keptChangesKey(noteId),
      JSON.stringify({ revision, changes, at: new Date().toISOString() } satisfies KeptChanges)
    )
  } catch {
    // A full or blocked store only loses the safety net; the save still runs.
  }
}

export function forgetKeptChanges(noteId: string) {
  try {
    window.localStorage.removeItem(keptChangesKey(noteId))
  } catch {
    // Nothing to do: there was nothing it could have kept either.
  }
}

/** Whether an error is the server refusing the change itself, not a lost connection. */
function isRefusal(error: unknown) {
  return getNotesErrorMessage(error) !== getNotesErrorMessage(new Error("unknown"))
}

export function useNoteAutosave(options: {
  noteId: string
  revision: number
  /** Changes kept from an earlier visit, already shown on screen, to send first. */
  startWith?: NoteChanges | null
  /**
   * The kept changes were made on an older revision than the server's, so
   * nothing is sent until the person picks a version.
   */
  startInConflict?: boolean
  onSaved: (result: { revision: number; card: NoteCard; words: number }) => void
}) {
  const { noteId } = options
  const [status, setStatus] = React.useState<AutosaveStatus>(
    options.startInConflict ? "conflict" : options.startWith ? "offline" : "idle"
  )
  const revision = React.useRef(options.revision)
  const pending = React.useRef<NoteChanges>(options.startWith ?? {})
  const inFlight = React.useRef(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const retry = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopped = React.useRef(Boolean(options.startInConflict))
  // The server turned the last save down for good reason (too long, in
  // Trash, signed out). Nothing is sent again until the next change.
  const refused = React.useRef(false)
  // The note has closed. A last save still goes, but nothing is retried from
  // a panel that is gone: the change waits in this browser for the next open.
  const closed = React.useRef(false)
  const saved = React.useRef(options.onSaved)
  React.useEffect(() => {
    saved.current = options.onSaved
  })

  // The save calls itself again (a retry, or what was typed meanwhile)
  // through this ref.
  const again = React.useRef<() => Promise<void>>(async () => undefined)

  const flush = React.useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (retry.current) clearTimeout(retry.current)
    retry.current = null
    if (inFlight.current || stopped.current || refused.current) return
    const sending = pending.current
    if (!Object.keys(sending).length) return
    inFlight.current = true
    keep(noteId, revision.current, sending)
    setStatus("saving")
    try {
      const result = await saveNoteChanges({ id: noteId, revision: revision.current, ...sending })
      revision.current = result.revision
      // Only what was sent is done; anything typed meanwhile is still waiting.
      const rest: NoteChanges = {}
      for (const key of Object.keys(pending.current) as (keyof NoteChanges)[]) {
        if (pending.current[key] !== sending[key]) Object.assign(rest, { [key]: pending.current[key] })
      }
      pending.current = rest
      if (Object.keys(rest).length) keep(noteId, revision.current, rest)
      else forgetKeptChanges(noteId)
      setStatus("saved")
      saved.current(result)
    } catch (error) {
      if (isChangedElsewhere(error)) {
        stopped.current = true
        setStatus("conflict")
      } else if (isRefusal(error)) {
        refused.current = true
        setStatus("idle")
        showErrorToast(getNotesErrorMessage(error))
      } else {
        setStatus("offline")
        if (!closed.current) retry.current = setTimeout(() => void again.current(), RETRY_MS)
      }
    } finally {
      inFlight.current = false
    }
    if (
      !stopped.current &&
      !refused.current &&
      !closed.current &&
      Object.keys(pending.current).length &&
      !retry.current &&
      !timer.current
    ) {
      void again.current()
    }
  }, [noteId])
  React.useEffect(() => {
    again.current = flush
  }, [flush])

  /** A change from the screen: saved 700ms after the last one, or now. */
  const change = React.useCallback(
    (changes: NoteChanges, now = false) => {
      pending.current = { ...pending.current, ...changes }
      refused.current = false
      if (stopped.current) {
        keep(noteId, revision.current, pending.current)
        return
      }
      if (timer.current) clearTimeout(timer.current)
      if (now) void flush()
      else timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS)
    },
    [flush, noteId]
  )

  /** "Keep this tab's version": send what is here on top of the newer revision. */
  const keepMine = React.useCallback(
    (latestRevision: number) => {
      revision.current = latestRevision
      stopped.current = false
      void flush()
    },
    [flush]
  )

  /** "Use the other version": throw away what this tab had not saved. */
  const discard = React.useCallback(() => {
    pending.current = {}
    stopped.current = false
    forgetKeptChanges(noteId)
    setStatus("idle")
  }, [noteId])

  // Kept changes go up as soon as the note opens; a connection coming back
  // tries again at once; leaving the page or the note saves what is waiting.
  React.useEffect(() => {
    closed.current = false
    if (Object.keys(pending.current).length) void flush()
    const online = () => void flush()
    const hidden = () => {
      if (document.visibilityState === "hidden") void flush()
    }
    window.addEventListener("online", online)
    document.addEventListener("visibilitychange", hidden)
    return () => {
      window.removeEventListener("online", online)
      document.removeEventListener("visibilitychange", hidden)
      if (retry.current) clearTimeout(retry.current)
      closed.current = true
      void flush()
    }
  }, [flush])

  return { status, change, flush, keepMine, discard }
}
