// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  createActor: vi.fn(async (payload: { name: string }) => ({ id: "actor-1", ...payload })),
}))
vi.mock("@/lib/api/video/actors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/video/actors")>()),
  createActor: api.createActor,
}))
// The voice picker asks for voices; this test only saves, so it gets none.
vi.mock("@/lib/api/video/ai-tools", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/video/ai-tools")>()),
  loadVoices: vi.fn(async () => []),
}))
vi.mock("@tanstack/react-router", () => ({
  useMatch: () => ({ loaderData: { user: { id: "user-1" } } }),
}))
// Two server files find their fonts and sounds beside themselves on disk,
// which a browser test cannot do.
vi.mock("@/server/video/stock-sound-files", () => ({
  STOCK_SOUND_MISSING_MESSAGE: "",
  requireStockSoundFile: () => "",
}))
vi.mock("@/server/video/text-font-files", () => ({
  FONT_MISSING_MESSAGE: "",
  requireTextFontFiles: () => ({}),
}))

import { TooltipProvider } from "@/components/ui/tooltip"
import { ActorFormDialog } from "@/components/video-assets/actor-form-dialog"

let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ""
  root = null
  api.createActor.mockClear()
})

async function settle() {
  for (let pass = 0; pass < 5; pass += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function openCreateActor() {
  const host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <TooltipProvider>
        <ActorFormDialog open actor={null} projects={[]} onClose={() => undefined} onSaved={() => undefined} />
      </TooltipProvider>
    )
  })
  await settle()
}

function type(id: string, value: string) {
  const box = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box), "value")!.set!
  act(() => {
    setter.call(box, value)
    box.dispatchEvent(new Event("input", { bubbles: true }))
  })
  return box
}

describe("Create actor", () => {
  it("opens with no red boxes", async () => {
    await openCreateActor()
    expect(document.querySelector("[aria-invalid=true]")).toBeNull()
  })

  it("saves when Enter is pressed in the name box", async () => {
    await openCreateActor()
    type("actor-description", "A runner in her thirties")
    const name = type("actor-name", "Maya")
    await act(async () => {
      name.form!.requestSubmit()
    })
    await settle()
    expect(api.createActor).toHaveBeenCalledTimes(1)
    expect(api.createActor.mock.calls[0][0]).toMatchObject({ name: "Maya" })
  })

  it("marks the empty boxes red only after a save is tried", async () => {
    await openCreateActor()
    const name = document.getElementById("actor-name") as HTMLInputElement
    await act(async () => {
      name.form!.requestSubmit()
    })
    expect(api.createActor).not.toHaveBeenCalled()
    expect(name.getAttribute("aria-invalid")).toBe("true")
  })
})
