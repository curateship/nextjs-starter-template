import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  applyHookVariant,
  detectHook,
  HOOK_AUDIO_SPANS_VIDEO_MESSAGE,
  HOOK_NO_AUDIO_MESSAGE,
  HOOK_NO_TEXT_MESSAGE,
  hookWordBudget,
  type HookCaptionLine,
} from "../lib/hook-variants.ts"
import {
  requireCanonicalTimeline,
  type ProjectTimeline,
} from "../lib/timeline-schema.ts"

type Clip = ProjectTimeline["tracks"][number]["clips"][number]

let idCounter = 0
const nextId = () => `new-${++idCounter}`

function audioClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: "hook-audio",
    kind: "audio",
    name: "Voiceover — hook",
    startMs: 0,
    durationMs: 3000,
    trimStartMs: 0,
    mediaId: "media-hook",
    ...overrides,
  }
}

function textClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: "hook-text",
    kind: "text",
    name: "Caption",
    text: "stop scrolling",
    fontId: "inter",
    fontSize: 48,
    color: "#ffffff",
    highlightColor: "#facc15",
    y: 0.8,
    startMs: 0,
    durationMs: 1400,
    trimStartMs: 0,
    ...overrides,
  }
}

function bedClip(overrides: Partial<Clip> = {}): Clip {
  return audioClip({
    id: "audio-bed",
    name: "Original Audio",
    durationMs: 30000,
    mediaId: "media-bed",
    ...overrides,
  })
}

function timeline(tracks: { id: string; muted?: boolean; clips: Clip[] }[]) {
  return requireCanonicalTimeline({
    aspect: "9:16",
    tracks: tracks.map((track) => ({
      id: track.id,
      muted: track.muted ?? false,
      clips: track.clips,
    })),
  })
}

// A typical project: video track, hook voice + a later voice line on an audio
// track, and two karaoke caption clips over the hook plus one after it.
function hookTimeline() {
  return timeline([
    {
      id: "track-video",
      muted: true,
      clips: [
        {
          id: "clip-video",
          kind: "video",
          name: "Slot",
          startMs: 0,
          durationMs: 30000,
          trimStartMs: 0,
          mediaId: "media-video",
        },
      ],
    },
    {
      id: "track-audio",
      clips: [
        audioClip(),
        audioClip({ id: "later-voice", startMs: 5000, durationMs: 4000 }),
      ],
    },
    {
      id: "track-text",
      clips: [
        textClip(),
        textClip({
          id: "hook-text-2",
          text: "before it's too late",
          startMs: 1400,
          durationMs: 1400,
        }),
        textClip({
          id: "later-text",
          text: "next sentence",
          startMs: 5000,
          durationMs: 1500,
        }),
      ],
    },
  ])
}

const variant = {
  text: "You are editing videos wrong",
  audio: {
    mediaId: "media-new-voice",
    durationMs: 2600,
    url: "/api/media/media-new-voice/file",
  },
  captions: [
    {
      startMs: 0,
      endMs: 1300,
      text: "You are editing",
      words: [
        { text: "You", startMs: 0, endMs: 300 },
        { text: "are", startMs: 300, endMs: 600 },
        { text: "editing", startMs: 600, endMs: 1300 },
      ],
    },
    {
      startMs: 1300,
      endMs: 2600,
      text: "videos wrong",
      words: [
        { text: "videos", startMs: 0, endMs: 700 },
        { text: "wrong", startMs: 700, endMs: 1300 },
      ],
    },
  ] satisfies HookCaptionLine[],
}

describe("detectHook", () => {
  it("finds the hook audio and joins its text clips in order", () => {
    const hook = detectHook(hookTimeline())
    assert.equal(hook.audioClip.id, "hook-audio")
    assert.equal(hook.audioTrackId, "track-audio")
    assert.equal(hook.hookText, "stop scrolling before it's too late")
    assert.deepEqual(
      hook.textClips.map((clip) => clip.clipId),
      ["hook-text", "hook-text-2"]
    )
    assert.equal(hook.styleSource.id, "hook-text")
    assert.equal(hook.textTrackId, "track-text")
  })

  it("errors when no audio starts at the top", () => {
    const value = timeline([
      { id: "track-text", clips: [textClip()] },
      {
        id: "track-audio",
        clips: [audioClip({ startMs: 2000 })],
      },
    ])
    assert.throws(() => detectHook(value), new Error(HOOK_NO_AUDIO_MESSAGE))
  })

  it("errors when only a full-length audio bed starts at the top", () => {
    const value = timeline([
      { id: "track-text", clips: [textClip()] },
      { id: "track-audio", clips: [bedClip()] },
    ])
    assert.throws(
      () => detectHook(value),
      new Error(HOOK_AUDIO_SPANS_VIDEO_MESSAGE)
    )
  })

  it("picks the discrete voice clip over a bed that also starts at zero", () => {
    const value = timeline([
      { id: "track-text", clips: [textClip()] },
      { id: "track-bed", clips: [bedClip()] },
      { id: "track-voice", clips: [audioClip()] },
    ])
    assert.equal(detectHook(value).audioClip.id, "hook-audio")
  })

  it("ignores audio on muted tracks", () => {
    const value = timeline([
      { id: "track-text", clips: [textClip()] },
      { id: "track-voice", muted: true, clips: [audioClip()] },
    ])
    assert.throws(() => detectHook(value), new Error(HOOK_NO_AUDIO_MESSAGE))
  })

  it("errors when no text overlaps the hook audio", () => {
    const value = timeline([
      {
        id: "track-text",
        clips: [textClip({ startMs: 10000 })],
      },
      { id: "track-audio", clips: [audioClip()] },
    ])
    assert.throws(() => detectHook(value), new Error(HOOK_NO_TEXT_MESSAGE))
  })
})

describe("applyHookVariant", () => {
  it("swaps hook audio and captions, leaving everything else untouched", () => {
    const source = hookTimeline()
    const result = applyHookVariant(source, variant, nextId)

    // Valid timeline, source not mutated.
    requireCanonicalTimeline(result)
    assert.deepEqual(source, hookTimeline())

    // Untouched clips survive byte-for-byte.
    assert.deepEqual(result.tracks[0], source.tracks[0])
    const audioTrack = result.tracks[1]
    assert.deepEqual(
      audioTrack.clips.find((clip) => clip.id === "later-voice"),
      source.tracks[1].clips[1]
    )

    // New audio clip in place of the old one.
    const newAudio = audioTrack.clips[0]
    assert.equal(newAudio.kind, "audio")
    assert.equal(newAudio.mediaId, "media-new-voice")
    assert.equal(newAudio.url, "/api/media/media-new-voice/file")
    assert.equal(newAudio.startMs, 0)
    assert.equal(newAudio.durationMs, 2600)
    assert.equal(newAudio.name, "Hook — You are editing videos wrong")
    assert.equal(
      audioTrack.clips.some((clip) => clip.id === "hook-audio"),
      false
    )

    // Old hook captions removed, later caption untouched, new ones styled
    // like the original with line-relative words.
    const textTrack = result.tracks[2]
    const texts = textTrack.clips.map((clip) => clip.text)
    assert.deepEqual(texts, [
      "next sentence",
      "You are editing",
      "videos wrong",
    ])
    const firstNew = textTrack.clips[1]
    assert.equal(firstNew.fontId, "inter")
    assert.equal(firstNew.fontSize, 48)
    assert.equal(firstNew.color, "#ffffff")
    assert.equal(firstNew.highlightColor, "#facc15")
    assert.equal(firstNew.y, 0.8)
    assert.equal(firstNew.startMs, 0)
    assert.equal(firstNew.durationMs, 1300)
    assert.deepEqual(firstNew.words, variant.captions[0].words)
    const secondNew = textTrack.clips[2]
    assert.equal(secondNew.startMs, 1300)
    assert.equal(secondNew.durationMs, 1300)
  })

  it("clamps the new audio to the next clip on its track", () => {
    const longVoice = {
      ...variant,
      audio: { mediaId: "media-new-voice", durationMs: 9000 },
      captions: [
        { startMs: 0, endMs: 4000, text: "way too long" },
        { startMs: 6000, endMs: 8000, text: "dropped entirely" },
      ],
    }
    const result = applyHookVariant(hookTimeline(), longVoice, nextId)
    const newAudio = result.tracks[1].clips[0]
    // Next clip on the audio track starts at 5000.
    assert.equal(newAudio.durationMs, 5000)
    assert.equal(newAudio.sourceDurationMs, 9000)

    // The first caption is clamped to the audio end; the second is dropped.
    const textTrack = result.tracks[2]
    assert.deepEqual(
      textTrack.clips.map((clip) => clip.text),
      ["next sentence", "way too long"]
    )
    assert.equal(textTrack.clips[1].durationMs, 4000)
  })

  it("keeps the hook audio's original start offset", () => {
    const value = timeline([
      { id: "track-text", clips: [textClip({ startMs: 500 })] },
      { id: "track-audio", clips: [audioClip({ startMs: 500 })] },
    ])
    const result = applyHookVariant(value, variant, nextId)
    const newAudio = result.tracks[1].clips[0]
    assert.equal(newAudio.startMs, 500)
    // Captions shift by the same offset.
    assert.equal(result.tracks[0].clips[0].startMs, 500)
  })
})

describe("hookWordBudget", () => {
  it("budgets ~2.8 words per second with a floor of 3", () => {
    assert.equal(hookWordBudget(3000), 8)
    assert.equal(hookWordBudget(500), 3)
  })
})
