// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  countAudience: vi.fn(),
  sendBroadcastNow: vi.fn(),
  scheduleBroadcastSend: vi.fn(),
  sendTestEmail: vi.fn(),
  updateBroadcast: vi.fn(),
}))
const toast = vi.hoisted(() => ({ useErrorToast: vi.fn() }))

vi.mock("@/lib/toast/error-toast", () => ({
  dismissErrorToast: vi.fn(),
  showErrorToast: vi.fn(),
  useErrorToast: toast.useErrorToast,
}))

vi.mock("@/lib/api/email/broadcasts", () => ({
  cancelBroadcastScheduleSend: vi.fn(),
  countAudience: api.countAudience,
  getBroadcastErrorMessage: (error: unknown) => String(error),
  scheduleBroadcastSend: api.scheduleBroadcastSend,
  sendBroadcastNow: api.sendBroadcastNow,
  sendTestEmail: api.sendTestEmail,
  updateBroadcast: api.updateBroadcast,
}))

import { SendBroadcastDialog } from "@/components/broadcasts/send-broadcast-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { BroadcastDetail } from "@/lib/api/email/broadcasts"
import { DEFAULT_DRIP_CONFIG } from "@/lib/broadcasts/drip"

const broadcast = {
  id: "b1",
  subject: "Hello",
  fromName: null,
  blocks: [],
  status: "draft",
  scheduled_at: null,
  audienceFilter: { kind: "all" },
  dripConfig: DEFAULT_DRIP_CONFIG,
} as unknown as BroadcastDetail

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
    input,
    value
  )
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function pressEnter(target: HTMLElement) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
  )
}

function button(label: string) {
  // Skips the Timing dropdown, whose trigger also reads "Send it now".
  const found = Array.from(
    document.body.querySelectorAll('button:not([role="combobox"])')
  ).find(
    (candidate) => candidate.textContent?.trim() === label
  )
  if (!(found instanceof HTMLButtonElement)) throw new Error(`No "${label}" button`)
  return found
}

async function openDialog() {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <TooltipProvider>
        <SendBroadcastDialog
          open
          onOpenChange={vi.fn()}
          broadcast={broadcast}
          segments={[]}
          onUpdated={vi.fn()}
        />
      </TooltipProvider>
    )
  })
  await act(async () => await Promise.resolve())
  return async () => {
    await act(async () => root.unmount())
    host.remove()
  }
}

/** The last message the window handed to its error toast. */
function lastError() {
  return toast.useErrorToast.mock.calls.at(-1)?.[0] ?? null
}

/** jsdom has no ResizeObserver, and the window's Selects measure themselves. */
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("SendBroadcastDialog", () => {
  beforeEach(() => {
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = StubResizeObserver
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    for (const fn of Object.values(api)) fn.mockReset()
    toast.useErrorToast.mockReset()
    api.sendTestEmail.mockResolvedValue({ ok: true })
    api.updateBroadcast.mockResolvedValue(broadcast)
    api.sendBroadcastNow.mockResolvedValue(broadcast)
  })

  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("Enter in the test box sends the test copy, never the newsletter", async () => {
    api.countAudience.mockResolvedValue({ total: 3 })
    const close = await openDialog()

    const testBox = document.body.querySelector<HTMLInputElement>("#send-test-email")!
    await act(async () => setInputValue(testBox, "me@example.com"))
    await act(async () => pressEnter(testBox))

    expect(api.sendTestEmail).toHaveBeenCalledWith("b1", "me@example.com")
    expect(api.updateBroadcast).not.toHaveBeenCalled()
    expect(api.sendBroadcastNow).not.toHaveBeenCalled()
    await close()
  })

  it("Enter in any other box never submits the window", async () => {
    api.countAudience.mockResolvedValue({ total: 3 })
    const close = await openDialog()

    const form = document.body.querySelector("form")!
    const submitted = vi.fn()
    form.addEventListener("submit", submitted)
    const boxes = Array.from(
      form.querySelectorAll<HTMLInputElement>("input:not(#send-test-email)")
    )
    expect(boxes.length).toBeGreaterThan(0)
    for (const box of boxes) {
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      })
      await act(async () => box.dispatchEvent(event))
      // A cancelled Enter is what stops the browser's own implicit submit.
      expect(event.defaultPrevented).toBe(true)
    }
    expect(submitted).not.toHaveBeenCalled()
    expect(api.sendBroadcastNow).not.toHaveBeenCalled()
    await close()
  })

  it("a failed count says so, refuses to send, and Try again counts again", async () => {
    api.countAudience.mockRejectedValueOnce(new Error("down"))
    const close = await openDialog()

    expect(document.body.textContent).toContain("We could not count who gets this.")
    expect(document.body.textContent).not.toContain("Counting…")

    await act(async () => button("Send it now").click())
    expect(lastError()).toBe("Wait for the count, or press Try again.")
    expect(api.updateBroadcast).not.toHaveBeenCalled()
    expect(api.sendBroadcastNow).not.toHaveBeenCalled()

    api.countAudience.mockResolvedValueOnce({ total: 7 })
    await act(async () => button("Try again").click())
    await act(async () => await Promise.resolve())
    expect(document.body.textContent).toContain("7 people will get this.")

    await act(async () => button("Send it now").click())
    await act(async () => await Promise.resolve())
    expect(api.sendBroadcastNow).toHaveBeenCalledWith("b1")
    await close()
  })

  it("refuses to send while the count is still running", async () => {
    api.countAudience.mockReturnValue(new Promise(() => {}))
    const close = await openDialog()

    expect(document.body.textContent).toContain("Counting…")
    await act(async () => button("Send it now").click())
    expect(lastError()).toBe("Wait for the count, or press Try again.")
    expect(api.sendBroadcastNow).not.toHaveBeenCalled()
    await close()
  })
})
