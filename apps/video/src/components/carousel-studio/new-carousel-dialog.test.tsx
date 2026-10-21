// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const calls = vi.hoisted(() => ({
  written: [] as unknown[],
  fromTemplate: [] as unknown[],
  templates: [] as { id: string; name: string }[],
}))

vi.mock("@/lib/api/video/carousels", () => ({
  getCarouselErrorMessage: (error: unknown) => String(error),
  createCarousel: vi.fn(async (name: string) => ({ id: "blank", name })),
  createFromTemplate: vi.fn(async (templateId: string, name: string) => {
    calls.fromTemplate.push({ templateId, name })
    return { id: "from-template", name }
  }),
  listCarouselTemplates: vi.fn(async () =>
    calls.templates.map((template) => ({
      ...template,
      slide_count: 3,
      format: "4:5",
      thumbnail_url: null,
    }))
  ),
  writeCarouselWithAi: vi.fn(async (...args: unknown[]) => {
    calls.written.push(args)
    return { id: "written", name: "Running tips" }
  }),
}))
vi.mock("@/lib/api/video/projects", () => ({
  listProjects: vi.fn(async () => ({ projects: [] })),
}))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: vi.fn(),
  dismissErrorToast: vi.fn(),
}))

import { NewCarouselDialog } from "@/components/carousel-studio/new-carousel-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => undefined
})

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  calls.written = []
  calls.fromTemplate = []
  calls.templates = []
})

async function render(onCreated = vi.fn()) {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <TooltipProvider>
        <NewCarouselDialog open onClose={() => undefined} onCreated={onCreated} />
      </TooltipProvider>
    )
  })
  return onCreated
}

function tab(name: string) {
  const found = [...document.querySelectorAll<HTMLElement>("[role=tab]")].find(
    (element) => element.textContent === name
  )
  if (!found) throw new Error(`No tab "${name}"`)
  return found
}

async function pick(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
  })
}

async function type(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector)
  if (!input) throw new Error(`No field ${selector}`)
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  await act(async () => {
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

async function submit() {
  await act(async () => {
    document.querySelector("form")?.requestSubmit()
  })
}

describe("New carousel", () => {
  it("offers a template only to someone who has one", async () => {
    await render()
    expect([...document.querySelectorAll("[role=tab]")].map((element) => element.textContent)).toEqual([
      "Blank",
      "Write it with AI",
    ])
  })

  it("copies the picked template under the new name", async () => {
    calls.templates = [{ id: "template-1", name: "Tips layout" }]
    const onCreated = await render()
    await pick(tab("A template"))
    await type("#new-carousel-name", "Monday tips")
    const option = document.querySelector<HTMLElement>("[role=radio]")
    await act(async () => option?.click())
    await submit()
    expect(calls.fromTemplate).toEqual([{ templateId: "template-1", name: "Monday tips" }])
    expect(onCreated).toHaveBeenCalledWith({ id: "from-template", name: "Monday tips" })
  })

  it("asks AI for 7 slides about a topic, in 4:5, by default", async () => {
    const onCreated = await render()
    await pick(tab("Write it with AI"))
    await type("#new-carousel-topic", "5 mistakes new runners make")
    await submit()
    expect(calls.written).toEqual([
      [{ kind: "topic", text: "5 mistakes new runners make" }, 7, "4:5"],
    ])
    expect(onCreated).toHaveBeenCalledWith({ id: "written", name: "Running tips" })
  })

  it("works from a web link", async () => {
    await render()
    await pick(tab("Write it with AI"))
    await pick(tab("A web link"))
    await type("#new-carousel-link", "https://example.com/post")
    await submit()
    expect(calls.written[0]).toEqual([
      { kind: "link", url: "https://example.com/post" },
      7,
      "4:5",
    ])
  })
})
