// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { reportSaveStatus, saveAiKey } = vi.hoisted(() => ({
  reportSaveStatus: vi.fn(),
  saveAiKey: vi.fn(),
}))

vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ reportSaveStatus }),
}))
vi.mock("@/lib/toast/error-toast", () => ({
  dismissErrorToast: vi.fn(),
  showErrorToast: vi.fn(),
}))
vi.mock("@/lib/api/ai", () => ({
  getAiErrorMessage: () => "failed",
  loadAiKeyStatuses: async () => [],
  removeAiProviderKey: vi.fn(),
  saveAiKey,
  testAiProviderKey: vi.fn(),
}))

import { AiSettings } from "@/components/settings/ai-settings"
import {
  SAVE_DELAY_MS,
  useSettingsAutoSave,
} from "@/components/settings/use-settings-auto-save"
import { TooltipProvider } from "@/components/ui/tooltip"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  vi.useFakeTimers()
  reportSaveStatus.mockClear()
  saveAiKey.mockReset()
  window.localStorage.clear()
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.useRealTimers()
})

function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set
  setValue?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("AI provider keys", () => {
  // Tabbing away from a pasted key while another key was still saving used to
  // cancel the pending save and then give up, so the second key was lost.
  it("saves a key left while another key is still saving", async () => {
    // The first save hangs until the test lets it go.
    let finishFirst = () => {}
    saveAiKey.mockImplementationOnce(
      () => new Promise((resolve) => (finishFirst = () => resolve([])))
    )
    saveAiKey.mockResolvedValue([])

    await act(async () => {
      root.render(
        <TooltipProvider>
          <AiSettings />
        </TooltipProvider>
      )
    })
    const anthropic = host.querySelector<HTMLInputElement>("#ai-key-anthropic")
    const openai = host.querySelector<HTMLInputElement>("#ai-key-openai")
    if (!anthropic || !openai) throw new Error("key boxes not drawn")

    await act(async () => {
      anthropic.focus()
      type(anthropic, "key-a")
      anthropic.blur()
    })
    expect(saveAiKey).toHaveBeenCalledWith("anthropic", "key-a")

    await act(async () => {
      openai.focus()
      type(openai, "key-b")
      openai.blur()
    })
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DELAY_MS)
    })
    expect(saveAiKey).toHaveBeenCalledWith("openai", "key-b")

    await act(async () => finishFirst())
  })
})

describe("useSettingsAutoSave", () => {
  // The header shows the page's own save unless a card reports something, so
  // a card sitting idle must report nothing rather than "idle".
  it("never reports idle to the sticky header", async () => {
    let autoSave: ReturnType<typeof useSettingsAutoSave<string>> | null = null
    function Probe() {
      autoSave = useSettingsAutoSave<string>(() => "failed", () => {})
      return null
    }
    await act(async () => root.render(<Probe />))

    await act(async () => {
      await autoSave?.run("ok", async () => "saved")
    })
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    await act(async () => {
      await autoSave?.run("bad", async () => {
        throw new Error("no")
      })
    })

    const reported = reportSaveStatus.mock.calls.map(([value]) => value)
    expect(reported).toContain("saved")
    expect(reported).not.toContain("idle")
  })
})
