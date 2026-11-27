// @vitest-environment jsdom

import { FilmIcon } from "lucide-react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { PiecesPanel, type PieceItem, type PiecesAdapter } from "@/components/video-assets/pieces-panel"

vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: vi.fn(),
  dismissErrorToast: vi.fn(),
}))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

const pieces: PieceItem[] = [
  { id: "a", name: "First cut", status: "draft", pinned: false, archived: false },
  { id: "b", name: "Second cut", status: "ready", pinned: false, archived: false },
]

function adapter(projectId: string, list: PiecesAdapter<PieceItem>["list"]): PiecesAdapter<PieceItem> {
  const nothing = async () => ({ done_ids: [], skipped_ids: [] })
  return {
    one: "video",
    many: "videos",
    title: "Videos",
    icon: <FilmIcon className="size-4" />,
    projectId,
    openId: "a",
    openName: "First cut",
    canChange: true,
    list,
    open: async () => undefined,
    reopenProject: () => undefined,
    rename: async () => undefined,
    duplicate: async () => undefined,
    setStatus: async () => undefined,
    pin: async () => undefined,
    archive: nothing,
    otherProjects: async () => [],
    move: nothing,
    moveNote: "",
    deleteSummary: async () => ({ count: 0, exports: 0 }),
    remove: async () => ({ deleted_ids: [] }),
    describeDelete: () => "",
    errorMessage: String,
    row: (item) => ({ thumbnail: null, lines: [item.name, ""], Icon: FilmIcon }),
  }
}

async function mount(panel: PiecesAdapter<PieceItem>) {
  act(() => root?.unmount())
  host?.remove()
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <TooltipProvider>
        <PiecesPanel adapter={panel} />
      </TooltipProvider>
    )
  })
}

const rowNames = () =>
  [...document.querySelectorAll("li")].map((row) => row.textContent ?? "").filter((text) => text.includes("cut"))
const loaded = async () => ({ items: pieces, total: 2, page: 1, total_pages: 1 })
const never = () => new Promise<never>(() => undefined)

describe("the Videos and Carousels tab", () => {
  it("shows no loading circle while its first list is on the way", async () => {
    await mount(adapter("project-new", never))

    expect(document.querySelector(".animate-spin")).toBeNull()
    expect(document.querySelector("[role=status]")).toBeNull()
    expect(rowNames()).toEqual([])
  })

  it("draws its last list at once when the editor is drawn again for another piece", async () => {
    await mount(adapter("project-1", loaded))
    expect(rowNames()).toHaveLength(2)

    // Opening another video draws the editor afresh; its list read is slow.
    const again = vi.fn(never)
    await mount(adapter("project-1", again))

    expect(rowNames()).toHaveLength(2)
    expect(rowNames()[0]).toContain("First cut")
    // It still reads the list again, so a change made elsewhere shows up.
    expect(again).toHaveBeenCalledTimes(1)
  })

  it("never shows one project's list in another project", async () => {
    await mount(adapter("project-2", loaded))
    await mount(adapter("project-3", never))

    expect(rowNames()).toEqual([])
  })
})
