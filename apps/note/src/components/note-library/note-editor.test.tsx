// @vitest-environment jsdom

import { act, createRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { Editor } from "@tiptap/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/note/notes", () => ({
  findNoteTitles: vi.fn(async () => [{ id: "n2", title: "Reading list", folderName: "Books" }]),
}))
vi.mock("@/lib/api/media/media", () => ({
  uploadMedia: vi.fn(),
  getMediaErrorMessage: () => "Upload failed",
}))

import { NoteEditor, type NoteEditorHandle } from "@/components/note-library/note-editor"
import { TooltipProvider } from "@/components/ui/tooltip"

/**
 * The note editor drawn in a browser-like page: every block a note can hold
 * shows, a link to another note shows that note's title as it is now, and
 * the "/" menu opens and narrows as you type.
 */

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  // jsdom lays nothing out, so the editor's scroll to the cursor gets empty boxes.
  const empty = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  Range.prototype.getClientRects ??= empty
  Range.prototype.getBoundingClientRect ??= () => new DOMRect()
  Element.prototype.getClientRects ??= empty
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.innerHTML = ""
})

const p = (...content: object[]) => ({ type: "paragraph", content })
const text = (value: string) => ({ type: "text", text: value })

async function draw(element: React.ReactElement) {
  await act(async () => {
    root.render(<TooltipProvider>{element}</TooltipProvider>)
  })
  // useEditor builds the editor a beat after the first draw.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
}

function editorOf(): Editor {
  const dom = host.querySelector(".tiptap") as (HTMLElement & { editor?: Editor }) | null
  if (!dom?.editor) throw new Error("No editor on the page")
  return dom.editor
}

const body = {
  type: "doc",
  content: [
    {
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: true }, content: [p(text("Chapter one"))] },
        { type: "taskItem", attrs: { checked: false }, content: [p(text("Chapter two"))] },
      ],
    },
    { type: "callout", attrs: { tone: "yellow" }, content: [p(text("Careful here"))] },
    {
      type: "details",
      attrs: { open: false },
      content: [
        { type: "detailsSummary", content: [text("More")] },
        { type: "detailsContent", content: [p(text("Folded away"))] },
      ],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [p(text("Book"))] },
            { type: "tableHeader", content: [p(text("Pages"))] },
          ],
        },
      ],
    },
    p(
      text("See "),
      { type: "noteLink", attrs: { id: "n2", label: "Old title" } },
      text(" and "),
      { type: "noteLink", attrs: { id: "n3", label: "Binned" } },
      text(" and "),
      { type: "noteLink", attrs: { id: "n4", label: "Gone for good" } }
    ),
  ],
}

const titles = {
  n2: { title: "Reading list 2026", state: "ok" as const },
  n3: { title: "Binned note", state: "trash" as const },
  n4: { title: "", state: "gone" as const },
}

describe("NoteEditor", () => {
  it("draws checklists, callouts, toggles and tables", async () => {
    await draw(<NoteEditor libraryId="l1" noteId="n1" editable initial={body} linkTitles={titles} />)
    expect(host.querySelector('ul[data-type="taskList"] li[data-checked="true"]')?.textContent).toContain("Chapter one")
    expect(host.querySelector("[data-callout]")?.textContent).toContain("Careful here")
    expect(host.querySelector('[data-type="details"]')?.textContent).toContain("More")
    expect(host.querySelector("table th")?.textContent).toBe("Book")
  })

  it("shows a linked note's title as it is now, struck through in Trash, and a gone one as Deleted note", async () => {
    const opened: string[] = []
    await draw(
      <NoteEditor libraryId="l1" noteId="n1" editable initial={body} linkTitles={titles} onOpenNote={(id) => opened.push(id)} />
    )
    const links = [...host.querySelectorAll<HTMLButtonElement>("button[data-note-link]")]
    expect(links.map((link) => link.textContent)).toEqual(["Reading list 2026", "Binned note", "Deleted note"])
    expect(links[1].className).toContain("line-through")
    expect(links[2].disabled).toBe(true)
    await act(async () => links[0].click())
    expect(opened).toEqual(["n2"])
  })

  it("has the block toolbar only while it can be edited", async () => {
    await draw(<NoteEditor libraryId="l1" noteId="n1" editable={false} initial={body} linkTitles={titles} />)
    expect(host.querySelector('[role="toolbar"][aria-label="Blocks"]')).toBeNull()
    await draw(<NoteEditor libraryId="l1" noteId="n1" editable initial={body} linkTitles={titles} />)
    expect(host.querySelector('[role="toolbar"][aria-label="Blocks"] [aria-label="Checklist"]')).not.toBeNull()
  })

  it("opens the / menu and narrows it as you type", async () => {
    await draw(<NoteEditor libraryId="l1" noteId="n1" editable initial={{ type: "doc", content: [p()] }} linkTitles={{}} />)
    const editor = editorOf()
    await act(async () => {
      editor.chain().focus().insertContent("/").run()
    })
    const menu = () => document.body.querySelector('[role="listbox"][aria-label="Blocks"]')
    expect(menu()).not.toBeNull()
    expect(menu()?.querySelectorAll('[role="option"]').length).toBe(15)
    await act(async () => {
      editor.chain().focus().insertContent("check").run()
    })
    expect([...(menu()?.querySelectorAll('[role="option"]') ?? [])].map((option) => option.textContent)).toEqual([
      "Checklist",
    ])
  })

  it("turns a picked / item into its block", async () => {
    const changes: unknown[] = []
    await draw(
      <NoteEditor
        libraryId="l1"
        noteId="n1"
        editable
        initial={{ type: "doc", content: [p()] }}
        linkTitles={{}}
        onChange={(next) => changes.push(next)}
      />
    )
    const editor = editorOf()
    await act(async () => {
      editor.chain().focus().insertContent("/checkl").run()
    })
    const option = document.body.querySelector<HTMLButtonElement>('[role="listbox"] [role="option"]')
    await act(async () => option?.click())
    expect(editor.getJSON().content?.[0]?.type).toBe("taskList")
    expect(JSON.stringify(editor.getJSON())).not.toContain("/checkl")
    expect(changes.length).toBeGreaterThan(0)
  })

  it("offers your notes after [[ and puts in a link to the one picked", async () => {
    await draw(<NoteEditor libraryId="l1" noteId="n1" editable initial={{ type: "doc", content: [p()] }} linkTitles={{}} />)
    const editor = editorOf()
    await act(async () => {
      editor.chain().focus().insertContent("[[read").run()
    })
    // The search waits 150ms after the last key, then asks the server.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250))
    })
    const option = document.body.querySelector<HTMLButtonElement>('[role="listbox"][aria-label="Notes"] [role="option"]')
    expect(option?.textContent).toContain("Reading list")
    await act(async () => option?.click())
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"noteLink","attrs":{"id":"n2","label":"Reading list"}')
  })

  it("draws a video time as a chip that plays from there, and only shows it with no video", async () => {
    const played: number[] = []
    const withTime = { type: "doc", content: [p({ type: "videoTime", attrs: { ms: 252_000 } }, text(" the pricing trick"))] }
    await draw(
      <NoteEditor libraryId="l1" noteId="n1" editable initial={withTime} linkTitles={{}} onSeek={(ms) => played.push(ms)} />
    )
    const chip = host.querySelector<HTMLButtonElement>('button[aria-label="Play from 4:12"]')
    expect(chip?.textContent).toBe("4:12")
    await act(async () => chip?.click())
    expect(played).toEqual([252_000])

    await draw(<NoteEditor libraryId="l1" noteId="n1" editable initial={withTime} linkTitles={{}} />)
    expect(host.querySelector('button[aria-label="Play from 4:12"]')).toBeNull()
    expect(host.textContent).toContain("4:12 the pricing trick")
  })

  it("puts a time on a new line at the end, and a quote with its time after it", async () => {
    const handle = createRef<NoteEditorHandle>()
    await draw(
      <NoteEditor ref={handle} libraryId="l1" noteId="n1" editable initial={{ type: "doc", content: [p(text("Mine"))] }} linkTitles={{}} />
    )
    await act(async () => handle.current?.insertTime(65_000))
    await act(async () => handle.current?.insertQuote("they have really long trunks", 4000))
    const content = editorOf().getJSON().content ?? []
    expect(content[1]).toEqual({ type: "paragraph", content: [{ type: "videoTime", attrs: { ms: 65_000 } }, text(" ")] })
    expect(content[2]).toEqual({
      type: "blockquote",
      content: [{ type: "paragraph", content: [text("they have really long trunks "), { type: "videoTime", attrs: { ms: 4000 } }] }],
    })
  })

  it("offers Video time in the / menu only while a video can play", async () => {
    await draw(
      <NoteEditor
        libraryId="l1"
        noteId="n1"
        editable
        initial={{ type: "doc", content: [p()] }}
        linkTitles={{}}
        videoTimeNow={() => 90_000}
      />
    )
    const editor = editorOf()
    await act(async () => {
      editor.chain().focus().insertContent("/video").run()
    })
    const option = document.body.querySelector<HTMLButtonElement>('[role="listbox"][aria-label="Blocks"] [role="option"]')
    expect(option?.textContent).toContain("Video time")
    expect(option?.textContent).toContain("1:30")
    await act(async () => option?.click())
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"videoTime","attrs":{"ms":90000}')

    await draw(<NoteEditor libraryId="l1" noteId="n1" editable initial={{ type: "doc", content: [p()] }} linkTitles={{}} />)
    await act(async () => {
      editorOf().chain().focus().insertContent("/video").run()
    })
    expect(document.body.querySelector('[role="listbox"][aria-label="Blocks"] [role="option"]')).toBeNull()
  })
})
