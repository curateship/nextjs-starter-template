import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  editorViewStorageKey,
  readEditorView,
  updateEditorView,
} from "./editor-view-memory"

function fakeStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

const timeline = {
  pxPerSecond: 42,
  scrollLeft: 1200,
  scrollTop: 64,
  selectedClipId: "clip-1",
  playheadMs: 8250,
}

describe("editor view memory", () => {
  beforeEach(() => vi.stubGlobal("localStorage", fakeStorage()))
  afterEach(() => vi.unstubAllGlobals())

  it("gives each person their own view of the same project", () => {
    updateEditorView(editorViewStorageKey("amy", "p1"), { timeline })
    expect(readEditorView(editorViewStorageKey("amy", "p1"))).toEqual({
      timeline,
    })
    expect(readEditorView(editorViewStorageKey("ben", "p1"))).toEqual({})
    expect(readEditorView(editorViewStorageKey("amy", "p2"))).toEqual({})
  })

  it("keeps the timeline when the panel is saved, and the other way round", () => {
    const key = editorViewStorageKey("amy", "p1")
    updateEditorView(key, { timeline })
    updateEditorView(key, { panel: "music" })
    expect(readEditorView(key)).toEqual({ timeline, panel: "music" })
    updateEditorView(key, { timeline: { ...timeline, scrollLeft: 0 } })
    expect(readEditorView(key)).toEqual({
      timeline: { ...timeline, scrollLeft: 0 },
      panel: "music",
    })
  })

  it("treats anything that is not a view as nothing remembered", () => {
    const key = editorViewStorageKey("amy", "p1")
    localStorage.setItem(key, "not json")
    expect(readEditorView(key)).toEqual({})
    localStorage.setItem(
      key,
      JSON.stringify({ timeline: { ...timeline, pxPerSecond: -5 } })
    )
    expect(readEditorView(key)).toEqual({})
  })

  it("keeps working when storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    })
    const key = editorViewStorageKey("amy", "p1")
    expect(() => updateEditorView(key, { timeline })).not.toThrow()
    expect(readEditorView(key)).toEqual({})
  })
})
