// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useRouter: () => ({ invalidate: vi.fn() }),
  useNavigate: () => vi.fn(),
  Link: ({ children, to: _to, ...props }: { children?: React.ReactNode; to?: string }) => <a {...props}>{children}</a>,
}))
vi.mock("@/lib/api/note/library", () => ({
  getLibraryErrorMessage: () => "That did not work.",
  pinLibraryRow: vi.fn(),
  saveView: vi.fn(),
  deleteSavedView: vi.fn(),
  saveLibrary: vi.fn(),
  deleteLibraryTemplate: vi.fn(),
  makeLibrary: vi.fn(),
  deleteLibraryRow: vi.fn(),
}))
vi.mock("@/lib/api/note/library-page", () => ({
  lockLibraryLeftPage: vi.fn(),
  saveLibraryLeftPage: vi.fn(),
  setLibraryLeftPageCover: vi.fn(),
}))
vi.mock("@/lib/api/note/notes", () => ({
  createNoteIn: vi.fn(),
  changeNotes: vi.fn(),
  moveNotesToLibrary: vi.fn(),
  deleteNoteNow: vi.fn(),
  emptyLibraryTrash: vi.fn(),
  restoreNoteFromTrash: vi.fn(),
  duplicateLibraryNote: vi.fn(),
  deleteLibraryTag: vi.fn(),
  renameLibraryTag: vi.fn(),
  saveNotePlayed: vi.fn(async () => undefined),
  loadPlanSteps: vi.fn(async () => [
    {
      noteId: "n1",
      title: "Pricing talk",
      steps: [
        { text: "Raise the price", done: false },
        { text: "Write the page", done: true },
      ],
    },
  ]),
  loadLibraryQuotes: vi.fn(async () => [
    { noteId: "n1", title: "Pricing talk", authorName: "Patrick", text: "Charge more", startMs: 4000, kind: "quote" },
    { noteId: "n2", title: "Hooks", authorName: "Ana", text: "Start with the end", startMs: null, kind: "quote" },
  ]),
}))
vi.mock("@/lib/api/note/imports", () => ({
  saveNotePlan: vi.fn(async () => ({})),
  analyseManyNotes: vi.fn(),
  mergeNotePlans: vi.fn(),
  importNoteLink: vi.fn(),
}))

import { PlanStepsPanel, QuotesPanel } from "@/components/note-library/gathered-lists"
import { AiCards } from "@/components/note-library/import-cards"
import type { DashboardActions } from "@/components/note-library/library-dashboard"
import { LibraryLeftPanel } from "@/components/note-library/library-left-panel"
import { NotesListPanel } from "@/components/note-library/notes-list-panel"
import { usePlayerPlace } from "@/components/note-library/use-player-place"
import { TooltipProvider } from "@/components/ui/tooltip"
import { readLibrarySearch, scopeOf } from "@/lib/note/library/address"
import { saveNotePlayed } from "@/lib/api/note/notes"
import { saveNotePlan } from "@/lib/api/note/imports"
import type { LibraryPage, LibraryRow, NoteCard, NoteDetail } from "@/lib/note/library/notes"

/**
 * The library screens Tyler's task 02 added, drawn in a browser-like page:
 * the Transcript card and Add to note, where a video starts again, the Plan
 * steps and Quotes lists, the left page's Libraries block, the address's
 * tabs and Show choice, and the sortable notes table.
 */

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  window.localStorage.clear()
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.innerHTML = ""
  vi.clearAllMocks()
})

async function draw(element: React.ReactElement) {
  await act(async () => {
    root.render(<TooltipProvider>{element}</TooltipProvider>)
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function button(name: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (each) => each.getAttribute("aria-label") === name || each.textContent?.trim() === name
  )
  if (!found) throw new Error(`No button "${name}"`)
  return found
}

function actions(overrides: Partial<DashboardActions> = {}): DashboardActions {
  return {
    openNote: vi.fn(),
    cardChanged: vi.fn(),
    gone: vi.fn(),
    refreshPage: vi.fn(async () => undefined),
    refreshList: vi.fn(async () => undefined),
    refreshAll: vi.fn(async () => undefined),
    setSearch: vi.fn(),
    ...overrides,
  }
}

const page: LibraryPage = {
  library: {
    id: "l1",
    name: "Content ideas",
    colour: "blue",
    pinned: false,
    noteCount: 3,
    editedAt: "2026-10-20T10:00:00.000Z",
  },
  counts: { all: 3, pinned: 1, archived: 0, trash: 0, openSteps: 1, quotes: 2 },
  authors: [{ key: "patrick", name: "Patrick", pictureUrl: null, count: 1 }],
  tags: [{ tag: "hooks", count: 2 }],
  views: [],
  templates: [],
  otherLibraries: [],
}

const detail = {
  id: "n1",
  libraryId: "l1",
  source: "youtube_long",
  title: "Pricing talk",
  analysed: true,
  analyseStatus: "ready",
  importStatus: "saved",
  videoStatus: "none",
  mergedFrom: [],
  summary: ["Charge for value"],
  actionPlan: [],
  quotes: [{ text: "Charge more", startMs: 4000 }],
  transcript: [
    { startMs: 0, endMs: 4000, text: "Hello and welcome" },
    { startMs: 4000, endMs: 9000, text: "Charge more than you think" },
  ],
  highlights: [],
} as unknown as NoteDetail

describe("the AI cards", () => {
  it("lists the transcript with times that play the video, and adds a quote to the note", async () => {
    const seek = vi.fn()
    const add = vi.fn()
    await draw(
      <AiCards
        detail={detail}
        playable
        busy={false}
        readOnly={false}
        playerRef={{ current: null }}
        onSeek={seek}
        onPlan={vi.fn()}
        onRetryMerge={vi.fn()}
        onHighlights={vi.fn()}
        onAddToNote={add}
      />
    )
    expect(host.textContent).toContain("Transcript")
    expect(host.textContent).toContain("Charge more than you think")
    await act(async () => button("Play from 0:04").click())
    expect(seek).toHaveBeenCalledWith(4000)
    const adds = [...host.querySelectorAll<HTMLButtonElement>('button[aria-label="Add to note"]')]
    expect(adds).toHaveLength(2)
    await act(async () => adds[1].click())
    expect(add).toHaveBeenCalledWith("Charge more", 4000)
  })

  it("has no Add to note in Trash, and no Transcript for an X post of words only", async () => {
    await draw(
      <AiCards
        detail={{ ...detail, source: "x", videoStatus: "none" } as NoteDetail}
        playable={false}
        busy={false}
        readOnly
        playerRef={{ current: null }}
        onSeek={vi.fn()}
        onPlan={vi.fn()}
        onRetryMerge={vi.fn()}
        onHighlights={vi.fn()}
        onAddToNote={vi.fn()}
      />
    )
    expect(host.querySelector('button[aria-label="Add to note"]')).toBeNull()
    expect(host.textContent).not.toContain("Transcript")
  })
})

describe("where a video starts", () => {
  function Player({ startSeconds }: { startSeconds: number | null }) {
    const ref = React.useRef<HTMLMediaElement | null>(null)
    const [, setReady] = React.useState(false)
    usePlayerPlace({ playerRef: ref, noteId: "n1", playbackUrl: ref.current ? "https://files.test/v.mp4" : null, startSeconds, seekTo: null })
    return (
      <video
        ref={(element) => {
          if (element && !ref.current) {
            ref.current = element
            setReady(true)
          }
        }}
      />
    )
  }

  it("starts where it was stopped at the speed last picked, and saves the place on pause", async () => {
    window.localStorage.setItem("note-library-playback-speed", "1.5")
    await draw(<Player startSeconds={150} />)
    const video = host.querySelector("video") as HTMLVideoElement
    Object.defineProperty(video, "duration", { configurable: true, value: 600 })
    await act(async () => video.dispatchEvent(new Event("loadedmetadata")))
    expect(video.currentTime).toBe(150)
    expect(video.playbackRate).toBe(1.5)
    video.currentTime = 212.7
    Object.defineProperty(video, "ended", { configurable: true, value: false })
    await act(async () => video.dispatchEvent(new Event("pause")))
    expect(saveNotePlayed).toHaveBeenCalledWith("n1", 212)
  })

  it("starts at the start when it was stopped near the end", async () => {
    await draw(<Player startSeconds={598} />)
    const video = host.querySelector("video") as HTMLVideoElement
    Object.defineProperty(video, "duration", { configurable: true, value: 600 })
    await act(async () => video.dispatchEvent(new Event("loadedmetadata")))
    expect(video.currentTime).toBe(0)
  })
})

describe("Plan steps and Quotes", () => {
  it("shows open steps, ticks one, and shows done steps only after Show done", async () => {
    const changed = actions()
    await draw(<PlanStepsPanel page={page} tabs={null} actions={changed} openId={undefined} onOpenedChanged={vi.fn()} />)
    expect(host.textContent).toContain("Raise the price")
    expect(host.textContent).not.toContain("Write the page")
    await act(async () => button("Show done").click())
    expect(host.textContent).toContain("Write the page")
    const box = host.querySelector<HTMLButtonElement>('[role="checkbox"][id="plan-step-n1-0"]')
    await act(async () => box?.click())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(saveNotePlan).toHaveBeenCalledWith("n1", [
      { text: "Raise the price", done: true },
      { text: "Write the page", done: true },
    ])
    expect(changed.refreshPage).toHaveBeenCalled()
  })

  it("lists every quote and opens one at its moment", async () => {
    const open = vi.fn()
    await draw(<QuotesPanel page={page} tabs={null} onOpen={open} />)
    expect(host.textContent).toContain("Charge more")
    expect(host.textContent).toContain("Patrick · Pricing talk · 0:04")
    await act(async () => button("“Charge more”Patrick · Pricing talk · 0:04").click())
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ noteId: "n1", startMs: 4000 }))
  })
})

describe("the left panel", () => {
  const libraries: LibraryRow[] = [
    page.library,
    { ...page.library, id: "l2", name: "Course notes", colour: "green", noteCount: 12 },
  ]

  it("draws the Libraries block on its own while the page is read, and picks another library", async () => {
    const pick = vi.fn()
    await draw(
      <LibraryLeftPanel
        libraries={libraries}
        libraryId="l1"
        page={page}
        leftPage={null}
        leftPageError={null}
        onRetryLeftPage={vi.fn()}
        onLeftPageChange={vi.fn()}
        search={{}}
        actions={actions()}
        onPickLibrary={pick}
        onLibrariesChanged={vi.fn(async () => undefined)}
        onLibraryMade={vi.fn()}
        onLibraryDeleted={vi.fn(async () => undefined)}
      />
    )
    expect(host.textContent).toContain("Content ideas")
    expect(host.textContent).toContain("Reading the page…")
    const picked = host.querySelector('[aria-current="true"]')
    expect(picked?.textContent).toContain("Content ideas")
    await act(async () => button("Course notes12").click())
    expect(pick).toHaveBeenCalledWith("l2")
    expect(button("Settings for Course notes")).toBeDefined()
  })

  it("says where the retry is when the page could not be read", async () => {
    const retry = vi.fn()
    await draw(
      <LibraryLeftPanel
        libraries={libraries}
        libraryId="l1"
        page={page}
        leftPage={null}
        leftPageError="That did not work."
        onRetryLeftPage={retry}
        onLeftPageChange={vi.fn()}
        search={{}}
        actions={actions()}
        onPickLibrary={vi.fn()}
        onLibrariesChanged={vi.fn(async () => undefined)}
        onLibraryMade={vi.fn()}
        onLibraryDeleted={vi.fn(async () => undefined)}
      />
    )
    expect(host.textContent).toContain("That did not work.")
    await act(async () => button("Try again").click())
    expect(retry).toHaveBeenCalled()
  })
})

describe("the address", () => {
  it("reads the tabs and Show, and nothing else", () => {
    expect(readLibrarySearch({ tab: "quotes" })).toMatchObject({ tab: "quotes" })
    expect(readLibrarySearch({ show: "trash" })).toMatchObject({ show: "trash" })
    expect(readLibrarySearch({ tab: "loose", show: "loose" })).toMatchObject({ tab: undefined, show: undefined })
    expect(scopeOf(readLibrarySearch({ tab: "pinned" }))).toBe("pinned")
    expect(scopeOf(readLibrarySearch({ tab: "steps", show: "archived" }))).toBe("steps")
    expect(scopeOf(readLibrarySearch({}))).toBe("all")
  })
})

describe("sorting the notes table", () => {
  const list = { notes: [] as NoteCard[], more: false }

  it("sorts High first on the first click of Priority, and the other way on the second", async () => {
    const changed = actions()
    await draw(
      <NotesListPanel
        page={page}
        list={list}
        loading={false}
        failed={false}
        onRetry={vi.fn()}
        search={{}}
        openId={undefined}
        actions={changed}
        onOpenedElsewhere={vi.fn()}
      />
    )
    await act(async () => button("Priority").click())
    expect(changed.setSearch).toHaveBeenLastCalledWith({ sort: "-priority" })

    await draw(
      <NotesListPanel
        page={page}
        list={list}
        loading={false}
        failed={false}
        onRetry={vi.fn()}
        search={{ sort: "-priority" }}
        openId={undefined}
        actions={changed}
        onOpenedElsewhere={vi.fn()}
      />
    )
    await act(async () => button("Priority").click())
    expect(changed.setSearch).toHaveBeenLastCalledWith({ sort: "priority" })
    // Back to newest edited first, which the address leaves out.
    await act(async () => button("Edited").click())
    expect(changed.setSearch).toHaveBeenLastCalledWith({ sort: undefined })
  })
})
