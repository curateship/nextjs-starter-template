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
  pinLibraryFolder: vi.fn(async () => undefined),
  pinLibraryScope: vi.fn(async () => undefined),
  pinLibraryRow: vi.fn(),
  makeFolder: vi.fn(),
  renameLibraryFolder: vi.fn(),
  deleteLibraryFolder: vi.fn(),
  saveView: vi.fn(),
  deleteSavedView: vi.fn(),
  saveLibrary: vi.fn(),
  deleteLibraryTemplate: vi.fn(),
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
  renameLibraryAuthor: vi.fn(),
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
import { pinLibraryFolder, pinLibraryScope } from "@/lib/api/note/library"
import { saveNotePlayed } from "@/lib/api/note/notes"
import { saveNotePlan } from "@/lib/api/note/imports"
import type { LibraryPage, NoteCard, NoteDetail } from "@/lib/note/library/notes"

/**
 * The library screens Tyler's task 02 added, drawn in a browser-like page:
 * the Transcript card and Add to note, where a video starts again, the Plan
 * steps and Quotes lists, the Pinned and LIBRARY cards, and the sortable
 * notes table.
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
    description: "",
    colour: "blue",
    avatarUrl: null,
    bannerUrl: null,
    pinned: false,
    noteCount: 3,
    editedAt: "2026-10-20T10:00:00.000Z",
  },
  folders: [
    { id: "f1", name: "Hooks", source: null, position: 0, noteCount: 2, pinnedAt: "2026-10-20T10:00:00.000Z" },
    { id: "f2", name: "Pricing", source: null, position: 1, noteCount: 1, pinnedAt: null },
  ],
  counts: { all: 3, loose: 0, archived: 0, trash: 0, openSteps: 1, quotes: 2 },
  authors: [{ key: "patrick", name: "Patrick", pictureUrl: null, count: 1 }],
  tags: [{ tag: "hooks", count: 2 }],
  recent: [],
  views: [],
  templates: [],
  otherLibraries: [],
  pinnedRows: [{ row: "trash", pinnedAt: "2026-10-20T09:00:00.000Z" }],
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
    await draw(<PlanStepsPanel page={page} actions={changed} openId={undefined} onOpenedChanged={vi.fn()} />)
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
    await draw(<QuotesPanel page={page} onOpen={open} />)
    expect(host.textContent).toContain("Charge more")
    expect(host.textContent).toContain("Patrick · Pricing talk · 0:04")
    await act(async () => button("“Charge more”Patrick · Pricing talk · 0:04").click())
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ noteId: "n1", startMs: 4000 }))
  })
})

describe("the left panel", () => {
  it("lists pinned folders in Pinned, pins another from its row, and opens Plan steps", async () => {
    const changed = actions()
    await draw(<LibraryLeftPanel page={page} search={{}} actions={changed} />)
    const pinned = host.textContent ?? ""
    expect(pinned.indexOf("Pinned")).toBeLessThan(pinned.indexOf("Library"))
    expect(button("Unpin Hooks")).toBeDefined()
    await act(async () => button("Pin Pricing").click())
    expect(pinLibraryFolder).toHaveBeenCalledWith("f2", true)
    await act(async () => button("Plan steps").click())
    expect(changed.setSearch).toHaveBeenCalledWith({ folder: "steps", author: undefined })
  })

  it("pins a LIBRARY row, and lists pinned rows and folders together in the order pinned", async () => {
    await draw(<LibraryLeftPanel page={page} search={{}} actions={actions()} />)
    const pinnedCard = host.textContent ?? ""
    // Trash was pinned before Hooks, so it comes first.
    expect(pinnedCard.indexOf("Trash")).toBeLessThan(pinnedCard.indexOf("Hooks"))
    await act(async () => button("Pin All notes").click())
    expect(pinLibraryScope).toHaveBeenCalledWith("l1", "all", true)
    const unpins = [...host.querySelectorAll<HTMLButtonElement>('button[aria-label="Unpin Trash"]')]
    expect(unpins).toHaveLength(2)
    await act(async () => unpins[0].click())
    expect(pinLibraryScope).toHaveBeenCalledWith("l1", "trash", false)
  })

  it("draws LIBRARY as the same folding card as Authors, from its heading", async () => {
    await draw(<LibraryLeftPanel page={page} search={{}} actions={actions()} />)
    const heading = button("Library")
    const authors = button("Authors · 1")
    expect(heading.closest("h2")?.className).toBe(authors.closest("h2")?.className)
    expect(host.textContent).toContain("Loose notes")
    await act(async () => heading.click())
    expect(host.textContent).not.toContain("Loose notes")
    expect(window.localStorage.length).toBeGreaterThan(0)
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
