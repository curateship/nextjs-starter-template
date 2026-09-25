import { sql, type SQL } from "drizzle-orm"
import { Client } from "pg"

import { db, getDatabaseUrl } from "@/server/db"

// ---------------------------------------------------------------------------
// The live bell's messenger (Postgres LISTEN/NOTIFY).
//
// The `notifications` row is the truth; this only carries a "you have something
// new" nudge so a browser that is already open refetches straight away instead
// of waiting for its slow poll. A nudge that goes missing costs a minute, never
// a notice — the row is still there and the poll still finds it.
//
// Why Postgres and not an in-process event emitter: notices are written by web
// requests *and* by the automation ticker, which is a background loop that can
// be running in a different process than the one holding a person's stream. An
// emitter only reaches its own process. Every process is already connected to
// this database, so a NOTIFY reaches all of them with nothing new to run.
//
// Delivery cannot race the row: `publishNotificationCreated` runs `pg_notify`
// on the caller's own executor, so inside a transaction the nudge is held back
// until the transaction commits — and never sent at all if it rolls back. By
// the time a browser reacts, the row it is going to read is already there.
// ---------------------------------------------------------------------------

const CHANNEL = "custom_shell_notification"
const RECONNECT_DELAY_MS = 2000

/**
 * Whatever is going to run the announcement: the shared database handle, or —
 * the point of this — the transaction the caller is already inside. Named by
 * the one thing it has to be able to do rather than by a driver, so a caller
 * can hand over its transaction whichever driver it came from.
 */
export type NotificationPublisher = {
  execute: (query: SQL) => Promise<unknown>
}

type Listener = () => void

type NotificationBus = {
  listenClient: Client | null
  listenersByUser: Map<string, Set<Listener>>
  starting: Promise<void> | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
}

// Parked on globalThis so a dev-server module reload reuses the same listening
// connection and the same set of subscribers, instead of leaking a new one on
// every edit.
const globals = globalThis as { __customShellNotificationBus?: NotificationBus }
const bus: NotificationBus = (globals.__customShellNotificationBus ??= {
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
        // Anything published while the connection was down was announced to
        // nobody, and no second announcement is ever coming for it. So nudge
        // every current subscriber to go and look, rather than leaving them
        // quietly out of date.
        for (const userId of bus.listenersByUser.keys()) emitToUser(userId)
      })
      .catch((error) => {
        console.error("Notification LISTEN reconnect failed", error)
        scheduleReconnect()
      })
  }, RECONNECT_DELAY_MS)
  bus.reconnectTimer.unref?.()
}

/**
 * Opens the listening connection, once, and keeps it up.
 *
 * **Its own `new Client`, never one out of the pool.** The pool is 10 wide and
 * the audit-log page has already run it dry once; a listener that held a pooled
 * connection would take a permanent tenth of the app's database capacity for as
 * long as the server is up. Outside the pool, the whole feature costs one
 * connection per server process no matter how many browsers are open.
 * `notification-events.test.ts` fails if that ever drifts.
 */
function ensureListening(): Promise<void> {
  if (bus.listenClient) return Promise.resolve()
  if (bus.starting) return bus.starting

  bus.starting = (async () => {
    const client = new Client({
      connectionString: getDatabaseUrl(),
      application_name: "custom_shell_notifications_listen",
    })
    client.on("notification", (message) => {
      if (message.payload) emitToUser(message.payload)
    })
    client.on("error", (error) => {
      console.error("Notification LISTEN client error", error)
      scheduleReconnect()
    })
    client.on("end", () => {
      // A close we did not ask for — get back on.
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

/**
 * Registers a nudge callback for one person and makes sure the connection is
 * up. Returns the unsubscribe — the stream route must call it when the browser
 * goes away, or the set grows a dead entry per tab that was ever opened.
 */
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

/**
 * Says a notice was just written for somebody.
 *
 * Never fatal: the row is what matters and it is already written, so a failure
 * here is logged and the action carries on. Pass the surrounding transaction as
 * `database` wherever there is one, so the nudge waits for the commit.
 */
export async function publishNotificationCreated(
  userId: string,
  database: NotificationPublisher = db
): Promise<void> {
  return publishNotificationCreatedMany([userId], database)
}

/**
 * The same, for a notice written to many people at once — publishing a
 * changelog entry drops one in every single account's tray. One statement
 * rather than one per person, so a thousand accounts is still a single round
 * trip to the database.
 */
export async function publishNotificationCreatedMany(
  userIds: string[],
  database: NotificationPublisher = db
): Promise<void> {
  const recipients = Array.from(new Set(userIds))
  if (!recipients.length) return

  // Each id its own bound parameter, listed as rows the one statement walks.
  const rows = sql.join(
    recipients.map((userId) => sql`(${userId})`),
    sql`, `
  )

  try {
    await database.execute(
      sql`select pg_notify(${CHANNEL}, recipient) from (values ${rows}) as recipients(recipient)`
    )
  } catch (error) {
    console.error("Notification publish failed", error)
  }
}
