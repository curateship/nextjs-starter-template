// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The room clock store (rooms task 03): the room you are in, kept live for
 * the whole tab so the header's timer pill can show it on every page.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const calls = vi.hoisted(() => ({
  timerRunning: false,
  toggleTimer: vi.fn(),
  enterHostedRoom: vi.fn(),
  leaveHostedRoom: vi.fn(),
  followRoomRunning: vi.fn(),
  setRoomClockActive: vi.fn(),
  getCurrentRoom: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("@/lib/api/pomodoro/rooms", () => ({ getCurrentRoom: calls.getCurrentRoom }))
const signedIn = { known: true, authenticated: true }
vi.mock("@/lib/pomodoro/auth-state", () => ({
  productAuth: () => signedIn,
  subscribeProductAuth: () => () => {},
}))
vi.mock("@/lib/pomodoro/room-media-store", () => ({
  enterHostedRoom: calls.enterHostedRoom,
  leaveHostedRoom: calls.leaveHostedRoom,
}))
vi.mock("@/lib/pomodoro/sound-engine", () => ({
  followRoomRunning: calls.followRoomRunning,
  setRoomClockActive: calls.setRoomClockActive,
}))
vi.mock("@/lib/pomodoro/use-pomodoro", () => ({
  pomodoroEngineState: () => ({ timer: { running: calls.timerRunning } }),
  toggleTimer: () => {
    calls.timerRunning = !calls.timerRunning
    calls.toggleTimer()
  },
}))
vi.mock("sonner", () => ({ toast: { success: calls.toast } }))

/** A stand-in for the browser's live connection, recording each one opened. */
class FakeEventSource {
  static opened: FakeEventSource[] = []
  listeners: Record<string, (event: { data?: string }) => void> = {}
  closed = false
  onerror: (() => void) | null = null
  url: string
  constructor(url: string) {
    this.url = url
    FakeEventSource.opened.push(this)
  }
  addEventListener(type: string, listener: (event: { data?: string }) => void) {
    this.listeners[type] = listener
  }
  close() {
    this.closed = true
  }
  send(type: string, data?: unknown) {
    this.listeners[type]?.({ data: JSON.stringify(data) })
  }
}
;(globalThis as { EventSource?: unknown }).EventSource = FakeEventSource

function snapshotOf(phase: string, slug = "room-one-slug") {
  return {
    room: { slug, name: "Rainy Berlin study", phase, sound: null, background: null, files: undefined },
    you: { role: "member" },
  }
}

async function freshStore() {
  vi.resetModules()
  FakeEventSource.opened = []
  calls.timerRunning = false
  for (const spy of Object.values(calls)) if (typeof spy === "function") spy.mockReset()
  return import("@/lib/pomodoro/room-clock-store")
}

function Reader({ store }: { store: Awaited<ReturnType<typeof freshStore>> }) {
  const clock = store.useRoomClock()
  return <p>{clock.snapshot?.room.phase ?? "none"}</p>
}

function mount(node: React.ReactNode) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(node))
  return { container, unmount: () => act(() => root.unmount()) }
}

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("the room clock store", () => {
  it("holds a running personal timer paused and gives the room the sound", async () => {
    const store = await freshStore()
    calls.timerRunning = true
    store.applyRoomSnapshot(snapshotOf("focus") as never)
    expect(calls.toggleTimer).toHaveBeenCalledTimes(1)
    expect(calls.timerRunning).toBe(false)
    expect(calls.setRoomClockActive).toHaveBeenLastCalledWith(true)
    // The first snapshot only records the room's clock: arriving mid-focus
    // never starts the sound by itself.
    expect(calls.followRoomRunning).toHaveBeenLastCalledWith(true, true)
    store.applyRoomSnapshot(snapshotOf("short") as never)
    expect(calls.followRoomRunning).toHaveBeenLastCalledWith(false, false)
  })

  it("leaves a paused personal timer as it was", async () => {
    const store = await freshStore()
    store.applyRoomSnapshot(snapshotOf("focus") as never)
    expect(calls.toggleTimer).not.toHaveBeenCalled()
  })

  it("opens one connection however many parts of the page read the room", async () => {
    const store = await freshStore()
    store.applyRoomSnapshot(snapshotOf("focus") as never)
    expect(FakeEventSource.opened).toHaveLength(0)
    const header = mount(<Reader store={store} />)
    const page = mount(<Reader store={store} />)
    expect(FakeEventSource.opened).toHaveLength(1)
    expect(FakeEventSource.opened[0]!.url).toBe("/api/pomodoro/rooms/room-one-slug/events")
    page.unmount()
    expect(FakeEventSource.opened[0]!.closed).toBe(false)
    header.unmount()
    expect(FakeEventSource.opened[0]!.closed).toBe(true)
  })

  it("draws each snapshot the connection sends", async () => {
    const store = await freshStore()
    store.applyRoomSnapshot(snapshotOf("waiting") as never)
    const reader = mount(<Reader store={store} />)
    expect(reader.container.textContent).toBe("waiting")
    act(() => FakeEventSource.opened[0]!.send("snapshot", snapshotOf("focus")))
    expect(reader.container.textContent).toBe("focus")
    reader.unmount()
  })

  it("puts the personal timer back when you are removed on another page", async () => {
    const store = await freshStore()
    store.applyRoomSnapshot(snapshotOf("focus") as never)
    const reader = mount(<Reader store={store} />)
    act(() => FakeEventSource.opened[0]!.send("room_gone"))
    expect(reader.container.textContent).toBe("none")
    expect(calls.leaveHostedRoom).toHaveBeenCalled()
    expect(calls.setRoomClockActive).toHaveBeenLastCalledWith(false)
    expect(calls.followRoomRunning).toHaveBeenLastCalledWith(false)
    expect(calls.toast).toHaveBeenCalledWith("You are no longer in this room.", expect.anything())
    expect(FakeEventSource.opened[0]!.closed).toBe(true)
    reader.unmount()
  })

  it("keeps the last clock while the connection is down", async () => {
    const store = await freshStore()
    store.applyRoomSnapshot(snapshotOf("focus") as never)
    const reader = mount(<Reader store={store} />)
    act(() => FakeEventSource.opened[0]!.onerror?.())
    expect(reader.container.textContent).toBe("focus")
    expect(calls.setRoomClockActive).not.toHaveBeenCalledWith(false)
    reader.unmount()
  })

  it("ends the room when it closes, and says so once", async () => {
    const store = await freshStore()
    store.applyRoomSnapshot(snapshotOf("focus") as never)
    store.leftRoom("room-one-slug", "You left the room.")
    store.applyRoomSnapshot(snapshotOf("closed") as never)
    expect(calls.toast).toHaveBeenCalledTimes(1)
    expect(calls.toast).toHaveBeenCalledWith("You left the room.", expect.anything())
  })

  it("asks the server only once at a time", async () => {
    const store = await freshStore()
    let answer: (value: unknown) => void = () => {}
    calls.getCurrentRoom.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    void store.checkCurrentRoom()
    void store.checkCurrentRoom()
    expect(calls.getCurrentRoom).toHaveBeenCalledTimes(1)
    answer(null)
    await store.checkCurrentRoom()
    expect(calls.leaveHostedRoom).toHaveBeenCalled()
  })
})
