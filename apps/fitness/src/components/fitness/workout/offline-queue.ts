/**
 * Changes made in the logger while the phone has no signal, kept on the phone
 * until they can be sent.
 *
 * Each workout has its own queue in the browser's storage. A change that
 * fails because the phone is offline goes on the end, and the whole queue is
 * sent again, in order, when the browser says it is back online or the page
 * loads. A new set carries an id made on the phone, so sending it twice saves
 * it once. Two edits to the same set in a row are folded into one, so a long
 * stretch with no signal doesn't grow a long queue.
 *
 * Storage can be missing or refuse to write (a private window, a full disk),
 * so every read and write here is guarded and simply does nothing then.
 */

export type SetChange = Partial<{
  weightKg: number | null
  reps: number | null
  done: boolean
  note: string
}>

export type QueuedChange =
  | { kind: "saveSet"; setId: string; change: SetChange }
  | { kind: "addSet"; workoutId: string; position: number; id: string }
  | { kind: "removeSet"; setId: string }

export type QueueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

const PREFIX = "fitness-offline-queue:"

export function readQueue(storage: QueueStorage | null, workoutId: string): QueuedChange[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(PREFIX + workoutId)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as QueuedChange[]) : []
  } catch {
    return []
  }
}

export function writeQueue(storage: QueueStorage | null, workoutId: string, queue: QueuedChange[]) {
  if (!storage) return
  try {
    if (queue.length === 0) storage.removeItem(PREFIX + workoutId)
    else storage.setItem(PREFIX + workoutId, JSON.stringify(queue))
  } catch {
    // Nothing to do: the change stays on screen and the next save tries again.
  }
}

/** Adds a change to the end, folding it into the last one when both edit the same set. */
export function addToQueue(queue: readonly QueuedChange[], change: QueuedChange): QueuedChange[] {
  const last = queue[queue.length - 1]
  if (last?.kind === "saveSet" && change.kind === "saveSet" && last.setId === change.setId) {
    return [...queue.slice(0, -1), { ...last, change: { ...last.change, ...change.change } }]
  }
  if (change.kind === "removeSet") {
    // A set added and removed while offline never needs to reach the server.
    const added = queue.findIndex((item) => item.kind === "addSet" && item.id === change.setId)
    if (added >= 0) {
      return queue.filter(
        (item, index) => index !== added && !(item.kind === "saveSet" && item.setId === change.setId)
      )
    }
  }
  return [...queue, change]
}

/**
 * True when a failed request failed because there is no connection, rather
 * than because the server said no. A refusal must not be queued: it would be
 * refused again on every replay.
 */
export function isOfflineFailure(error: unknown, online: boolean): boolean {
  if (!online) return true
  if (error instanceof TypeError) return true
  const message = error instanceof Error ? error.message : ""
  return /failed to fetch|networkerror|network request failed|load failed/i.test(message)
}

/**
 * Sends the queue in order. Stops at the first change that fails for lack of a
 * connection and keeps it and everything after it. A change the server
 * refuses is dropped and reported, so one bad change never blocks the rest.
 */
export async function replayQueue(
  queue: readonly QueuedChange[],
  send: (change: QueuedChange) => Promise<unknown>,
  { online, onRefused }: { online: () => boolean; onRefused: (error: unknown) => void }
): Promise<{ left: QueuedChange[]; sent: number }> {
  let sent = 0
  for (let index = 0; index < queue.length; index += 1) {
    try {
      await send(queue[index])
      sent += 1
    } catch (error) {
      if (isOfflineFailure(error, online())) return { left: queue.slice(index), sent }
      onRefused(error)
    }
  }
  return { left: [], sent }
}

/** Drops the queue for a workout once it is finished or deleted. */
export function forgetQueue(storage: QueueStorage | null, workoutId: string) {
  if (!storage) return
  try {
    storage.removeItem(PREFIX + workoutId)
  } catch {
    // Left behind, an empty queue does nothing.
  }
}

/** The browser's storage, or null where it can't be reached. */
export function browserStorage(): QueueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}
