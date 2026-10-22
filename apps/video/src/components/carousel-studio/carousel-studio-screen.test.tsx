// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  saved: [] as unknown[],
  exported: 0,
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...(props as Record<string, unknown>)}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}))
vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ reportSaveStatus: () => undefined }),
  useOptionalShellRuntime: () => null,
}))
vi.mock("@/lib/api/video/carousels", () => ({
  getCarouselErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Carousel request failed.",
  saveCarousel: vi.fn(async (_id: string, value: unknown) => {
    api.saved.push(value)
    return { version: api.saved.length + 1 }
  }),
  exportCarousel: vi.fn(async () => {
    api.exported += 1
    return { id: "export-1", title: "Tips" }
  }),
  duplicateCarousel: vi.fn(),
  polishCarouselText: vi.fn(),
  makeVideoFromCarousel: vi.fn(),
  suggestFirstSlide: vi.fn(async () => ["One", "Two", "Three"]),
  writeCaption: vi.fn(async () => "A caption"),
  listCollectionPictures: vi.fn(async () => []),
  searchStockPhotos: vi.fn(async () => []),
  keepStockPhoto: vi.fn(),
  listCarouselVersions: vi.fn(async () => []),
  restoreCarouselVersion: vi.fn(),
  translateCarouselCopies: vi.fn(),
}))
vi.mock("@/lib/api/media/media", () => ({
  getMediaErrorMessage: () => "Media request failed.",
  uploadMedia: vi.fn(),
}))
vi.mock("@/lib/api/video/media", () => ({
  attachEditorMedia: vi.fn(async () => undefined),
  listVideoMedia: vi.fn(async () => ({ media: [] })),
  listMediaCollections: vi.fn(async () => []),
}))
vi.mock("@/lib/api/video/music", () => ({
  loadMusicShelf: vi.fn(async () => []),
}))
vi.mock("@/lib/api/video/stickers", () => ({
  STICKER_PICKER_PAGE_SIZE: 60,
  getStickerErrorMessage: () => "Stickers request failed.",
  loadStickers: vi.fn(async () => [{ kind: "emoji", emoji: "🔥" }]),
  addSticker: vi.fn(),
  removeSticker: vi.fn(),
  listStickerPictures: vi.fn(async () => ({ media: [], total: 0 })),
}))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: vi.fn(),
  dismissErrorToast: vi.fn(),
  useErrorToast: vi.fn(),
}))

import { CarouselBuilderPage } from "@/components/carousel-studio/carousel-studio"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { CarouselDetail } from "@/lib/api/video/carousels"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

beforeAll(() => {
  // jsdom draws nothing, so the canvas's size watcher and Radix's pointer
  // calls have nothing to answer with.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  Element.prototype.scrollIntoView = () => undefined
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => undefined
  Element.prototype.releasePointerCapture = () => undefined
  window.matchMedia ??= (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
})

let root: Root | null = null
let host: HTMLDivElement | null = null

let consoleErrors: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  api.saved = []
  api.exported = 0
  consoleErrors = vi.spyOn(console, "error")
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  // Nothing React or the editor complained about while it was used.
  expect(consoleErrors.mock.calls).toEqual([])
  consoleErrors.mockRestore()
})

function text(id: string, words: string, y: number) {
  return {
    id,
    type: "text" as const,
    text: words,
    x: 0.1,
    y,
    width: 0.8,
    height: 0.1,
    zIndex: 10,
    fontId: "inter" as const,
    fontSize: 64,
    color: "#111827",
    align: "left" as const,
  }
}

const carousel: CarouselDetail = {
  id: "carousel-1",
  name: "Tips",
  format: "4:5",
  slide_count: 2,
  version: 1,
  thumbnail_url: null,
  is_template: false,
  project_id: null,
  created_at: "2099-01-01T00:00:00.000Z",
  updated_at: "2099-01-01T00:00:00.000Z",
  caption: "",
  slides: [
    {
      id: "slide-1",
      title: "Hook",
      backgroundColor: "#f8fafc",
      items: [text("headline", "Get rich slowly", 0.1), text("body", "Body words", 0.4)],
    },
    {
      id: "slide-2",
      title: "Two",
      backgroundColor: "#f8fafc",
      items: [text("second", "Second slide", 0.1)],
    },
  ],
}

async function render() {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <TooltipProvider>
        <CarouselBuilderPage document={carousel} />
      </TooltipProvider>
    )
  })
}

function byLabel(label: string) {
  const found = document.querySelector<HTMLElement>(`[aria-label="${label}"]`)
  if (!found) throw new Error(`Nothing labelled "${label}"`)
  return found
}

function buttonNamed(name: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === name
  )
  if (!found) throw new Error(`No button "${name}"`)
  return found
}

async function click(element: HTMLElement, init: MouseEventInit = {}) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }))
  })
}

async function key(keyName: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true, ...init }))
  })
}

describe("the carousel editor", () => {
  it("makes selected words bold, and the canvas draws them with a line in their colour", async () => {
    await render()
    const content = document.querySelector<HTMLTextAreaElement>("#carousel-text-headline")
    expect(content?.value).toBe("Get rich slowly")
    await act(async () => {
      content?.focus()
      content?.setSelectionRange(4, 8)
      content?.dispatchEvent(new Event("select", { bubbles: true }))
    })
    await click(buttonNamed("Bold"))
    const span = [...document.querySelectorAll<HTMLSpanElement>("[data-carousel-artboard] span")].find(
      (element) => element.textContent === "rich"
    )
    // 4.5 out of 100 of the font size, in the letters' own colour.
    expect(span?.style.webkitTextStroke).toMatch(/px #111827$/)
    expect(buttonNamed("Bold").getAttribute("aria-pressed")).toBe("true")
  })

  it("nudges the picked layer one pixel with an arrow, ten with Shift", async () => {
    await render()
    const x = () => document.querySelector<HTMLInputElement>("#carousel-position-headline-x")
    expect(x()?.value).toBe("10")
    await key("ArrowRight", { shiftKey: true })
    await key("ArrowRight", { shiftKey: true })
    await key("ArrowRight", { shiftKey: true })
    await key("ArrowRight", { shiftKey: true })
    await key("ArrowRight", { shiftKey: true })
    await key("ArrowRight", { shiftKey: true })
    await key("ArrowRight", { shiftKey: true })
    await key("ArrowRight", { shiftKey: true })
    await key("ArrowRight", { shiftKey: true })
    await key("ArrowRight", { shiftKey: true })
    await key("ArrowRight", { shiftKey: true })
    // 110 pixels of 1080 is 10.2 out of 100, so the box reads 20.
    expect(x()?.value).toBe("20")
  })

  it("lets go of the snap the moment Alt goes down mid-drag, with the pointer still", async () => {
    await render()
    const layer = [...document.querySelectorAll<HTMLElement>("[data-carousel-artboard] span")]
      .find((element) => element.textContent === "Get rich slowly")
      ?.closest<HTMLElement>("[data-carousel-artboard] > div")
    if (!layer) throw new Error("No headline on the canvas")
    const guides = () => document.querySelectorAll("[data-snap-line]").length
    const pointer = (type: string, clientX: number) =>
      act(async () => {
        layer.dispatchEvent(
          new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX, clientY: 100 })
        )
      })
    await pointer("pointerdown", 100)
    // 4 pixels right: the headline is centred, so it snaps back onto the middle.
    await pointer("pointermove", 104)
    expect(layer.style.left).toBe("10%")
    expect(guides()).toBeGreaterThan(0)
    await key("Alt", { altKey: true })
    expect(layer.style.left).not.toBe("10%")
    expect(guides()).toBe(0)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", bubbles: true }))
    })
    expect(layer.style.left).toBe("10%")
    await pointer("pointerup", 104)
  })

  it("picks two layers with Shift and deletes both with one key", async () => {
    await render()
    await click(buttonNamed("Layers"))
    await click(buttonNamed("Body words"), { shiftKey: true })
    expect(document.body.textContent).toContain("2 layers picked")
    await key("Delete")
    expect(document.querySelector("#carousel-text-headline")).toBeNull()
    expect(document.body.textContent).not.toContain("Body words")
    await key("z", { metaKey: true })
    expect(document.body.textContent).toContain("Body words")
  })

  it("leaves the slide alone while a window is open over it", async () => {
    await render()
    // Any open window, such as Add a picture sticker, owns the keys.
    const window_ = document.createElement("div")
    window_.setAttribute("role", "dialog")
    window_.setAttribute("data-state", "open")
    document.body.append(window_)
    await key("Delete")
    expect(document.querySelector("#carousel-text-headline")).not.toBeNull()
    window_.remove()
    await key("Delete")
    expect(document.querySelector("#carousel-text-headline")).toBeNull()
  })

  it("hides a layer from the canvas through the Layers list", async () => {
    await render()
    await click(buttonNamed("Layers"))
    const artboard = () => document.querySelector("[data-carousel-artboard]")?.textContent ?? ""
    expect(artboard()).toContain("Body words")
    await click(byLabel("Hide Body words"))
    expect(artboard()).not.toContain("Body words")
    // The button now says what pressing it again does.
    expect(byLabel("Show Body words")).toBeTruthy()
  })

  it("puts a slide number on every slide that reads its own place", async () => {
    await render()
    await click(buttonNamed("Text"))
    await click(buttonNamed("Every slide"))
    const artboard = document.querySelector("[data-carousel-artboard]")?.textContent ?? ""
    expect(artboard).toContain("1/2")
  })

  it("previews one slide at a time and steps to the next", async () => {
    await render()
    await click(buttonNamed("Preview"))
    const place = () => document.querySelector("[data-preview-place]")?.textContent
    expect(place()).toBe("1/2")
    const next = document.querySelector<HTMLElement>(
      '[role="dialog"] [aria-label="Next slide"]'
    )
    if (!next) throw new Error("No Next slide in the preview")
    await click(next)
    expect(place()).toBe("2/2")
  })

  it("exports the PDF: saves, keeps the export, then downloads it as a PDF", async () => {
    const opened: string[] = []
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        opened.push(this.href)
      })
    await render()
    await click(buttonNamed("Export"))
    const pdfTab = [...document.querySelectorAll<HTMLElement>("[role=tab]")].find(
      (tab) => tab.textContent === "PDF for LinkedIn"
    )
    await act(async () => {
      pdfTab?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      pdfTab?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    })
    await click(buttonNamed("Download PDF"))
    expect(api.exported).toBe(1)
    expect(opened[0]).toContain("/api/v1/video/exports/export-1/file?format=pdf")
    clickSpy.mockRestore()
  })
})

