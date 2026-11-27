// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/video/ai-tools", () => ({
  rememberAiChoice: vi.fn(async () => ({})),
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))

import { AiChoiceField } from "@/components/video-editor/ai-choice-field"
import type { AiToolsAvailability } from "@/lib/api/video/ai-tools"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

beforeAll(() => {
  // Radix Select measures and scrolls; jsdom has neither.
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
})

function availability(
  overrides: Partial<AiToolsAvailability>
): AiToolsAvailability {
  return {
    words: true,
    voice: false,
    openai: true,
    anthropic: false,
    defaults: {},
    transcriber: "openai",
    writer: "gemini",
    ...overrides,
  }
}

function render(available: AiToolsAvailability) {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(<AiChoiceField kind="writer" available={available} />))
}

function openDropdown() {
  const trigger = document.querySelector<HTMLElement>("#ai-choice-writer")!
  act(() => {
    trigger.focus()
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  })
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')]
}

describe("choosing who rewrites words", () => {
  it("offers Claude greyed out with where to add the key when none is saved", () => {
    render(availability({ anthropic: false }))

    const claude = openDropdown().find((option) =>
      option.textContent?.includes("Claude Opus 5")
    )
    expect(claude?.textContent).toContain(
      "Needs an Anthropic key. Add one in Settings → AI."
    )
    expect(claude?.getAttribute("aria-disabled")).toBe("true")
  })

  it("offers Claude by name alone once the key is saved", () => {
    render(availability({ anthropic: true }))

    const claude = openDropdown().find((option) =>
      option.textContent?.includes("Claude Opus 5")
    )
    // Just the name: the descriptions were removed from the dropdown.
    expect(claude?.textContent).toBe("Claude Opus 5")
    expect(claude?.getAttribute("aria-disabled")).toBeNull()
  })

  it("says what is really being used when Claude's key has gone", () => {
    render(
      availability({
        anthropic: false,
        defaults: { writer: "anthropic" },
        writer: "gemini",
      })
    )

    expect(host!.textContent).toContain(
      "Claude Opus 5 was chosen, but no Anthropic key is saved any more, so Gemini Flash is doing it."
    )
    expect(document.querySelector("#ai-choice-writer")?.textContent).toContain(
      "Gemini Flash"
    )
  })

  it("keeps quiet after a different writer is picked in the window", () => {
    render(
      availability({
        anthropic: true,
        defaults: { writer: "openai" },
        writer: "openai",
      })
    )

    const claude = openDropdown().find((option) =>
      option.textContent?.includes("Claude Opus 5")
    )!
    act(() => {
      claude.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" })
      )
      claude.click()
    })

    expect(document.querySelector("#ai-choice-writer")?.textContent).toContain(
      "Claude Opus 5"
    )
    expect(host!.textContent).not.toContain("was chosen")
    expect(host!.textContent).toContain("Chosen once.")
  })

  it("draws nothing when no writer has a key at all", () => {
    render(availability({ words: false, openai: false, anthropic: false }))
    expect(host!.textContent).toBe("")
  })
})
