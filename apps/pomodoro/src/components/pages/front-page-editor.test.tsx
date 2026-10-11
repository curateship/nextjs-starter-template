// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useRouter: () => ({ invalidate: vi.fn() }),
}))
// The narrow layout, so the test drives Tabs rather than a resizable panel
// group measuring a window jsdom does not have. The panels themselves are the
// same components either way.
vi.mock("@/lib/layout/wide-screen", () => ({ useWideScreen: () => false }))
// The editor reports its Saving…/Saved into the sticky header, which lives on
// the shell this test does not mount.
vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ reportSaveStatus: vi.fn() }),
}))
vi.mock("@/lib/api/content/pages", () => ({
  savePageVisibility: vi.fn(),
  getPageVisibilityErrorMessage: () => "",
}))
// The editor writes one block at a time now. The fake hands back the page the
// server would, which is what the list draws.
const saved: FrontPageRow[][] = []
vi.mock("@/lib/api/content/page-blocks", () => ({
  getPageBlockSaveErrorMessage: () => "",
  savePageBlock: vi.fn(async ({ block }: { block: FrontPageRow }) => {
    saved.push([block])
    return [block]
  }),
  savePageBlockOrder: vi.fn(async () => []),
  removePageBlock: vi.fn(async () => []),
}))

import { FrontPageEditor } from "@/components/pages/front-page-editor"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createDefaultShellConfig, type ShellConfig } from "@/lib/custom-shell"
import type { FrontPageRow } from "@/lib/pages/front-page"
import type { PublicPageRow } from "@/lib/api/content/pages"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

/**
 * jsdom has no ResizeObserver, and the block panel's Spacing sliders measure
 * their own thumb. Same stub the segment dialog's test uses.
 */
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, { ResizeObserver: StubResizeObserver })

/**
 * jsdom has no `DataTransfer`, and the browser's own drag is what carries a
 * kind from the left panel into the list. Enough of one to hold the payload
 * and report which types it holds, which is all the list reads.
 */
class StubDataTransfer {
  private data = new Map<string, string>()
  dropEffect = "none"
  effectAllowed = "all"
  get types() {
    return [...this.data.keys()]
  }
  setData(type: string, value: string) {
    this.data.set(type, value)
  }
  getData(type: string) {
    return this.data.get(type) ?? ""
  }
}
Object.assign(globalThis, { DataTransfer: StubDataTransfer })

/** jsdom has no `DragEvent` either. A MouseEvent carrying the payload. */
class StubDragEvent extends MouseEvent {
  dataTransfer: StubDataTransfer
  constructor(
    type: string,
    init: MouseEventInit & { dataTransfer?: StubDataTransfer } = {}
  ) {
    super(type, init)
    this.dataTransfer = init.dataTransfer ?? new StubDataTransfer()
  }
}
Object.assign(globalThis, { DragEvent: StubDragEvent })

const page: PublicPageRow = {
  path: "/",
  name: "Home",
  summary: "The front page a visitor lands on.",
  canSwitchOff: false,
  layout: "marketing",
  source: "shell",
  blocks: true,
  visits: 0,
  blockCount: 0,
  visibility: "everyone",
  writtenPageId: null,
}

function named(tag: string, text: string) {
  const found = Array.from(document.querySelectorAll(tag)).find((candidate) =>
    candidate.textContent?.startsWith(text)
  )
  if (!found) throw new Error(`${text} was not drawn`)
  return found
}

/**
 * A click the way a browser sends one. The tab strip is a Radix Tabs group,
 * which moves on focus rather than on the click alone, so a bare click event
 * leaves the tab where it was.
 */
function click(element: Element) {
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
  if (element instanceof HTMLElement) element.focus()
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }))
}

/**
 * Waits out the auto-save's debounce and lets its request settle.
 *
 * Real timers rather than fake ones: the editor's debounce is a `setTimeout`
 * inside an effect and the save that follows it is a promise, so the test has
 * to let both the clock and the microtask queue run.
 */
async function settle() {
  await act(async () => {
    // The debounce is 1200ms; this is that plus a breath for the write.
    await new Promise((resolve) => setTimeout(resolve, 1320))
  })
}

/** Sets a field the way a browser does, so React's own value tracker sees it. */
async function type(selector: string, value: string) {
  const field = document.querySelector<HTMLInputElement>(selector)
  if (!field) throw new Error(`${selector} was not drawn`)
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set
    setter?.call(field, value)
    field.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

/** Renders the editor on an empty page and reports every block it writes. */
/** The plus on a kind card, which is what adds a block without a drag. */
function addKind(label: string) {
  const button = document.querySelector(
    `button[aria-label="Add a ${label.toLowerCase()} block"]`
  )
  if (!button) throw new Error(`${label} had no add button`)
  return button
}

async function open(config: ShellConfig = createDefaultShellConfig()) {
  saved.length = 0
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)

  await act(async () => {
    root.render(
      <TooltipProvider>
        <FrontPageEditor
          page={page}
          writtenPage={null}
          initialBlocks={[]}
          pageChoices={[]}
          config={config}
          onConfigChange={() => undefined}
        />
      </TooltipProvider>
    )
  })

  return { saved }
}

describe("FrontPageEditor", () => {
  // Each test renders into the same document, and a leftover panel would be
  // found by the next test's own field lookup.
  afterEach(() => {
    document.body.replaceChildren()
  })

  /**
   * Picking a kind is adding a block. It arrives named after its kind, which
   * is enough for the page to draw it, so it writes itself without anything
   * being typed first.
   */
  it("puts a block on the page as soon as its kind is picked", async () => {
    const { saved } = await open()

    await act(async () => click(named("button", "Add")))
    await act(async () => click(addKind("Plain text")))
    await settle()

    expect(saved).toHaveLength(1)
    expect(saved[0][0].heading).toBe("Plain text")
    expect(saved[0][0].kind).toBe("text")
  })

  it("saves a typed heading through the normaliser", async () => {
    const { saved } = await open()

    await act(async () => click(named("button", "Add")))
    await act(async () => click(addKind("Plain text")))
    await settle()

    await type("#front-page-row-heading", "  What we do  ")
    await settle()

    const rows = saved[saved.length - 1]
    expect(rows).toHaveLength(1)
    // Trimmed, because it was stored through `normalizeFrontPageRows` rather
    // than straight from the field.
    expect(rows[0].heading).toBe("What we do")
    expect(rows[0].kind).toBe("text")
    expect(rows[0].layout).toBe("wide")
    expect(rows[0].hidden).toBe(false)
  })

  /**
   * The one auto-save had to get right. A second keystroke before the first
   * answer lands must update the block it is already making, not make a
   * second one, which is why the id is handed out when the block is picked.
   */
  // Three waits of 1.3s each, so it needs more than the default five seconds.
  it("keeps one block when it saves itself twice", { timeout: 15_000 }, async () => {
    const { saved } = await open()

    await act(async () => click(named("button", "Add")))
    await act(async () => click(addKind("Plain text")))
    await settle()

    await type("#front-page-row-heading", "What we do")
    await settle()
    await type("#front-page-row-heading", "What we do here")
    await settle()

    expect(saved.length).toBeGreaterThan(1)
    const ids = new Set(saved.map((rows) => rows[0].id))
    expect(ids.size).toBe(1)
    expect(saved[saved.length - 1][0].heading).toBe("What we do here")
  })

  /**
   * An FAQ with no questions in it yet goes on the page like any other block,
   * and fills up afterwards. It used to be dropped by the store while it was
   * empty, which meant it could never be written and sat in the list marked
   * "Not added yet" with nothing anybody could do about it.
   */
  it("adds a list block before it has any entries", async () => {
    const { saved } = await open()

    await act(async () => click(named("button", "Add")))
    await act(async () => click(addKind("FAQ")))
    await settle()

    expect(saved).toHaveLength(1)
    expect(saved[0][0].kind).toBe("faq")
    expect(saved[0][0].heading).toBe("FAQ")

    await act(async () => click(named("button", "Blocks")))
    expect(document.body.textContent).not.toContain("Not added yet")
  })

  /**
   * The two drags are two different mechanisms on purpose, and this is the one
   * that proves they do not tread on each other. Reordering is dnd-kit's, and
   * it stopped working the day a kind card was made a dnd-kit draggable in the
   * same context: the whole list became one drop target, so a row being
   * dragged had no row to land on. The palette uses the browser's own drag
   * now, the way the automation palette does.
   */
  it("keeps the two drags apart: rows sort, cards carry a kind", async () => {
    await open()

    await act(async () => click(named("button", "Add")))
    await act(async () => click(addKind("Plain text")))
    await settle()
    await act(async () => click(named("button", "Blocks")))

    // The row's handle is dnd-kit's, and it is not a native draggable.
    const handle = document.querySelector('[aria-label^="Reorder"]')
    if (!handle) throw new Error("the reorder handle was not drawn")
    expect(handle.closest("li")?.getAttribute("draggable")).toBeNull()

    // The kind card is the browser's own drag, and is not a button at all:
    // clicking it does nothing, and the plus beside it is what adds.
    await act(async () => click(named("button", "Add")))
    const card = [...document.querySelectorAll("[draggable='true']")].find(
      (element) => element.textContent?.startsWith("Plain text")
    )
    if (!card) throw new Error("the kind card is not draggable")
    expect(card.tagName).toBe("DIV")
  })

  /**
   * The list makes way for what is being carried: a space the shape of a block
   * opens where it would land, named after the kind in hand. The name cannot
   * ride on the drag — a browser hands `dataTransfer.getData` back empty until
   * the drop — so it travels through the editor instead, and this is what
   * proves that wiring still joins up.
   */
  it("opens a space where the carried block would land, named after it", async () => {
    await open()

    // The kinds live on their own tab in the narrow layout this test renders.
    await act(async () => click(named("button", "Add")))
    await act(async () => click(addKind("Plain text")))
    await settle()
    // Picked up on the Add tab, because this narrow layout shows one panel at
    // a time. What is being carried is held by the editor, so it survives the
    // move to the Blocks tab, which is the whole point of passing it up.
    await act(async () => click(named("button", "Add")))
    await act(async () => {
      const card = [...document.querySelectorAll("[draggable='true']")].find(
        (element) => element.textContent?.startsWith("Divider")
      )
      if (!card) throw new Error("the Divider card was not drawn")
      card.dispatchEvent(
        new DragEvent("dragstart", {
          bubbles: true,
          dataTransfer: new DataTransfer(),
        })
      )
    })

    await act(async () => click(named("button", "Blocks")))

    const row = [...document.querySelectorAll("li")].find((li) =>
      li.querySelector('[aria-label^="Reorder"]')
    )
    if (!row) throw new Error("no block row to drag over")

    await act(async () => {
      const data = new DataTransfer()
      data.setData("application/x-custom-shell-block-kind", "divider")
      row.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
        })
      )
    })

    const gap = document.querySelector("li[aria-hidden]")
    expect(gap?.textContent).toBe("Divider lands here")
  })

  /**
   * A drop carries whatever the thing being dragged put on it, and a drag can
   * come from another page entirely. One claiming this app's own type with a
   * kind that does not exist used to make a draft with no heading, and the
   * panel came apart on the first read of it.
   */
  it("ignores a drop carrying a kind that does not exist", async () => {
    const { saved } = await open()

    await act(async () => {
      const handle = document.querySelector('[aria-label^="Reorder"]')
      const panel = handle?.closest("ul")?.parentElement ?? document.body
      const data = new DataTransfer()
      data.setData("application/x-custom-shell-block-kind", "../../etc/passwd")
      panel.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
        })
      )
    })
    await settle()

    expect(saved).toHaveLength(0)
    // Still standing, which is the point.
    expect(document.body.textContent).toContain("Front page")
  })

  it("has no Save or Cancel left in the panel, and closes from the header", async () => {
    await open()

    await act(async () => click(named("button", "Add")))
    await act(async () => click(addKind("Plain text")))
    await type("#front-page-row-heading", "What we do")
    await settle()

    const names = Array.from(document.querySelectorAll("button")).map((b) =>
      b.textContent?.trim()
    )
    expect(names).not.toContain("Save changes")
    expect(names).not.toContain("Add block")
    expect(names).not.toContain("Cancel")

    const close = document.querySelector(
      'button[aria-label="Close the block\'s settings"]'
    )
    if (!close) throw new Error("the way out of the panel was not drawn")
    await act(async () => click(close))
    // Back to the page's own settings, which is what the panel holds with no
    // block open.
    expect(document.body.textContent).toContain("Space between blocks")
  })
})
