import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The shared room listener against a stand-in connection: what matters is how
 * many connections open, which channels are listened to, and who hears a
 * NOTIFY. A real Postgres LISTEN is not available in the in-memory database
 * the rest of the tests use.
 */
const clients = vi.hoisted(() => [] as FakeClient[])

type FakeClient = {
  queries: string[]
  handlers: Map<string, (message: { channel: string }) => void>
  notify: (channel: string) => void
}

vi.mock("pg", () => ({
  Client: class {
    queries: string[] = []
    handlers = new Map<string, (message: { channel: string }) => void>()
    constructor() {
      clients.push(this as unknown as FakeClient)
    }
    on(event: string, handler: (message: { channel: string }) => void) {
      this.handlers.set(event, handler)
      return this
    }
    async connect() {}
    async query(text: string) {
      this.queries.push(text)
    }
    notify(channel: string) {
      this.handlers.get("notification")?.({ channel })
    }
    removeAllListeners() {}
    async end() {}
  },
}))

vi.mock("@/server/db", () => ({ getDatabaseUrl: () => "postgres://test" }))
vi.mock("@/server/pomodoro/rooms", () => ({
  roomChannel: (roomId: string) => `pomodoro_room_${roomId}`,
}))

async function load() {
  vi.resetModules()
  delete (globalThis as { __pomodoroRoomEventBus?: unknown })
    .__pomodoroRoomEventBus
  return import("./room-events")
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  clients.length = 0
})

describe("the shared room listener", () => {
  it("serves ten pages over one connection and tells every page of the room", async () => {
    const { subscribeToRoom } = await load()
    const heard: string[] = []
    const stops = Array.from({ length: 10 }, (_, index) =>
      subscribeToRoom(index < 6 ? "a" : "b", `user-${index}`, () =>
        heard.push(`page-${index}`)
      )
    )
    await settle()
    expect(clients).toHaveLength(1)
    clients[0]!.notify("pomodoro_room_a")
    expect(heard).toEqual(["page-0", "page-1", "page-2", "page-3", "page-4", "page-5"])
    for (const stop of stops) stop?.()
  })

  it("listens while a room is watched and stops when the last page leaves", async () => {
    const { subscribeToRoom } = await load()
    const heard: string[] = []
    const first = subscribeToRoom("a", "user-1", () => heard.push("first"))
    const second = subscribeToRoom("a", "user-2", () => heard.push("second"))
    await settle()
    first?.()
    await settle()
    expect(clients[0]!.queries.filter((q) => q === "UNLISTEN pomodoro_room_a")).toHaveLength(0)
    second?.()
    await settle()
    expect(clients[0]!.queries.at(-1)).toBe("UNLISTEN pomodoro_room_a")
    clients[0]!.notify("pomodoro_room_a")
    expect(heard).toEqual([])
  })

  it("lets one account hold three pages, refuses a fourth, and frees a place on close", async () => {
    const { subscribeToRoom, MAX_ROOM_STREAMS_PER_USER } = await load()
    expect(MAX_ROOM_STREAMS_PER_USER).toBe(3)
    const open = [1, 2, 3].map(() => subscribeToRoom("a", "user-1", () => {}))
    expect(open.every(Boolean)).toBe(true)
    expect(subscribeToRoom("b", "user-1", () => {})).toBeNull()
    expect(subscribeToRoom("a", "user-2", () => {})).not.toBeNull()
    open[0]!()
    open[0]!()
    expect(subscribeToRoom("a", "user-1", () => {})).not.toBeNull()
    expect(subscribeToRoom("a", "user-1", () => {})).toBeNull()
  })
})
