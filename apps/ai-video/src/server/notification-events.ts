import { Client } from "pg"
import { sql } from "drizzle-orm"

import { db, getDatabaseUrl, type AiVideoDb } from "@/server/db"

// ---------------------------------------------------------------------------
// Real-time notification bus (Postgres LISTEN/NOTIFY).
//
// A notification is durable (the `notifications` row) — this bus only carries a
// lightweight "you have something new" nudge so a connected browser refetches
// its inbox immediately instead of waiting for the poll. The row is the source
// of truth; a missed nudge is caught by the client's slow fallback poll.
//
// Why LISTEN/NOTIFY and not an in-process EventEmitter: notification rows are
// created by any web request AND by background workers (creator-watch), which
// may run in a different process/instance than the one holding a user's stream.
// Postgres is the shared bus, so a NOTIFY reaches every instance's LISTEN
// connection with no extra infrastructure. Swap to Redis/Kafka only if event
// volume ever outgrows a single database.
//
// Delivery is race-free: `publishNotificationCreated` runs `pg_notify` on the
// caller's executor, so when it is a transaction the NOTIFY is deferred until
// (and only fires on) commit — the recipient's refetch always sees the row.
// ---------------------------------------------------------------------------

const CHANNEL = "ai_video_notification"
const RECONNECT_DELAY_MS = 2000

type Listener = () => void

type NotificationBus = {
  listenClient: Client | null
  listenersByUser: Map<string, Set<Listener>>
  starting: Promise<void> | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
}

// Held on globalThis so a dev-server module reload reuses the same LISTEN
// connection and subscriber set instead of leaking a new one each time.
const globals = globalThis as { __aiVideoNotificationBus?: NotificationBus }
const bus: NotificationBus = (globals.__aiVideoNotificationBus ??= {
  listenClient: null,
  listenersByUser: new Map(),
  starting: null,
  reconnectTimer: null,
})

function emitToUser(userId: string) {
  const listeners = bus.listenersByUser.get(userId)
  if (!listeners) return
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.error("Notification listener failed", error)
    }
  }
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
        // Events may have been missed while disconnected — tell every current
        // subscriber to resync so nothing is silently dropped.
        for (const userId of bus.listenersByUser.keys()) emitToUser(userId)
      })
      .catch((error) => {
        console.error("Notification LISTEN reconnect failed", error)
        scheduleReconnect()
      })
  }, RECONNECT_DELAY_MS)
  bus.reconnectTimer.unref?.()
}

// Lazily opens the shared LISTEN connection. Kept alive once started and
// auto-reconnected on error/close.
function ensureListening(): Promise<void> {
  if (bus.listenClient) return Promise.resolve()
  if (bus.starting) return bus.starting

  bus.starting = (async () => {
    const client = new Client({
      connectionString: getDatabaseUrl(),
      application_name: "ai_video_notifications_listen",
    })
    client.on("notification", (message) => {
      if (message.payload) emitToUser(message.payload)
    })
    client.on("error", (error) => {
      console.error("Notification LISTEN client error", error)
      scheduleReconnect()
    })
    client.on("end", () => {
      // Unexpected close (not one we initiated) — reconnect.
      if (bus.listenClient) scheduleReconnect()
    })
    await client.connect()
    await client.query(`LISTEN ${CHANNEL}`)
    bus.listenClient = client
  })()

  const pending = bus.starting
  pending.finally(() => {
    if (bus.starting === pending) bus.starting = null
  })
  return pending
}

// Registers a nudge callback for one user and ensures the LISTEN connection is
// up. Returns an unsubscribe function; call it when the stream closes.
export function subscribeToUserNotifications(
  userId: string,
  onEvent: Listener
): () => void {
  let listeners = bus.listenersByUser.get(userId)
  if (!listeners) {
    listeners = new Set()
    bus.listenersByUser.set(userId, listeners)
  }
  listeners.add(onEvent)

  void ensureListening().catch((error) =>
    console.error("Notification LISTEN start failed", error)
  )

  return () => {
    const current = bus.listenersByUser.get(userId)
    if (!current) return
    current.delete(onEvent)
    if (current.size === 0) bus.listenersByUser.delete(userId)
  }
}

// Announces that a notification row was created for a user. Best-effort — a
// failed publish never breaks the underlying action (the row still exists and
// the fallback poll will surface it). Pass the surrounding transaction as
// `database` so delivery is deferred to commit.
export async function publishNotificationCreated(
  userId: string,
  database: Pick<AiVideoDb, "execute"> = db
): Promise<void> {
  try {
    await database.execute(sql`select pg_notify(${CHANNEL}, ${userId})`)
  } catch (error) {
    console.error("Notification publish failed", error)
  }
}
