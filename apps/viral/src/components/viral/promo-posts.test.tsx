// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { WritePostForPromoButton } from "@/components/viral/promo-posts"
import type { PromoPostSend } from "@/lib/viral/promo-link"

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

vi.mock("@/lib/api/viral/viral-promo", () => ({
  loadPromoPostPrice: vi.fn(async () => ({ cents: 1 })),
  loadPromoProjects: vi.fn(async () => [{ id: "promo-1", name: "Launch" }]),
  loadVaultPosts: vi.fn(async () => []),
  sendPromoPostFn: vi.fn(),
  writePromoPostFn: vi.fn(
    async (_itemId: string, network: PromoPostSend["network"]): Promise<PromoPostSend> => ({
      id: "send-1",
      network,
      title: "",
      pieces: ["Three lunches in ten minutes."],
      status: "written",
      promoProjectId: null,
      draftUrl: null,
      error: "",
      createdAt: "2099-01-01T00:00:00.000Z",
      sentAt: null,
    })
  ),
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function button(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((one) => one.textContent?.trim() === text)
}

async function openAndWrite() {
  await act(async () =>
    root.render(
      <TooltipProvider>
        <WritePostForPromoButton itemId="idea-1" />
      </TooltipProvider>
    )
  )
  await act(async () => button("Post for Promo")?.click())
  await act(async () => button("Write")?.click())
  expect(document.querySelector("#viral-promo-piece-0")).not.toBeNull()
}

async function pickNetwork(name: string) {
  const trigger = document.querySelector<HTMLButtonElement>("#viral-promo-network")!
  expect(trigger.disabled).toBe(false)
  await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })))
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((one) => one.textContent === name)!
  await act(async () => option.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })))
}

describe("the network after Write", () => {
  it("can still change, and clears the untouched words without asking", async () => {
    await openAndWrite()
    await pickNetwork("LinkedIn")
    expect(document.body.textContent).not.toContain("Discard changes?")
    expect(document.querySelector("#viral-promo-piece-0")).toBeNull()
    expect(document.querySelector("#viral-promo-network")?.textContent).toContain("LinkedIn")
  })

  it("asks first when the words were edited", async () => {
    await openAndWrite()
    const words = document.querySelector<HTMLTextAreaElement>("#viral-promo-piece-0")!
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!
      setValue.call(words, "My own words.")
      words.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await pickNetwork("LinkedIn")
    expect(document.body.textContent).toContain("Discard changes?")
    expect(document.querySelector("#viral-promo-piece-0")).not.toBeNull()

    await act(async () => button("Discard changes")?.click())
    expect(document.querySelector("#viral-promo-piece-0")).toBeNull()
    expect(document.querySelector("#viral-promo-network")?.textContent).toContain("LinkedIn")
  })
})
