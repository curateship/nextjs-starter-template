import { describe, expect, it } from "vitest"

import {
  addToQueue,
  isOfflineFailure,
  readQueue,
  replayQueue,
  writeQueue,
  type QueuedChange,
  type QueueStorage,
} from "@/components/fitness/workout/offline-queue"

function memoryStorage(): QueueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

describe("offline queue", () => {
  it("folds two edits to the same set into one", () => {
    let queue: QueuedChange[] = []
    queue = addToQueue(queue, { kind: "saveSet", setId: "a", change: { reps: 5 } })
    queue = addToQueue(queue, { kind: "saveSet", setId: "a", change: { done: true } })
    expect(queue).toEqual([{ kind: "saveSet", setId: "a", change: { reps: 5, done: true } }])
  })

  it("drops a set that was added and removed while offline", () => {
    let queue: QueuedChange[] = []
    queue = addToQueue(queue, { kind: "addSet", workoutId: "w", position: 0, id: "new" })
    queue = addToQueue(queue, { kind: "saveSet", setId: "new", change: { reps: 8 } })
    queue = addToQueue(queue, { kind: "removeSet", setId: "new" })
    expect(queue).toEqual([])
  })

  it("survives a round trip through storage and clears when empty", () => {
    const storage = memoryStorage()
    writeQueue(storage, "w", [{ kind: "removeSet", setId: "x" }])
    expect(readQueue(storage, "w")).toEqual([{ kind: "removeSet", setId: "x" }])
    writeQueue(storage, "w", [])
    expect(storage.data.size).toBe(0)
    expect(readQueue(null, "w")).toEqual([])
  })

  it("reads a broken stored value as an empty queue", () => {
    const storage = memoryStorage()
    storage.setItem("fitness-offline-queue:w", "{not json")
    expect(readQueue(storage, "w")).toEqual([])
  })

  it("tells a lost connection from a refusal", () => {
    expect(isOfflineFailure(new Error("anything"), false)).toBe(true)
    expect(isOfflineFailure(new TypeError("Failed to fetch"), true)).toBe(true)
    expect(isOfflineFailure(new Error("That set no longer exists."), true)).toBe(false)
  })

  it("replays in order, stops at a lost connection and drops a refusal", async () => {
    const queue: QueuedChange[] = [
      { kind: "saveSet", setId: "a", change: { done: true } },
      { kind: "removeSet", setId: "gone" },
      { kind: "saveSet", setId: "b", change: { done: true } },
      { kind: "saveSet", setId: "c", change: { done: true } },
    ]
    const sent: string[] = []
    const refused: unknown[] = []
    const result = await replayQueue(
      queue,
      async (change) => {
        const id = change.kind === "addSet" ? change.id : change.setId
        if (id === "gone") throw new Error("That set no longer exists.")
        if (id === "c") throw new TypeError("Failed to fetch")
        sent.push(id)
      },
      { online: () => true, onRefused: (error) => refused.push(error) }
    )
    expect(sent).toEqual(["a", "b"])
    expect(refused).toHaveLength(1)
    expect(result).toEqual({ left: [queue[3]], sent: 2 })
  })
})
