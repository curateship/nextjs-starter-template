import * as React from "react"

import {
  deleteNote,
  loadProjectNotes,
  moveNote,
  newProjectNote,
  type ProjectNote,
  type ProjectNotesList,
} from "@/lib/api/project/project-notes"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { noteTitle } from "@/lib/project/project-notes"

type Loaded = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; list: ProjectNotesList }

/**
 * A project's notes for its Notes dashboard (`project-notes-panel.tsx`),
 * loaded once by the page so the list, the open note and the Dashboards
 * block's count share them.
 */
export type ProjectNotesState = {
  loaded: Loaded
  busy: boolean
  /** The note made last, which opens with the cursor in it. */
  justMade: string | null
  reload: () => void
  /** Makes a note and hands back its id, once the list holds it. */
  create: () => Promise<string | null>
  remove: (note: ProjectNote) => Promise<boolean>
  change: (work: () => Promise<unknown>) => Promise<void>
  /**
   * Move up or Move down, within the pinned notes or the rest, the same for
   * everyone; null when there is no note on that side. The table's rows don't
   * drag, so these keep the shared order.
   */
  moveOf: (note: ProjectNote, direction: -1 | 1) => (() => void) | null
  /** Keeps a saved note's words in the list, so its row reads them at once. */
  keep: (noteId: string, stored: string) => void
}

/** `enabled` false, for a "Just me" list, which has no notes, reads nothing. */
export function useProjectNotes(projectId: string, enabled = true): ProjectNotesState {
  const [loaded, setLoaded] = React.useState<Loaded>({ state: "loading" })
  const [reloads, setReloads] = React.useState(0)
  const [justMade, setJustMade] = React.useState<string | null>(null)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  React.useEffect(() => {
    if (!enabled) return
    let live = true
    loadProjectNotes(projectId).then(
      (list) => live && setLoaded({ state: "ready", list }),
      (error: unknown) => live && setLoaded({ state: "error", message: getProjectErrorMessage(error) })
    )
    return () => {
      live = false
    }
  }, [projectId, reloads, enabled])

  const reload = React.useCallback(() => setReloads((n) => n + 1), [])

  const keep = React.useCallback((noteId: string, stored: string) => {
    setLoaded((was) =>
      was.state === "ready"
        ? {
            state: "ready",
            list: {
              ...was.list,
              notes: was.list.notes.map((note) =>
                note.id === noteId
                  ? { ...note, body: stored, title: noteTitle(stored), updatedAt: new Date().toISOString() }
                  : note
              ),
            },
          }
        : was
    )
  }, [])

  async function create() {
    let made: string | null = null
    await run(async () => {
      const { id } = await newProjectNote(projectId)
      // Shown together with a list that holds it, so it never reads as missing.
      const fresh = await loadProjectNotes(projectId)
      setLoaded({ state: "ready", list: fresh })
      setJustMade(id)
      made = id
    })
    return made
  }

  async function remove(note: ProjectNote) {
    if (!(await run(() => deleteNote(note.id)))) return false
    reload()
    return true
  }

  async function change(work: () => Promise<unknown>) {
    if (await run(work)) reload()
  }

  function moveOf(note: ProjectNote, direction: -1 | 1) {
    if (loaded.state !== "ready") return null
    const { list } = loaded
    const group = list.notes.filter((other) => other.pinned === note.pinned)
    const at = group.findIndex((other) => other.id === note.id)
    const to = at + direction
    if (at < 0 || to < 0 || to >= group.length) return null
    return () => {
      const next = [...group]
      next.splice(at, 1)
      next.splice(to, 0, note)
      const beforeId = next[to + 1]?.id ?? null
      const rest = list.notes.filter((other) => other.pinned !== note.pinned)
      // Shown at once; a refused move puts the list back as the server has it.
      setLoaded({ state: "ready", list: { ...list, notes: note.pinned ? [...next, ...rest] : [...rest, ...next] } })
      void run(() => moveNote(note.id, beforeId)).then((ok) => (ok ? undefined : reload()))
    }
  }

  return { loaded, busy, justMade, reload, create, remove, change, moveOf, keep }
}

