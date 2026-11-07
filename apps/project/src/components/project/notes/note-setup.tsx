import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { loadTaskCards, type NoteTaskCard } from "@/lib/api/project/note-blocks"
import type { TaskLink } from "@/lib/api/project/linked-records"
import type { TaskFile } from "@/lib/api/project/tasks"
import { useTeamId } from "@/lib/project/team-scope"

/**
 * What the "/" blocks in one note need to know about where they are (Project
 * note blocks task): which notes box it is, and, on a task, its files and its
 * Video or Promo record. Both the editor's blocks and the reader's drawing
 * (`note-reader.tsx`) read it.
 */

/**
 * Which notes box: a task's own notes, New task's or quick new task's
 * description (no task yet), a meeting's notes, a project's page in its
 * left panel, the site admin's own page on My dashboard, which alone
 * offers the dashboard blocks, or a team's page on the Team dashboard, which
 * alone offers the team blocks.
 */
export type NoteWhere = "task" | "new" | "meeting" | "project" | "dashboard" | "team"

export type NoteTask = {
  id: string
  /** The task's Files card files, which File blocks pick from and uploaded pictures join. */
  files: TaskFile[]
  link: TaskLink | null
  /** Reads the task again, after a file was added. */
  refresh: () => Promise<void>
  /** Its comments, for a Comments block; left out where the task has none to show. */
  comments: NoteComments | null
}

/**
 * A task's comments as a Comments block draws them: the thread with its box
 * to write in, how many there are, and `placed`, which a drawn block calls as
 * it appears and whose return it calls as it goes. So the panel knows while
 * a block shows the comments, and draws them under the notes otherwise.
 */
export type NoteComments = {
  count: number
  thread: React.ReactNode
  placed: () => () => void
}

export type NoteSetup = {
  where: NoteWhere
  task: NoteTask | null
  teamId: string | undefined
  /** Opens a task in the right panel, as a # link does. */
  openTask: (taskId: string, projectId: string) => void
  /**
   * Keeps the notes from being drawn again from what was saved while a block
   * is busy, such as a file going up. A block not filled in isn't saved, so a
   * redraw then would drop it mid-upload.
   */
  hold: (busy: boolean) => void
}

const NO_REFRESH = () => Promise.resolve()

/**
 * The setup for one notes box: where it is, and on a task its files, its
 * Video or Promo record and how to read it again. A Task card opens its task
 * in the right panel, as a # link does.
 */
const NO_HOLD = () => undefined

export function useNotesBoxSetup(
  where: NoteWhere,
  task?: { id: string; files?: TaskFile[]; link?: TaskLink | null; refresh?: () => Promise<void>; comments?: NoteComments | null },
  hold: (busy: boolean) => void = NO_HOLD
): NoteSetup {
  const navigate = useNavigate()
  const teamId = useTeamId()
  const taskId = task?.id
  const files = task?.files
  const link = task?.link
  const refresh = task?.refresh
  const comments = task?.comments
  return React.useMemo(
    () => ({
      where,
      teamId,
      task: taskId
        ? { id: taskId, files: files ?? [], link: link ?? null, refresh: refresh ?? NO_REFRESH, comments: comments ?? null }
        : null,
      openTask: (openId: string, projectId: string) =>
        void navigate({ to: "/projects/$projectId", params: { projectId }, search: { task: openId } }),
      hold,
    }),
    [where, teamId, taskId, files, link, refresh, comments, navigate, hold]
  )
}

type CardWaiter = { resolve: (card: NoteTaskCard) => void; reject: (error: unknown) => void }

/**
 * Asks for every Task card a note draws in one call: cards that ask in the
 * same moment are sent together. Made once per note, so the cards are read
 * fresh each time the note opens.
 */
export class TaskCardLoader {
  private waiting = new Map<string, CardWaiter[]>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private teamId: string | undefined
  constructor(teamId: string | undefined) {
    this.teamId = teamId
  }

  load(taskId: string): Promise<NoteTaskCard> {
    return new Promise((resolve, reject) => {
      const list = this.waiting.get(taskId) ?? []
      list.push({ resolve, reject })
      this.waiting.set(taskId, list)
      this.timer ??= setTimeout(() => this.send(), 0)
    })
  }

  private send() {
    const batch = this.waiting
    this.waiting = new Map()
    this.timer = null
    loadTaskCards([...batch.keys()].slice(0, 50), this.teamId).then(
      (cards) => {
        const byId = new Map(cards.map((card) => [card.taskId, card]))
        for (const [taskId, list] of batch) {
          const card = byId.get(taskId) ?? { taskId, state: "deleted" as const }
          for (const waiter of list) waiter.resolve(card)
        }
      },
      (error: unknown) => {
        for (const list of batch.values()) for (const waiter of list) waiter.reject(error)
      }
    )
  }
}

type NoteContext = NoteSetup & { cards: TaskCardLoader }

const NoteSetupContext = React.createContext<NoteContext | null>(null)

export function NoteSetupProvider({ setup, children }: { setup: NoteSetup; children: React.ReactNode }) {
  const [cards] = React.useState(() => new TaskCardLoader(setup.teamId))
  const value = React.useMemo(() => ({ ...setup, cards }), [setup, cards])
  return <NoteSetupContext.Provider value={value}>{children}</NoteSetupContext.Provider>
}

export function useNoteSetup(): NoteContext {
  const setup = React.useContext(NoteSetupContext)
  if (!setup) throw new Error("A note block is drawn outside its NoteSetupProvider.")
  return setup
}

/** One value loaded for a block, with its loading and failed states. */
export type Loaded<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "failed"; error: unknown }

/** Loads a block's value when `key` changes. `load` is read on that change only. */
export function useLoaded<T>(key: string | null, load: () => Promise<T>): [Loaded<T>, () => void] {
  const [result, setResult] = React.useState<{ key: string | null; tries: number; loaded: Loaded<T> }>({
    key,
    tries: 0,
    loaded: { state: "loading" },
  })
  const [tries, setTries] = React.useState(0)
  const loadRef = React.useRef(load)
  React.useEffect(() => {
    loadRef.current = load
  })
  React.useEffect(() => {
    if (key === null) return
    let live = true
    loadRef.current().then(
      (value) => live && setResult({ key, tries, loaded: { state: "ready", value } }),
      (error: unknown) => live && setResult({ key, tries, loaded: { state: "failed", error } })
    )
    return () => {
      live = false
    }
  }, [key, tries])
  const current = result.key === key && result.tries === tries ? result.loaded : { state: "loading" as const }
  return [current, () => setTries((n) => n + 1)]
}
