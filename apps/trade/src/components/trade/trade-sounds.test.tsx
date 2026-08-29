// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  loadEvents: vi.fn(),
  loadSettings: vi.fn(),
}))

vi.mock("@/lib/api/trade/notice-links", () => ({
  loadTradeSoundEvents: api.loadEvents,
}))
vi.mock("@/lib/api/trade/trade-sound-settings", () => ({
  loadTradeSoundSettings: api.loadSettings,
}))

import { useTradeSounds } from "@/components/trade/trade-sounds"
import {
  rememberTradeSoundSetting,
  seedTradeSounds,
} from "@/lib/trade/trade-sounds"

class FakeEventSource {
  static instances: FakeEventSource[] = []
  readonly url: string
  onopen: (() => void) | null = null
  onmessage: (() => void) | null = null
  close = vi.fn()

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
}

class FakeAudio {
  static instances: FakeAudio[] = []
  readonly src: string
  play = vi.fn(() => Promise.resolve())

  constructor(src: string) {
    this.src = src
    FakeAudio.instances.push(this)
  }
}

function Harness() {
  useTradeSounds()
  return null
}

beforeEach(() => {
  rememberTradeSoundSetting(undefined)
  seedTradeSounds({
    enabled: false,
    events: [],
    cursor: { afterAt: 0, afterId: "" },
    error: "No dashboard answer in this test.",
  })
  api.loadEvents.mockReset()
  api.loadSettings.mockReset()
  FakeEventSource.instances = []
  FakeAudio.instances = []
  vi.stubGlobal("EventSource", FakeEventSource)
  vi.stubGlobal("Audio", FakeAudio)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("the open Trade screen's sound listener", () => {
  it("starts from the dashboard answer and closes the stream connection gap", async () => {
    vi.useFakeTimers()
    seedTradeSounds({
      enabled: true,
      events: [],
      cursor: { afterAt: 10_000, afterId: "notice-0" },
      error: null,
    })
    api.loadEvents.mockResolvedValue({
      events: [],
      cursor: { afterAt: 10_000, afterId: "notice-0" },
    })
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => root.render(<Harness />))
    await act(async () => {
      FakeEventSource.instances[0].onopen?.()
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(api.loadSettings).not.toHaveBeenCalled()
    expect(api.loadEvents).toHaveBeenCalledOnce()
    expect(api.loadEvents).toHaveBeenCalledWith({
      afterAt: 10_000,
      afterId: "notice-0",
    })
    await act(async () => root.unmount())
  })

  it("opens no connection while the account switch is off", async () => {
    api.loadSettings.mockResolvedValue({ enabled: false })
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => root.render(<Harness />))

    expect(FakeEventSource.instances).toHaveLength(0)
    await act(async () => root.unmount())
  })

  it("remembers the account switch when the screen is opened again", async () => {
    api.loadSettings.mockResolvedValue({ enabled: false })
    const firstHost = document.createElement("div")
    const firstRoot = createRoot(firstHost)

    await act(async () => firstRoot.render(<Harness />))
    await act(async () => firstRoot.unmount())

    const secondHost = document.createElement("div")
    const secondRoot = createRoot(secondHost)
    await act(async () => secondRoot.render(<Harness />))

    expect(api.loadSettings).toHaveBeenCalledOnce()
    await act(async () => secondRoot.unmount())
  })

  it("plays a fill as soon as the live notice pings the open screen", async () => {
    vi.useFakeTimers()
    api.loadSettings.mockResolvedValue({ enabled: true })
    api.loadEvents.mockResolvedValue({
      events: [{ id: "notice-1", kind: "fill", createdAt: 10_001 }],
      cursor: { afterAt: 10_001, afterId: "notice-1" },
    })
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => root.render(<Harness />))
    window.dispatchEvent(new Event("pointerdown"))
    await act(async () => {
      FakeEventSource.instances[0].onmessage?.()
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(api.loadEvents).toHaveBeenCalledOnce()
    expect(FakeAudio.instances.map((audio) => audio.src)).toEqual([
      "/sounds/trade-fill.wav",
    ])
    expect(FakeAudio.instances[0].play).toHaveBeenCalledOnce()
    await act(async () => root.unmount())
  })

  it("does not check every two seconds while it waits for a live notice", async () => {
    vi.useFakeTimers()
    api.loadSettings.mockResolvedValue({ enabled: true })
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => root.render(<Harness />))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_300)
    })

    expect(api.loadEvents).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })

  it("keeps listening while hidden and closes when the screen leaves", async () => {
    api.loadSettings.mockResolvedValue({ enabled: true })
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => root.render(<Harness />))

    expect(FakeEventSource.instances).toHaveLength(1)
    const source = FakeEventSource.instances[0]
    expect(source.url).toBe("/api/v1/notifications/stream")
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    })
    document.dispatchEvent(new Event("visibilitychange"))
    expect(source.close).not.toHaveBeenCalled()

    await act(async () => root.unmount())
    expect(source.close).toHaveBeenCalledOnce()
  })
})
