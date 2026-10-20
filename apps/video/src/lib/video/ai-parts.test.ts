import { describe, expect, it } from "vitest"

import {
  aiPartLines,
  aiPartsOfTimeline,
  aiPartsParagraph,
  aiPartsTakeHandEdits,
  NOTHING_MADE_BY_AI,
  type KnownAiMedia,
} from "@/lib/video/ai-parts"
import type { ClipOrigin } from "@/lib/video/clip-origin"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"

type Clip = ProjectTimeline["tracks"][number]["clips"][number]

function clip(overrides: Partial<Clip>): Clip {
  return {
    id: Math.random().toString(36).slice(2),
    kind: "image",
    name: "clip",
    startMs: 0,
    durationMs: 4000,
    trimStartMs: 0,
    mediaId: "media",
    ...overrides,
  }
}

function lane(clips: Clip[], muted = false) {
  return { id: Math.random().toString(36).slice(2), muted, clips }
}

const picture = (model = "gemini-3.1-flash-image"): ClipOrigin => ({
  tool: "brief",
  model,
  prompt: "Bread on a board",
  aspectRatio: "9:16",
})

const shot: ClipOrigin = {
  tool: "shot",
  model: "gemini-omni-1.1-flash",
  prompt: "She turns",
  firstFrameMediaId: "frame",
  referenceMediaIds: [],
  extras: [],
  aspectRatio: "9:16",
  quality: "720p",
}

const voice = (
  tool: "voice" | "hook" | "translate" | "brief-voice",
  speaker: "elevenlabs" | "openai" = "elevenlabs"
): ClipOrigin => ({
  tool,
  model: "eleven_multilingual_v2",
  prompt: "Bread goes stale fast.",
  voice: { id: "rachel", name: "Rachel", speaker },
})

/** A brief laid end to end: eight scene pictures, a voice line, a shot at 0:12. */
const seeded: ProjectTimeline = {
  aspect: "9:16",
  tracks: [
    lane([
      clip({ kind: "audio", startMs: 0, durationMs: 32_000, origin: voice("brief-voice") }),
    ]),
    lane(
      Array.from({ length: 8 }, (_, index) =>
        clip({ startMs: index * 4000, origin: picture() })
      )
    ),
    lane([clip({ kind: "video", startMs: 12_400, origin: shot, muted: true })]),
    lane([clip({ kind: "text", text: "Typed in", mediaId: undefined, fontId: "inter" })]),
  ],
}

describe("aiPartsOfTimeline", () => {
  it("lists the script, the voice, the pictures and the clip of a seeded brief", () => {
    expect(aiPartsOfTimeline(seeded)).toEqual([
      { kind: "script", tool: "brief" },
      { kind: "voice", speaker: "elevenlabs", atSeconds: [0] },
      {
        kind: "picture",
        model: "gemini-3.1-flash-image",
        atSeconds: [0, 4, 8, 12, 16, 20, 24, 28],
      },
      { kind: "clip", model: "gemini-omni-1.1-flash", atSeconds: [12] },
    ])
  })

  it("is empty for a project with no AI parts", () => {
    const uploaded: ProjectTimeline = {
      aspect: "16:9",
      tracks: [lane([clip({ kind: "video" }), clip({ kind: "audio", startMs: 4000 })])],
    }
    expect(aiPartsOfTimeline(uploaded)).toEqual([])
    expect(aiPartsOfTimeline({ aspect: "9:16", tracks: [] })).toEqual([])
  })

  it("leaves out a voice line nobody hears, and its words and translation", () => {
    const timeline: ProjectTimeline = {
      aspect: "9:16",
      tracks: [
        lane([clip({ kind: "audio", origin: voice("hook") })], true),
        lane([clip({ kind: "audio", origin: voice("translate"), muted: true })]),
        lane([clip({ kind: "audio", origin: voice("brief-voice"), volume: 0 })]),
      ],
    }
    expect(aiPartsOfTimeline(timeline)).toEqual([])
  })

  it("keeps a picture on a muted lane, because muting only stops the sound", () => {
    const timeline: ProjectTimeline = {
      aspect: "9:16",
      tracks: [lane([clip({ origin: picture() })], true)],
    }
    expect(aiPartsOfTimeline(timeline)).toHaveLength(1)
  })

  it("skips a clip of no length", () => {
    const timeline: ProjectTimeline = {
      aspect: "9:16",
      tracks: [lane([clip({ origin: picture(), durationMs: 0 })])],
    }
    expect(aiPartsOfTimeline(timeline)).toEqual([])
  })

  it("names files the AI made that carry no recipe, by their id", () => {
    const known = new Map<string, KnownAiMedia>([
      ["frame-file", { kind: "picture", model: "gemini-2.5-flash-image" }],
      ["shot-file", { kind: "clip", model: "veo-3.1-generate-preview" }],
      ["voice-file", { kind: "voice", speaker: "openai" }],
    ])
    const timeline: ProjectTimeline = {
      aspect: "9:16",
      tracks: [
        lane([clip({ kind: "audio", mediaId: "voice-file", startMs: 2000 })]),
        lane([clip({ mediaId: "frame-file", startMs: 5000 })]),
        lane([clip({ kind: "video", mediaId: "shot-file", startMs: 9000 })]),
        lane([clip({ mediaId: "upload" })]),
      ],
    }
    expect(aiPartsOfTimeline(timeline, known)).toEqual([
      { kind: "voice", speaker: "openai", atSeconds: [2] },
      { kind: "picture", model: "gemini-2.5-flash-image", atSeconds: [5] },
      { kind: "clip", model: "veo-3.1-generate-preview", atSeconds: [9] },
    ])
  })

  it("flags a translation read aloud and an opening line from Hook", () => {
    const timeline: ProjectTimeline = {
      aspect: "9:16",
      tracks: [
        lane([clip({ kind: "audio", origin: voice("hook", "openai") })]),
        lane([clip({ kind: "audio", startMs: 3000, origin: voice("translate") })]),
      ],
    }
    expect(aiPartsOfTimeline(timeline)).toEqual([
      { kind: "script", tool: "hook" },
      { kind: "voice", speaker: "openai", atSeconds: [0] },
      { kind: "voice", speaker: "elevenlabs", atSeconds: [3] },
      { kind: "translation" },
    ])
  })
})

describe("aiPartsParagraph", () => {
  it("names tools by their everyday names, never a model id", () => {
    const parts = aiPartsOfTimeline(seeded)
    const paragraph = aiPartsParagraph(parts, true)
    expect(paragraph).toBe(
      "Script written with AI and edited by hand. Voice read by AI (ElevenLabs). 8 pictures from 0:00 to 0:28 made by AI (Nano Banana 2) and edited by hand. Video clip at 0:12 made by AI (Omni Flash)."
    )
    expect(paragraph).not.toMatch(/gemini|eleven_|veo-/)
  })

  it("drops the hand edits when the tick is off", () => {
    expect(aiPartsParagraph(aiPartsOfTimeline(seeded), false)).toBe(
      "Script written with AI. Voice read by AI (ElevenLabs). 8 pictures from 0:00 to 0:28 made by AI (Nano Banana 2). Video clip at 0:12 made by AI (Omni Flash)."
    )
  })

  it("lists up to six places one by one", () => {
    expect(
      aiPartLines(
        [{ kind: "picture", model: "gemini-2.5-flash-image", atSeconds: [0, 64, 125] }],
        false
      )
    ).toEqual(["Pictures at 0:00, 1:04 and 2:05 made by AI (Nano Banana)"])
  })

  it("puts both voice companies on one line, and the translation on its own", () => {
    expect(
      aiPartLines(
        [
          { kind: "voice", speaker: "openai", atSeconds: [0] },
          { kind: "voice", speaker: "elevenlabs", atSeconds: [3] },
          { kind: "translation" },
        ],
        true
      )
    ).toEqual([
      "Voice read by AI (OpenAI and ElevenLabs)",
      "Translated into another language by AI",
    ])
  })

  it("says nothing was made by AI for an empty list", () => {
    expect(aiPartsParagraph([], true)).toBe(NOTHING_MADE_BY_AI)
  })
})

describe("aiPartsTakeHandEdits", () => {
  it("is only true when there is a script or a picture line", () => {
    expect(aiPartsTakeHandEdits(aiPartsOfTimeline(seeded))).toBe(true)
    expect(
      aiPartsTakeHandEdits([{ kind: "voice", speaker: "openai", atSeconds: [0] }])
    ).toBe(false)
  })
})
