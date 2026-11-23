// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const save = vi.fn()
vi.mock("@/lib/api/note/notes", async () => {
  const { LIBRARY_SAYS } = await import("@/lib/note/library/notes")
  return {
    saveNoteChanges: (...args: unknown[]) => save(...args),
    isChangedElsewhere: (error: unknown) => error instanceof Error && error.message.includes(LIBRARY_SAYS.changedElsewhere),
  }
})
vi.mock("@/lib/api/note/library", () => ({
  getLibraryErrorMessage: (error: unknown) =>
    error instanceof Error && error.message.includes("too long") ? error.message : "That did not work. Try again in a moment.",
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))

import { LIBRARY_SAYS } from "@/lib/note/library/notes"
import { keptChangesKey, readKeptChanges, useNoteAutosave } from "@/lib/note/notes/use-note-autosave"

/**
 * Saving an open note: it waits 700ms after the last change, keeps the
 * change in the browser and tries again when the connection drops, and stops
 * to ask when another tab saved first.
 */

let host: HTMLDivElement
let root: Root
let hook: ReturnType<typeof useNoteAutosave>
/** Hands the hook out of the component, so each test can drive it. */
const keepHook = (next: ReturnType<typeof useNoteAutosave>) => {
  hook = next
}

function Harness({ revision = 3, conflict = false }: { revision?: number; conflict?: boolean }) {
  keepHook(
    useNoteAutosave({
      noteId: "n1",
      revision,
      startInConflict: conflict,
      onSaved: () => undefined,
    })
  )
  return null
}

const card = { id: "n1" }

beforeEach(() => {
  vi.useFakeTimers()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  save.mockReset()
  window.localStorage.clear()
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  vi.useRealTimers()
})

describe("useNoteAutosave", () => {
  it("saves 700ms after the last change, with the revision it started from", async () => {
    save.mockResolvedValue({ revision: 4, card, words: 1 })
    await act(async () => root.render(<Harness />))
    await act(async () => {
      hook.change({ title: "A" })
      hook.change({ title: "AB" })
    })
    await act(async () => vi.advanceTimersByTime(699))
    expect(save).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ id: "n1", revision: 3, title: "AB" })
    expect(hook.status).toBe("saved")
    expect(readKeptChanges("n1")).toBeNull()
  })

  it("waits for a save on its way, then sends what was typed meanwhile before a flush ends", async () => {
    let finishFirst: (value: unknown) => void = () => undefined
    save
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValue({ revision: 5, card, words: 2 })
    await act(async () => root.render(<Harness />))
    await act(async () => {
      hook.change({ title: "First" }, true)
    })
    let flushed = false
    await act(async () => {
      hook.change({ title: "First and second" })
      void hook.flush().then(() => (flushed = true))
    })
    // The flush has not finished: the first save is still on its way.
    expect(flushed).toBe(false)
    await act(async () => {
      finishFirst({ revision: 4, card, words: 1 })
    })
    expect(flushed).toBe(true)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith({ id: "n1", revision: 4, title: "First and second" })
  })

  it("keeps the change in the browser when the connection drops, and sends it once back", async () => {
    save.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue({ revision: 4, card, words: 1 })
    await act(async () => root.render(<Harness />))
    await act(async () => {
      hook.change({ title: "Offline words" }, true)
    })
    expect(hook.status).toBe("offline")
    expect(readKeptChanges("n1")).toMatchObject({ revision: 3, changes: { title: "Offline words" } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(save).toHaveBeenCalledTimes(2)
    expect(hook.status).toBe("saved")
    expect(window.localStorage.getItem(keptChangesKey("n1"))).toBeNull()
  })

  it("stops and asks when another tab saved first, and sends on the newer revision once told to", async () => {
    save
      .mockRejectedValueOnce(new Error(LIBRARY_SAYS.changedElsewhere))
      .mockResolvedValue({ revision: 9, card, words: 1 })
    await act(async () => root.render(<Harness />))
    await act(async () => {
      hook.change({ title: "Mine" }, true)
    })
    expect(hook.status).toBe("conflict")
    // Typing on while the question is up never sends.
    await act(async () => {
      hook.change({ title: "Mine still" })
      await vi.advanceTimersByTimeAsync(2_000)
    })
    expect(save).toHaveBeenCalledTimes(1)
    await act(async () => {
      hook.keepMine(8)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(save).toHaveBeenLastCalledWith({ id: "n1", revision: 8, title: "Mine still" })
    expect(hook.status).toBe("saved")
  })

  it("tries a save the server refuses once, not again until the next change", async () => {
    save.mockRejectedValue(new Error("That note is too long to save. Split it into two notes."))
    await act(async () => root.render(<Harness />))
    await act(async () => {
      hook.change({ title: "Huge" }, true)
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(hook.status).toBe("idle")
    await act(async () => {
      hook.change({ title: "Shorter" }, true)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(save).toHaveBeenCalledTimes(2)
  })

  it("saves once more when the note closes, and never retries from a closed note", async () => {
    save.mockRejectedValue(new TypeError("Failed to fetch"))
    await act(async () => root.render(<Harness />))
    await act(async () => {
      hook.change({ title: "Typed then closed" })
    })
    await act(async () => root.unmount())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(readKeptChanges("n1")).toMatchObject({ changes: { title: "Typed then closed" } })
    root = createRoot(host)
  })

  it("throws the unsaved change away on Use the other version", async () => {
    await act(async () => root.render(<Harness conflict />))
    expect(hook.status).toBe("conflict")
    await act(async () => {
      hook.change({ title: "Lost" })
      hook.discard()
    })
    expect(hook.status).toBe("idle")
    expect(readKeptChanges("n1")).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })
})
