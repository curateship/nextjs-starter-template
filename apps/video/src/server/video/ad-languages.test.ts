import { describe, expect, it, vi } from "vitest"

import {
  DEFAULT_TEXT_AD_LOOK,
  adsOf,
  clipAdTemplate,
  layAd,
  textAdTemplate,
  videoEndMs,
} from "@/lib/video/ads"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"

/**
 * Ads in a language copy, with the saved video, the shelf, the translator and
 * the voice stood in. What is checked is this file's own work: which words
 * are sent, which reads are said again, and how the new read fits its spot.
 */

const state = vi.hoisted(() => ({ timeline: null as unknown, reads: [] as unknown[] }))

vi.mock("@/server/video/project-videos", () => ({
  getOwnedVideo: async () => ({ id: "v1", projectId: "p1", timeline: state.timeline }),
}))

const { adsInLanguage, withAdsInLanguage } = await import("@/server/video/ad-languages")

type Track = ProjectTimeline["tracks"][number]

let next = 0
const newId = () => `id-${++next}`

function shelfDb() {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: async () => state.reads,
  }
  return chain as never
}

function videoWithAds() {
  let tracks: Track[] = [
    {
      id: "a",
      muted: false,
      clips: [
        {
          id: "talk",
          kind: "video",
          name: "Talk",
          mediaId: "talk",
          startMs: 0,
          durationMs: 10 * 60_000,
          trimStartMs: 0,
        },
      ],
    },
  ]
  for (const [template, atMs] of [
    [textAdTemplate({ text: "Use code TYLER", look: DEFAULT_TEXT_AD_LOOK, safeBox: null }), 30_000],
    [
      clipAdTemplate({
        shelfId: "read-1",
        name: "Sponsor read, 30 seconds",
        mediaId: "english-read",
        url: "https://example.com/en.mp3",
        fileType: "audio",
        durationMs: 30_000,
      }),
      5 * 60_000,
    ],
  ] as const) {
    const laid = layAd(tracks, template, atMs, newId)
    if ("refusal" in laid) throw new Error(laid.refusal)
    tracks = laid.tracks
  }
  return { tracks, aspect: "9:16" as const }
}

describe("ads in a language copy", () => {
  it("translates the text ads and says the sponsor read again, fitted to its spot", async () => {
    state.timeline = videoWithAds()
    state.reads = [
      {
        id: "read-1",
        name: "Sponsor read, 30 seconds",
        readScript: "This video is sponsored by Brightly.",
        readVoiceId: "voice-1",
        readVoiceName: "Tyler",
      },
    ]
    const translate = vi.fn(async ({ lines }: { lines: string[] }) =>
      lines.map((line) => `ES ${line}`)
    )
    // The Spanish read comes out 33 seconds, 3 longer than its spot.
    const say = vi.fn(async () => ({
      mediaId: "spanish-read",
      url: "https://example.com/es.mp3",
      name: "es",
      durationMs: 33_000,
      captions: [],
    }))
    const changes = await adsInLanguage(
      { userId: "u1", videoId: "v1", language: "Spanish" as never },
      shelfDb(),
      { translate, say } as never
    )
    expect(translate.mock.calls.map(([call]) => call.lines)).toEqual([
      ["Use code TYLER"],
      ["This video is sponsored by Brightly."],
    ])
    expect(say).toHaveBeenCalledWith(
      expect.objectContaining({ voiceId: "voice-1", text: "ES This video is sponsored by Brightly." })
    )

    const copy = withAdsInLanguage((state.timeline as ReturnType<typeof videoWithAds>).tracks, changes)
    const [text, read] = adsOf(copy).map(({ clip }) => clip)
    expect(text).toMatchObject({ text: "ES Use code TYLER" })
    expect(read).toMatchObject({ mediaId: "spanish-read", speed: 1.1, durationMs: 30_000 })
    // Fitted to the same 30 seconds, so nothing after the read moved.
    expect(videoEndMs(copy)).toBe(10.5 * 60_000)
  })

  it("asks nothing when the video has no ads", async () => {
    state.timeline = { tracks: [], aspect: "9:16" }
    const translate = vi.fn()
    const changes = await adsInLanguage(
      { userId: "u1", videoId: "v1", language: "Spanish" as never },
      shelfDb(),
      { translate, say: vi.fn() } as never
    )
    expect(changes.size).toBe(0)
    expect(translate).not.toHaveBeenCalled()
  })
})
