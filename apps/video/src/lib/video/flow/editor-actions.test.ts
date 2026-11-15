import { describe, expect, it } from "vitest"

import { timelineSchema } from "@/lib/video/timeline-schema"

import {
  actionsToTracks,
  describeEditorPlan,
  editorAnswerSchema,
  editorPrice,
  editorProblems,
  expandActions,
  makingActions,
  type EditorFile,
} from "./editor-actions"

/** The Pomodoro test run: 2 rounds of 2 minutes' focus and 1 minute's break. */
const answer = editorAnswerSchema.parse({
  title: "Study with me",
  frame: "16:9",
  actions: [
    { do: "animate_picture", id: "L1", file: "P1", prompt: "only the rain moves", seconds: 8 },
    { do: "make_sound", id: "RAIN", words: "steady rain on a window", seconds: 30, loop: true },
    {
      do: "repeat",
      times: 2,
      every: 180,
      actions: [
        { do: "place", file: "L1", from: 0, to: 180, role: "background", loop: true },
        { do: "timer", from: 0, to: 120, above: "FOCUS", below: "Round {n}/2" },
        { do: "timer", from: 120, to: 180, above: "BREAK", below: "Round {n}/2" },
        { do: "make_music", id: "M{n}", mood: "warm lofi, round {n}", seconds: 60 },
        { do: "place", file: "M{n}", from: 0, to: 120, role: "music", crossfade: 3, volume: 0.6 },
        { do: "starter_sound", sound: "chime", at: 120 },
      ],
    },
    { do: "place", file: "RAIN", from: 0, to: 360, role: "ambience", loop: true, volume: 0.35 },
  ],
})

const files = { pictures: ["P1"], footage: [], sounds: [] }

describe("the AI editor's answer", () => {
  it("keeps AI video's old answer as it was", () => {
    const old = editorAnswerSchema.parse({ title: "Cut", captions: true, segments: [{ file: "F1", start: 1, end: 2 }] })
    expect(old.actions).toEqual([])
    expect(old.segments).toHaveLength(1)
  })

  it("lays out repeats, moving their times and filling in the round", () => {
    const actions = expandActions(answer)
    const timers = actions.filter((action) => action.do === "timer")
    expect(timers.map((timer) => [timer.from, timer.to, timer.above, timer.below])).toEqual([
      [0, 120, "FOCUS", "Round 1/2"],
      [120, 180, "BREAK", "Round 1/2"],
      [180, 300, "FOCUS", "Round 2/2"],
      [300, 360, "BREAK", "Round 2/2"],
    ])
    expect(makingActions(actions).map((action) => action.id)).toEqual(["L1", "RAIN", "M1", "M2"])
    expect(expandActions({ actions: [{ do: "repeat", times: 4, every: 1, start: 0, actions: [{ do: "marker", at: 0, label: "L{n%3}" }] }] }).map((action) => (action.do === "marker" ? action.label : ""))).toEqual(["L1", "L2", "L3", "L1"])
  })

  it("finds nothing wrong with a good plan, and names what is wrong with a bad one", () => {
    expect(editorProblems(answer, files)).toEqual([])
    const bad = editorAnswerSchema.parse({
      actions: [
        { do: "animate_picture", id: "L1", file: "P9", prompt: "x" },
        { do: "make_music", id: "L1", mood: "x", seconds: 60 },
        { do: "place", file: "NOPE", from: 10, to: 5, role: "music" },
      ],
    })
    const problems = editorProblems(bad, files)
    expect(problems.some((line) => line.includes("P9"))).toBe(true)
    expect(problems.some((line) => line.includes("used twice"))).toBe(true)
    expect(problems.some((line) => line.includes("NOPE"))).toBe(true)
    expect(problems.some((line) => line.includes('"to" must be after'))).toBe(true)
  })

  it("prices what it makes, and says the plan in plain words", () => {
    const price = editorPrice(expandActions(answer))
    expect(price.each.map((item) => item.id)).toEqual(["L1", "RAIN", "M1", "M2"])
    // Two minutes of music at $0.30 a minute and 30 s of rain at $0.12 a minute.
    expect(price.each.find((item) => item.id === "M1")!.cents).toBe(30)
    expect(price.each.find((item) => item.id === "RAIN")!.cents).toBe(6)
    const plan = describeEditorPlan(answer)
    expect(plan.lengthSeconds).toBe(360)
    expect(plan.text).toContain("Study with me: 6:00 long")
    expect(plan.text).toContain("L1: P1 moving, 8 s, looping, seedance 1080p")
    expect(plan.text).toContain("Lays: 5 files placed, 4 timers, 2 starter sounds.")
    expect(plan.cents).toBe(price.cents)
  })

  it("lays it as lanes the timeline takes, timers on top and nothing ducked", () => {
    const made = new Map<string, EditorFile>([
      ["L1", { mediaId: "loop", name: "Loop", kind: "video", durationMs: 8000 }],
      ["RAIN", { mediaId: "rain", name: "Rain", kind: "audio", durationMs: 30_000 }],
      ["M1", { mediaId: "m1", name: "Lofi 1", kind: "audio", durationMs: 60_000 }],
      ["M2", { mediaId: "m2", name: "Lofi 2", kind: "audio", durationMs: 60_000 }],
    ])
    let next = 0
    const { tracks, usedMediaIds } = actionsToTracks(expandActions(answer), made, { aspect: "16:9", newId: () => `id-${next++}` })
    const timeline = timelineSchema.parse({ aspect: "16:9", tracks })
    expect(timeline.tracks.every((track) => !track.duck)).toBe(true)
    // Timers first, then the looped background, then music, rain, chimes.
    expect(timeline.tracks[0].clips.every((clip) => clip.shape === "timer")).toBe(true)
    const background = timeline.tracks[1].clips
    expect(background).toHaveLength(2)
    expect(background[0]).toMatchObject({ kind: "video", loop: true, startMs: 0, durationMs: 180_000, muted: true })
    const rain = timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.mediaId === "rain")!
    expect(rain).toMatchObject({ loop: true, startMs: 0, durationMs: 360_000, volume: 0.35 })
    // Music shorter than its stretch blends into its next copy on two lanes.
    const music = timeline.tracks.flatMap((track) => track.clips).filter((clip) => clip.mediaId === "m1")
    expect(music.length).toBe(3)
    expect(music.some((clip) => clip.fadeInMs === 3000)).toBe(true)
    const chimes = timeline.tracks.flatMap((track) => track.clips).filter((clip) => clip.stockSound === "chime")
    expect(chimes.map((clip) => clip.startMs)).toEqual([120_000, 300_000])
    expect(usedMediaIds.sort()).toEqual(["loop", "m1", "m2", "rain"])
  })
})
