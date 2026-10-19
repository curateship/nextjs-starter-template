// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/note/notes", () => ({ findNoteTitles: vi.fn(async () => []) }))

import { BUILT_IN_VIEW, NotesListPanel, type ListPanelActions } from "@/components/note-notes/notes-list-panel"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useSelection } from "@/lib/hooks/use-selection"
import type { NoteCard, NoteFolder } from "@/lib/note/notes/notes"
import { EMPTY_VIEW_SETTINGS } from "@/lib/note/notes/views"

/**
 * The middle panel drawn with a Books folder: the list puts pinned
 * notes first, the table adds up a number column, the board lays the notes
 * out by Status, a change to the layout offers Save as new view, and ticking
 * notes brings up the bar for changing many at once.
 */


const FOLDER: NoteFolder = {
  id: "books",
  parentId: null,
  name: "Books",
  icon: null,
  position: 0,
  noteCount: 3,
  fields: [
    { id: "f1", key: "author", name: "Author", type: "text", options: [], remind: false, position: 0 },
    { id: "f2", key: "rating", name: "Rating", type: "number", options: [], remind: false, position: 1 },
    {
      id: "f3",
      key: "status",
      name: "Status",
      type: "select",
      options: [
        { id: "to-read", label: "To read", colour: "grey" },
        { id: "reading", label: "Reading", colour: "blue" },
        { id: "done", label: "Done", colour: "green" },
      ],
      remind: false,
      position: 2,
    },
  ],
  views: [
    { id: "board", folderId: "books", name: "Board", kind: "board", position: 0, ...EMPTY_VIEW_SETTINGS, groupBy: "status" },
    {
      id: "ratings",
      folderId: "books",
      name: "Ratings",
      kind: "table",
      position: 1,
      ...EMPTY_VIEW_SETTINGS,
      sort: { key: "rating", dir: "desc" },
      totals: { rating: "average" },
    },
  ],
  templates: [],
}

function note(id: string, title: string, values: NoteCard["values"], extra: Partial<NoteCard> = {}): NoteCard {
  return {
    id,
    folderId: "books",
    title,
    icon: null,
    firstLine: "",
    values,
    checklist: { done: 0, total: 0 },
    pinned: false,
    archived: false,
    deletedAt: null,
    trashedWithFolderId: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
    lastOpenedAt: null,
    folderName: "Books",
    ...extra,
  }
}

const NOTES: NoteCard[] = [
  note("n1", "The Dispossessed", { author: "Le Guin", rating: 5, status: "done" }, {
    pinned: true,
    checklist: { done: 3, total: 3 },
    updatedAt: "2026-10-12T09:00:00.000Z",
  }),
  note("n2", "Thinking in Systems", { author: "Meadows", rating: 4, status: "reading" }, {
    updatedAt: "2026-10-15T09:00:00.000Z",
  }),
  note("n3", "Piranesi", { author: "Clarke", status: "to-read" }, { updatedAt: "2026-10-16T09:00:00.000Z" }),
]

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.innerHTML = ""
})

function actions(overrides: Partial<ListPanelActions> = {}): ListPanelActions {
  const nothing = () => undefined
  return {
    onPick: nothing,
    onNewNote: nothing,
    onRestoreFolder: nothing,
    onEmptyTrash: nothing,
    onRestoreNote: nothing,
    onDeleteNote: nothing,
    onMove: nothing,
    onPin: nothing,
    onArchive: nothing,
    onTrash: nothing,
    onSetField: async () => true,
    onBoardMove: async () => true,
    onFields: nothing,
    onViewId: nothing,
    onSaveView: async () => true,
    onSaveViewAs: async () => true,
    onRenameView: async () => true,
    onMoveView: nothing,
    onDeleteView: nothing,
    ...overrides,
  }
}

function Panel({ viewId = BUILT_IN_VIEW, extra }: { viewId?: string; extra?: Partial<ListPanelActions> }) {
  const selection = useSelection()
  return (
    <TooltipProvider>
      <NotesListPanel
        title="Books"
        scope={FOLDER.id}
        folder={FOLDER}
        list={{ notes: NOTES, more: false, trashedFolders: [] }}
        loading={false}
        failure={null}
        onRetry={() => undefined}
        query=""
        onQuery={() => undefined}
        pickedId={null}
        viewId={viewId}
        selection={selection}
        creating={false}
        bulkBusy={false}
        actions={actions(extra)}
      />
    </TooltipProvider>
  )
}

async function draw(element: React.ReactElement) {
  await act(async () => root.render(element))
}

function button(label: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!found) throw new Error(`No button called ${label}`)
  return found
}

describe("NotesListPanel", () => {
  it("lists the notes with the pinned one first, each showing its checklist", async () => {
    const picked: string[] = []
    await draw(<Panel extra={{ onPick: (note) => picked.push(note.title) }} />)
    const cards = [...host.querySelectorAll('ul[aria-label="Notes"] > li')]
    expect(cards.map((card) => card.querySelector("button .font-medium")?.textContent)).toEqual([
      "The Dispossessed",
      "Piranesi",
      "Thinking in Systems",
    ])
    expect(cards[0].textContent).toContain("3 of 3 done")
    await act(async () => cards[1].querySelector<HTMLButtonElement>(":scope > button")?.click())
    expect(picked).toEqual(["Piranesi"])
  })

  it("shows the board by Status, one column per option plus No value", async () => {
    await draw(<Panel viewId="board" />)
    const columns = [...host.querySelectorAll("section[aria-label]")]
    expect(columns.map((column) => column.getAttribute("aria-label"))).toEqual(["To read", "Reading", "Done", "No value"])
    expect(columns.map((column) => column.querySelectorAll("li").length)).toEqual([1, 1, 1, 0])
  })

  it("adds up a number column in the table", async () => {
    await draw(<Panel viewId="ratings" />)
    expect(host.querySelector("table")?.textContent).toContain("Average 4.5")
    const rows = [...host.querySelectorAll("tbody tr")].map((row) => row.textContent)
    // Pinned first, then highest rating first, a note with no rating last.
    expect(rows[0]).toContain("The Dispossessed")
    expect(rows[1]).toContain("Thinking in Systems")
    expect(rows[2]).toContain("Piranesi")
  })

  it("offers Save as new view once the layout changes", async () => {
    await draw(<Panel />)
    expect(host.textContent).toContain("New view")
    await act(async () => button("Show as board").click())
    expect(host.textContent).toContain("Save as new view")
    expect(host.querySelectorAll("section[aria-label]").length).toBe(4)
  })

  it("brings up the bar for many notes once one is ticked", async () => {
    const moved: string[][] = []
    await draw(<Panel extra={{ onMove: (ids) => moved.push(ids) }} />)
    expect(host.querySelector('[role="toolbar"][aria-label="Picked notes"]')).toBeNull()
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Pick Piranesi"]')?.click())
    const bar = host.querySelector('[role="toolbar"][aria-label="Picked notes"]')
    expect(bar?.textContent).toContain("1 note picked")
    const move = [...(bar?.querySelectorAll("button") ?? [])].find((each) => each.textContent?.includes("Move to folder"))
    await act(async () => move?.click())
    expect(moved).toEqual([["n3"]])
  })
})
