import { Client } from "pg"

import { getDatabaseUrl } from "@/server/db"
import { roomChannel } from "@/server/pomodoro/rooms"

// ---------------------------------------------------------------------------
// One listening connection for every open room page in this server process.
//
// Each room has its own pg_notify channel (`roomChannel`), and joins, leaves,
// chat, host actions and the fifteen-second clock all NOTIFY it. A room page
// used to open a database connection of its own to hear that, so 100 people
// watching rooms held 100 connections and one account opening many tabs could
// run the database out. Here the whole feature costs one connection per
// process: the connection LISTENs to a room's channel while at least one page
// watches that room, and UNLISTENs when the last one leaves.
//
// Like the bell's listener (`src/server/notifications/events.ts`), it is its
// own `new Client`, never one out of the 10-wide pool, so it cannot take a
// permanent share of the app's database capacity.
// ---------------------------------------------------------------------------

/** How many room pages one account may hold open on one server process. */
export const MAX_ROOM_STREAMS_PER_USER = 3
const RECONNECT_DELAY_MS = 2000

type Listener = () => void

type RoomEventBus = {
  listenClient: Client | null
  starting: Promise<void> | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  listenersByRoom: Map<string, Set<Listener>>
  roomByChannel: Map<string, string>
  streamsByUser: Map<string, number>
}

// Parked on globalThis so a dev-server module reload reuses the same
// connection and subscribers instead of leaking a new one on every edit.
const globals = globalThis as { __pomodoroRoomEventBus?: RoomEventBus }
const bus: RoomEventBus = (globals.__pomodoroRoomEventBus ??= {
  listenClient: null,
  starting: null,
  reconnectTimer: null,
  listenersByRoom: new Map(),
  roomByChannel: new Map(),
  streamsByUser: new Map(),
})

function emitToRoom(roomId: string) {
  const listeners = bus.listenersByRoom.get(roomId)
  if (!listeners) return
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.error("Room event listener failed", error)
    }
  }
}

function handleNotification(message: { channel: string }) {
  const roomId = bus.roomByChannel.get(message.channel)
  if (roomId) emitToRoom(roomId)
}

// A dev-server reload keeps the connection above with the last run's handler.
if (bus.listenClient) {
  bus.listenClient.removeAllListeners("notification")
  bus.listenClient.on("notification", handleNotification)
}

function scheduleReconnect() {
  if (bus.listenClient) {
    const dead = bus.listenClient
    bus.listenClient = null
    dead.removeAllListeners()
    dead.end().catch(() => undefined)
  }
  if (bus.reconnectTimer) return
  bus.reconnectTimer = setTimeout(() => {
    bus.reconnectTimer = null
    ensureListening()
      .then(() => {
        // Whatever changed while the connection was down was announced to
        // nobody, so every open page reads its room again.
        for (const roomId of bus.listenersByRoom.keys()) emitToRoom(roomId)
      })
      .catch((error) => {
        console.error("Room LISTEN reconnect failed", error)
        scheduleReconnect()
      })
  }, RECONNECT_DELAY_MS)
  bus.reconnectTimer.unref?.()
}

function ensureListening(): Promise<void> {
  if (bus.listenClient) return Promise.resolve()
  if (bus.starting) return bus.starting

  bus.starting = (async () => {
    const client = new Client({
      connectionString: getDatabaseUrl(),
      application_name: "pomodoro_room_events_listen",
    })
    client.on("notification", handleNotification)
    client.on("error", (error) => {
      console.error("Room LISTEN client error", error)
      scheduleReconnect()
    })
    client.on("end", () => {
      if (bus.listenClient) scheduleReconnect()
    })
    await client.connect()
    for (const channel of bus.roomByChannel.keys()) {
      await client.query(`LISTEN ${channel}`)
    }
    bus.listenClient = client
  })()

  const pending = bus.starting
  pending.finally(() => {
    if (bus.starting === pending) bus.starting = null
  })
  return pending
}

/**
 * Brings the connection in line with who is watching one room. It reads the
 * state when it runs, not when it was asked, and the connection runs queries
 * in the order they were sent, so a quick open-close-open still ends
 * listening. LISTEN and UNLISTEN are both safe to repeat.
 */
function syncRoom(roomId: string) {
  const channel = roomChannel(roomId)
  return ensureListening().then(async () => {
    const client = bus.listenClient
    if (!client) return
    const watched = bus.listenersByRoom.has(roomId)
    await client.query(`${watched ? "LISTEN" : "UNLISTEN"} ${channel}`)
  })
}

/**
 * Starts hearing one room for one open page. Answers null when the account
 * already has `MAX_ROOM_STREAMS_PER_USER` pages open on this process; otherwise
 * answers the stop, which the stream must call when the page goes away.
 */
export function subscribeToRoom(
  roomId: string,
  userId: string,
  onEvent: Listener
): (() => void) | null {
  const open = bus.streamsByUser.get(userId) ?? 0
  if (open >= MAX_ROOM_STREAMS_PER_USER) return null
  bus.streamsByUser.set(userId, open + 1)

  let listeners = bus.listenersByRoom.get(roomId)
  if (!listeners) {
    listeners = new Set()
    bus.listenersByRoom.set(roomId, listeners)
    bus.roomByChannel.set(roomChannel(roomId), roomId)
  }
  listeners.add(onEvent)
  void syncRoom(roomId).catch((error) =>
    console.error("Room LISTEN start failed", error)
  )

  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    const left = (bus.streamsByUser.get(userId) ?? 1) - 1
    if (left > 0) bus.streamsByUser.set(userId, left)
    else bus.streamsByUser.delete(userId)
    const current = bus.listenersByRoom.get(roomId)
    if (!current) return
    current.delete(onEvent)
    if (current.size > 0) return
    bus.listenersByRoom.delete(roomId)
    bus.roomByChannel.delete(roomChannel(roomId))
    void syncRoom(roomId).catch((error) =>
      console.error("Room UNLISTEN failed", error)
    )
  }
}
