import { describe, expect, it } from "vitest"

import {
  createInitialEditorState,
  editorReducer,
} from "@/components/video-editor/editor-store"
import { timelineStretch } from "@/lib/video/export-stretch"
import {
  addMarker,
  changeMarker,
  markersInStretch,
  MAX_TIMELINE_MARKERS,
  shiftMarkers,
  type TimelineMarker,
} from "@/lib/video/timeline-markers"
import { requireCanonicalTimeline } from "@/lib/video/timeline-schema"

const pin = (id: string, atMs: number, name = ""): TimelineMarker => ({ id, atMs, name })

describe("pins on the ruler", () => {
  it("keeps them in time order and ignores a second pin on the same moment", () => {
    const one = addMarker([], pin("b", 5_000))!
    const two = addMarker(one, pin("a", 1_000))!
    expect(two.map((marker) => marker.id)).toEqual(["a", "b"])
    expect(addMarker(two, pin("c", 5_000))).toBe(two)
  })

  it("refuses a pin past the limit", () => {
    const full = Array.from({ length: MAX_TIMELINE_MARKERS }, (_, index) => pin(`m${index}`, index * 10))
    expect(addMarker(full, pin("over", 99_999))).toBeNull()
  })

  it("trims a name and re-sorts a moved pin", () => {
    const markers = changeMarker([pin("a", 0), pin("b", 9_000)], "a", { atMs: 12_000, name: "  Outro  " })
    expect(markers).toEqual([pin("b", 9_000), pin("a", 12_000, "Outro")])
  })

  it("moves pins after a moment later, and leaves earlier ones", () => {
    expect(shiftMarkers([pin("a", 1_000), pin("b", 8_000)], 5_000, 10_000)).toEqual([
      pin("a", 1_000),
      pin("b", 18_000),
    ])
  })

  it("keeps only the pins inside an exported part, counted from its start", () => {
    expect(markersInStretch([pin("a", 1_000), pin("b", 30_000), pin("c", 60_000)], 20_000, 60_000)).toEqual([
      pin("b", 10_000),
    ])
    const part = timelineStretch(
      { aspect: "9:16" as const, tracks: [], markers: [pin("a", 25_000, "Middle")] },
      20_000,
      40_000
    )
    expect(part.markers).toEqual([pin("a", 5_000, "Middle")])
  })

  it("is saved with the timeline and refused when malformed", () => {
    const saved = requireCanonicalTimeline({ aspect: "9:16", tracks: [], markers: [pin("a", 0, "Intro")] })
    expect(saved.markers).toEqual([pin("a", 0, "Intro")])
    expect(() => requireCanonicalTimeline({ aspect: "9:16", tracks: [], markers: [{ id: "a", atMs: -1, name: "" }] })).toThrow()
  })
})

describe("pins in the editor", () => {
  it("drops, renames and deletes, each one Undo step", () => {
    let state = createInitialEditorState({ aspect: "9:16", tracks: [] })
    state = editorReducer(state, { type: "ADD_MARKER", marker: pin("a", 4_000) })
    state = editorReducer(state, { type: "UPDATE_MARKER", markerId: "a", patch: { name: "Hook" } })
    expect(state.markers).toEqual([pin("a", 4_000, "Hook")])
    state = editorReducer(state, { type: "REMOVE_MARKER", markerId: "a" })
    expect(state.markers).toEqual([])

    state = editorReducer(state, { type: "UNDO" })
    expect(state.markers).toEqual([pin("a", 4_000, "Hook")])
    state = editorReducer(state, { type: "UNDO" })
    expect(state.markers).toEqual([pin("a", 4_000)])
    state = editorReducer(state, { type: "REDO" })
    expect(state.markers).toEqual([pin("a", 4_000, "Hook")])
  })

  it("leaves the pins alone when a clip edit is undone", () => {
    let state = createInitialEditorState({ aspect: "9:16", tracks: [], markers: [pin("a", 0)] })
    state = editorReducer(state, { type: "ADD_TRACK" })
    state = editorReducer(state, { type: "UNDO" })
    expect(state.markers).toEqual([pin("a", 0)])
  })
})
