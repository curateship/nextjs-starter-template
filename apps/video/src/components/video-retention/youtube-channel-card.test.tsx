// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  loadYoutubeConnection: vi.fn(),
  saveYoutubeClientId: vi.fn(),
  saveYoutubeClientSecret: vi.fn(),
  removeYoutubeClient: vi.fn(),
  disconnectYoutubeChannel: vi.fn(),
}))
vi.mock("@/lib/api/video/youtube-retention", () => ({
  ...api,
  getRetentionErrorMessage: (error: Error) => error.message,
}))
const toasts = vi.hoisted(() => ({ showErrorToast: vi.fn(), success: vi.fn() }))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: toasts.showErrorToast,
  dismissErrorToast: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { success: toasts.success, message: vi.fn() } }))
vi.mock("@/components/settings/use-reported-save-status", () => ({
  useReportedSaveStatus: () => vi.fn(),
}))

import { TooltipProvider } from "@/components/ui/tooltip"
import type { YoutubeConnectionStatus } from "@/lib/video/retention"
import { YOUTUBE_CLIENT_MISSING_MESSAGE } from "@/lib/video/retention"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let host: HTMLDivElement | null = null

const EMPTY: YoutubeConnectionStatus = {
  redirectUri: "http://localhost:3016/api/v1/video/youtube/callback",
  clientId: null,
  maskedSecret: null,
  clientUnreadable: false,
  channel: null,
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset())
  toasts.showErrorToast.mockReset()
  toasts.success.mockReset()
  vi.resetModules()
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  vi.useRealTimers()
})

async function open(status: YoutubeConnectionStatus, address = "/admin/settings/youtube") {
  window.history.replaceState(null, "", address)
  api.loadYoutubeConnection.mockResolvedValue(status)
  // A fresh module each time, so the held copy from the last test is gone.
  const { YoutubeChannelCard } = await import(
    "@/components/video-retention/youtube-channel-card"
  )
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <TooltipProvider>
        <YoutubeChannelCard />
      </TooltipProvider>
    )
  })
}

function button(name: string) {
  return [...host!.querySelectorAll("button")].find(
    (one) => one.textContent?.trim() === name
  ) as HTMLButtonElement
}

function field(id: string) {
  return host!.querySelector(`#${id}`) as HTMLInputElement
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      value
    )
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

describe("the YouTube channel card", () => {
  it("shows the return address to register and refuses Connect without a client", async () => {
    await open(EMPTY)
    expect(field("youtube-redirect-uri").value).toBe(EMPTY.redirectUri)
    expect(host!.textContent).toContain("No channel connected yet.")
    act(() => button("Connect YouTube").click())
    expect(toasts.showErrorToast).toHaveBeenCalledWith(YOUTUBE_CLIENT_MISSING_MESSAGE)
  })

  it("saves a pasted client id by itself, 700ms after the last key", async () => {
    vi.useFakeTimers()
    await open(EMPTY)
    api.saveYoutubeClientId.mockResolvedValue({ ...EMPTY, clientId: "abc.apps" })
    type(field("youtube-client-id"), "abc.apps")
    await act(async () => vi.advanceTimersByTime(699))
    expect(api.saveYoutubeClientId).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(1))
    expect(api.saveYoutubeClientId).toHaveBeenCalledWith("abc.apps")
  })

  it("shows a saved secret as dots and never its text", async () => {
    await open({ ...EMPTY, clientId: "abc.apps", maskedSecret: "••••et-1" })
    expect(field("youtube-client-secret").value).toBe("••••••••••••")
    expect(field("youtube-client-secret").type).toBe("password")
  })

  it("names the connected channel, offers Disconnect, and says how the trip went", async () => {
    await open(
      {
        ...EMPTY,
        clientId: "abc.apps",
        maskedSecret: "••••et-1",
        channel: { id: "UC1", title: "Barely Cooking", connectedAt: "2026-10-22T10:00:00Z" },
      },
      "/admin/settings/youtube?youtube=connected"
    )
    expect(host!.textContent).toContain("Connected to Barely Cooking")
    expect(button("Disconnect")).toBeDefined()
    expect(toasts.success).toHaveBeenCalledWith("YouTube channel connected.")
    // Taken out of the address, so a reload does not say it twice.
    expect(window.location.search).toBe("")
  })

  it("says in words why a connect failed", async () => {
    await open(EMPTY, "/admin/settings/youtube?youtube_error=scopes")
    expect(toasts.showErrorToast).toHaveBeenCalledWith(
      expect.stringContaining("Both boxes on Google's screen need a tick")
    )
  })
})
