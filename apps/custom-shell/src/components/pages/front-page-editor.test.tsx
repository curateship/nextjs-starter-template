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
vi.mock("@/lib/api/content/pages", () => ({
  savePageVisibility: vi.fn(),
  getPageVisibilityErrorMessage: () => "",
}))

import { FrontPageEditor } from "@/components/pages/front-page-editor"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createDefaultShellConfig, type ShellConfig } from "@/lib/custom-shell"
import type { PublicPageRow } from "@/lib/api/content/pages"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const page: PublicPageRow = {
  path: "/",
  name: "Home",
  summary: "The front page a visitor lands on.",
  canSwitchOff: false,
  layout: "marketing",
  source: "shell",
  visits: 0,
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

/** Renders the editor and reports every config it tries to save. */
async function open(config: ShellConfig = createDefaultShellConfig()) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)
  const saved: ShellConfig[] = []

  await act(async () => {
    root.render(
      <TooltipProvider>
        <FrontPageEditor
          page={page}
          config={config}
          onConfigChange={(next) => saved.push(next)}
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

  it("holds a new block back until it has enough to draw", async () => {
    const { saved } = await open()

    // Add → Plain text, which opens the inspector on a block that is not on
    // the page yet.
    await act(async () => click(named("button", "Add")))
    await act(async () => click(named("button", "Plain text")))

    // A block with no heading is refused, and nothing is written.
    await act(async () => click(named("button", "Add block")))
    expect(saved).toHaveLength(0)

    // The list says where the block will land rather than pretending it is
    // already there.
    await act(async () => click(named("button", "Blocks")))
    expect(document.body.textContent).toContain("Not added yet")
  })

  it("writes the block once it has a heading, through the normaliser", async () => {
    const { saved } = await open()

    await act(async () => click(named("button", "Add")))
    await act(async () => click(named("button", "Plain text")))

    await type("#front-page-row-heading", "  What we do  ")
    await act(async () => click(named("button", "Add block")))

    expect(saved).toHaveLength(1)
    const rows = saved[0].frontPageRows
    expect(rows).toHaveLength(1)
    // Trimmed, because it was stored through `normalizeFrontPageRows` rather
    // than straight from the field.
    expect(rows[0].heading).toBe("What we do")
    expect(rows[0].kind).toBe("text")
    expect(rows[0].layout).toBe("wide")
    expect(rows[0].hidden).toBe(false)
  })

  it("refuses an FAQ block with no entries in it", async () => {
    const { saved } = await open()

    await act(async () => click(named("button", "Add")))
    await act(async () => click(named("button", "FAQ")))

    await type("#front-page-row-heading", "Questions")

    // `normalizeFrontPageRows` drops an FAQ with no entries, so a block that
    // saved here would delete itself. The gate is what stops that.
    await act(async () => click(named("button", "Add block")))
    expect(saved).toHaveLength(0)
  })
})
