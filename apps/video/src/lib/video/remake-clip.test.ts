import { describe, expect, it } from "vitest"

import { DEFAULT_CAPTION_LOOK } from "@/lib/video/caption-look"

import type { VoiceOrigin } from "@/lib/video/clip-origin"
import { landVoiceLine, voiceOrigin, type SpokenLine } from "@/lib/video/remake-clip"
import { MAX_TIMELINE_TRACKS, type ProjectTimeline } from "@/lib/video/timeline-schema"

type Tracks = ProjectTimeline["tracks"]
type Clip = Tracks[number]["clips"][number]

const origin: VoiceOrigin = {
  tool: "voice",
  model: "eleven_multilingual_v2",
  prompt: "Scene four. Hands out of frame.",
  voice: { id: "rachel", name: "Rachel", speaker: "elevenlabs" },
}

function caption(id: string, startMs: number, durationMs: number, text: string): Clip {
  return {
    id,
    kind: "text",
    name: text,
    text,
    startMs,
    durationMs,
    trimStartMs: 0,
    fontId: "inter",
    fontSize: 64,
    color: "#ffee00",
    y: 0.8,
    spokenBy: "line",
  }
}

/** Words above, the picture, and the voice line from 2s to 6s with music after it. */
function seeded(after: Partial<Clip> = {}): Tracks {
  return [
    {
      id: "words",
      muted: false,
      clips: [
        caption("c1", 2000, 2000, "Scene four."),
        caption("c2", 4000, 2000, "Hands out of frame."),
        { ...caption("typed", 9000, 1000, "Typed by hand"), spokenBy: undefined },
      ],
    },
    {
      id: "pictures",
      muted: false,
      clips: [
        { id: "pic", kind: "image", name: "Scene", mediaId: "p", startMs: 0, durationMs: 10_000, trimStartMs: 0 },
      ],
    },
    {
      id: "voices",
      muted: false,
      duck: true,
      clips: [
        {
          id: "line",
          kind: "audio",
          name: "Scene four",
          mediaId: "old-sound",
          startMs: 2000,
          durationMs: 4000,
          trimStartMs: 0,
          sourceDurationMs: 4000,
          fadeOutMs: 200,
          origin,
        },
        {
          id: "music",
          kind: "audio",
          name: "Music",
          mediaId: "m",
          startMs: 7000,
          durationMs: 3000,
          trimStartMs: 0,
          ...after,
        },
      ],
    },
  ]
}

function line(durationMs: number, captions: SpokenLine["captions"]): SpokenLine {
  return {
    mediaId: "new-sound",
    url: "https://media.test/new.mp3",
    name: "Scene four again",
    durationMs,
    captions,
    origin: { ...origin, prompt: "Scene four, again." },
  }
}

let made = 0
const newId = () => `new-${(made += 1)}`

function find(tracks: Tracks, id: string) {
  return tracks.flatMap((track) => track.clips).find((clip) => clip.id === id)
}

function starts(tracks: Tracks, ...ids: string[]) {
  return ids.map((id) => find(tracks, id)?.startMs)
}

describe("making a voice line again", () => {
  it("lays the new sound at the same start, shorter or longer, and moves nothing else", () => {
    const tracks = seeded()
    const shorter = landVoiceLine(tracks, { look: DEFAULT_CAPTION_LOOK,
      clipId: "line",
      line: line(3000, [{ startMs: 0, endMs: 3000, text: "Scene four, again." }]),
      newId,
    })!
    expect(shorter.newLane).toBe(false)
    expect(find(shorter.tracks, "line")).toMatchObject({
      startMs: 2000,
      durationMs: 3000,
      sourceDurationMs: 3000,
      mediaId: "new-sound",
      fadeOutMs: 200,
      origin: { prompt: "Scene four, again." },
    })

    // Up to the music at 7s there is room for 5 seconds.
    const longer = landVoiceLine(tracks, { look: DEFAULT_CAPTION_LOOK, clipId: "line", line: line(5000, []), newId })!
    expect(longer.newLane).toBe(false)
    expect(find(longer.tracks, "line")).toMatchObject({ startMs: 2000, durationMs: 5000 })
    expect(starts(longer.tracks, "pic", "music", "typed")).toEqual([0, 7000, 9000])
  })

  it("puts a line that grows into the next clip on a lane of its own just below, at the same start", () => {
    const tracks = seeded()
    const landed = landVoiceLine(tracks, { look: DEFAULT_CAPTION_LOOK, clipId: "line", line: line(6500, []), newId })!
    expect(landed.newLane).toBe(true)
    expect(landed.tracks.map((track) => track.id)).toEqual([
      "words",
      "pictures",
      "voices",
      landed.tracks[3].id,
    ])
    expect(landed.tracks[2].clips.map((clip) => clip.id)).toEqual(["music"])
    expect(landed.tracks[3]).toMatchObject({ muted: false, duck: true })
    expect(landed.tracks[3].clips[0]).toMatchObject({ id: "line", startMs: 2000, durationMs: 6500 })
    expect(starts(landed.tracks, "pic", "music", "typed")).toEqual([0, 7000, 9000])
  })

  it("runs at the clip's own speed", () => {
    const tracks = seeded()
    tracks[2].clips[0] = { ...tracks[2].clips[0], speed: 2 }
    const landed = landVoiceLine(tracks, { look: DEFAULT_CAPTION_LOOK, clipId: "line", line: line(4000, []), newId })!
    expect(find(landed.tracks, "line")).toMatchObject({ durationMs: 2000, sourceDurationMs: 4000 })
  })

  it("replaces its captions with the new reading's, in their look and on their lane", () => {
    const landed = landVoiceLine(seeded(), { look: DEFAULT_CAPTION_LOOK,
      clipId: "line",
      line: line(3000, [
        { startMs: 0, endMs: 1500, text: "Scene four,", words: [{ startMs: 0, endMs: 900 }] },
        { startMs: 1500, endMs: 3000, text: "again." },
      ]),
      newId,
    })!
    const words = landed.tracks[0].clips
    expect(words.map((clip) => clip.text)).toEqual(["Scene four,", "again.", "Typed by hand"])
    expect(words[0]).toMatchObject({
      startMs: 2000,
      durationMs: 1500,
      fontId: "inter",
      fontSize: 64,
      color: "#ffee00",
      y: 0.8,
      spokenBy: "line",
      wordTimes: [{ startMs: 0, endMs: 900 }],
    })
    expect(words[1]).toMatchObject({ startMs: 3500, durationMs: 1500 })
    expect(find(landed.tracks, "c1")).toBeUndefined()
  })

  it("lays no captions for a line whose captions were deleted", () => {
    const tracks = seeded()
    tracks[0].clips = tracks[0].clips.filter((clip) => !clip.spokenBy)
    const landed = landVoiceLine(tracks, { look: DEFAULT_CAPTION_LOOK,
      clipId: "line",
      line: line(3000, [{ startMs: 0, endMs: 3000, text: "Scene four, again." }]),
      newId,
    })!
    expect(landed.tracks[0].clips.map((clip) => clip.id)).toEqual(["typed"])
  })

  it("shares Hook's new line across the same on-screen words", () => {
    const tracks = seeded()
    const hook = { ...origin, tool: "hook" as const }
    tracks[2].clips[0] = { ...tracks[2].clips[0], origin: hook }
    const landed = landVoiceLine(tracks, { look: DEFAULT_CAPTION_LOOK,
      clipId: "line",
      line: { ...line(3000, []), origin: { ...hook, prompt: "Nobody warns you about this" } },
      newId,
    })!
    const words = landed.tracks[0].clips
    expect(words.map((clip) => [clip.id, clip.text])).toEqual([
      ["c1", "Nobody warns you"],
      ["c2", "about this"],
      ["typed", "Typed by hand"],
    ])
    expect(starts(landed.tracks, "c1", "c2")).toEqual([2000, 4000])
  })

  it("gives up when the line is gone or a lane it needs is past the limit", () => {
    const tracks = seeded()
    const gone = tracks.map((track) => ({
      ...track,
      clips: track.clips.filter((clip) => clip.id !== "line"),
    }))
    expect(landVoiceLine(gone, { look: DEFAULT_CAPTION_LOOK, clipId: "line", line: line(3000, []), newId })).toBeNull()

    const full: Tracks = [
      ...tracks,
      ...Array.from({ length: MAX_TIMELINE_TRACKS - tracks.length }, (_, index) => ({
        id: `empty-${index}`,
        muted: false,
        clips: [],
      })),
    ]
    expect(landVoiceLine(full, { look: DEFAULT_CAPTION_LOOK, clipId: "line", line: line(3000, []), newId })).not.toBeNull()
    expect(landVoiceLine(full, { look: DEFAULT_CAPTION_LOOK, clipId: "line", line: line(6500, []), newId })).toBeNull()
  })
})

describe("what a voice line remembers", () => {
  it("records OpenAI's own model for an OpenAI voice", () => {
    expect(
      voiceOrigin("voice", {
        voiceId: "nova",
        voiceName: "Nova",
        modelId: "eleven_v3",
        text: "Hello",
      })
    ).toEqual({
      tool: "voice",
      model: "gpt-4o-mini-tts",
      prompt: "Hello",
      voice: { id: "nova", name: "Nova", speaker: "openai" },
    })
    expect(
      voiceOrigin("translate", {
        voiceId: "rachel",
        voiceName: "Rachel",
        modelId: "eleven_multilingual_v2",
        text: "Hola",
      }).voice.speaker
    ).toBe("elevenlabs")
  })
})
