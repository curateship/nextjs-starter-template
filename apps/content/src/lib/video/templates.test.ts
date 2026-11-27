import { describe, expect, it } from "vitest"

import { landBriefScenes, relayBriefScene, type BriefLanding, type SceneWithFiles } from "@/lib/video/brief"
import { DEFAULT_CAPTION_SETTINGS } from "@/lib/video/caption-look"
import {
  DEFAULT_TEMPLATE_FIELDS,
  readTemplateChanges,
  cutIntoScenes,
  makingCents,
  readScriptBlocks,
  readTemplateFields,
  readingSeconds,
  scriptScenes,
  spokenScript,
  templateCaptions,
  typicalTemplateCents,
  withChanges,
} from "@/lib/video/templates"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"

const words = (text: string) => text.split(/\s+/).filter(Boolean)

describe("cutting a pasted script", () => {
  it("starts a scene at a blank line or ---, and never reads a picture note aloud", () => {
    const blocks = readScriptBlocks(
      "Your bread isn't dry. [show: a loaf on a board]\n\nIt's the starch.\n---\nHere's the fix.\n[show: bread in a tin]"
    )
    expect(blocks).toEqual([
      { words: "Your bread isn't dry.", picture: "a loaf on a board" },
      { words: "It's the starch.", picture: null },
      { words: "Here's the fix.", picture: "bread in a tin" },
    ])
    expect(spokenScript("Hello [show: me waving] there.")).toBe("Hello there.")
  })

  it("lends a note with no words to the next part that has words", () => {
    expect(readScriptBlocks("[show: a sunrise]\n\nGood morning.")).toEqual([
      { words: "Good morning.", picture: "a sunrise" },
    ])
  })

  it("cuts at sentence ends near the pace's middle, keeping every word in order", () => {
    const text =
      "One two three four five six. Seven eight nine ten eleven twelve. Thirteen fourteen fifteen sixteen. Seventeen eighteen nineteen twenty twenty-one twenty-two."
    const scenes = cutIntoScenes(text, { min: 2, max: 4 })
    expect(words(scenes.join(" "))).toEqual(words(text))
    // A six-word sentence is about two seconds at 170 words a minute, under
    // the 3-second middle, so a scene takes the next sentence when the two
    // still fit in the 4-second most: six words and four words is 3.5
    // seconds and fits, six and six (4.2) does not.
    expect(scenes).toEqual([
      "One two three four five six.",
      "Seven eight nine ten eleven twelve. Thirteen fourteen fifteen sixteen.",
      "Seventeen eighteen nineteen twenty twenty-one twenty-two.",
    ])
    for (const scene of scenes) expect(readingSeconds(scene)).toBeLessThanOrEqual(4)
  })

  it("never splits a sentence, even one longer than the pace allows", () => {
    const long = Array.from({ length: 40 }, (_, index) => `word${index}`).join(" ") + "."
    expect(cutIntoScenes(long, { min: 2, max: 4 })).toEqual([long])
  })

  it("keeps the person's own breaks, and cuts the whole script when there are none", () => {
    const own = scriptScenes("First part. Still first.\n\nSecond part.", { min: 3, max: 8 })
    expect(own.map((scene) => scene.words)).toEqual(["First part. Still first.", "Second part."])
    const none = scriptScenes("A short one. Then another. And a third one here. Plus a fourth.", { min: 2, max: 4 })
    expect(none.length).toBeGreaterThan(1)
    expect(words(none.map((scene) => scene.words).join(" "))).toEqual(
      words("A short one. Then another. And a third one here. Plus a fourth.")
    )
  })
})

describe("a template's fields", () => {
  it("keeps every field that still reads and defaults the rest, one by one", () => {
    const read = readTemplateFields({
      instructions: "Calm working session",
      pace: "sideways",
      pictureModel: "a-model-that-was-taken-away",
      lengthSeconds: 900,
      platform: "shorts",
    })
    expect(read.instructions).toBe("Calm working session")
    expect(read.pace).toBe("normal")
    expect(read.pictureModel).toBe(DEFAULT_TEMPLATE_FIELDS.pictureModel)
    // A Short can't run 15 minutes; it comes down to the platform's most.
    expect(read.lengthSeconds).toBe(180)
  })

  it("reads a video's own copy field by field, over the template's", () => {
    const fields = { ...DEFAULT_TEMPLATE_FIELDS, lengthSeconds: 45, pace: "slow" as const }
    const copy = readTemplateChanges({ lengthSeconds: 60, pace: "sideways", audience: "Bakers" })
    expect(copy).toEqual({ lengthSeconds: 60, audience: "Bakers" })
    expect(withChanges(fields, copy)).toMatchObject({ lengthSeconds: 60, pace: "slow", audience: "Bakers" })
  })

  it("prices a typical video: pictures at the pace, the voice by the character, and each language", () => {
    const fields = { ...DEFAULT_TEMPLATE_FIELDS, lengthSeconds: 44, pace: "normal" as const }
    // 44 seconds at the normal pace's 5.5-second middle is 8 pictures at 7¢.
    const alone = typicalTemplateCents(fields)
    const withSpanish = typicalTemplateCents({ ...fields, languages: ["Spanish"] })
    expect(alone).toBeGreaterThan(8 * 6.7)
    expect(withSpanish).toBeGreaterThan(alone)
  })

  it("lays no captions when they are off, its own look when it has one, the saved look otherwise", () => {
    const off = { ...DEFAULT_TEMPLATE_FIELDS, captions: { on: false, look: null } }
    expect(templateCaptions(off, DEFAULT_CAPTION_SETTINGS, "9:16")).toBeNull()
    const own = { ...DEFAULT_TEMPLATE_FIELDS, captions: { on: true, look: { ...DEFAULT_CAPTION_SETTINGS.look, fontSize: 90 } } }
    expect(templateCaptions(own, DEFAULT_CAPTION_SETTINGS, "9:16")?.look.fontSize).toBe(90)
    expect(templateCaptions(null, DEFAULT_CAPTION_SETTINGS, "9:16")?.look).toEqual(DEFAULT_CAPTION_SETTINGS.look)
  })

  it("counts language copies against the cap but not against this video", () => {
    const voice = { speaker: "elevenlabs" as const, modelId: "eleven_multilingual_v2" as const }
    const scenes = [{ words: "One two three four five six seven." }]
    const plain = makingCents(scenes, voice, "gemini-3.1-flash-image", DEFAULT_TEMPLATE_FIELDS)
    const copies = makingCents(scenes, voice, "gemini-3.1-flash-image", { ...DEFAULT_TEMPLATE_FIELDS, languages: ["French", "German"] })
    expect(copies.thisVideo).toBe(plain.thisVideo)
    expect(copies.total).toBeGreaterThan(plain.total)
  })
})

function madeScene(id: string, ms: number): SceneWithFiles {
  return {
    id,
    words: `${id} words`,
    picture: `${id} picture`,
    seconds: ms / 1000,
    state: "made",
    still: { mediaId: `${id}-still`, name: id, origin: { tool: "brief", model: "m", prompt: "p", aspectRatio: "9:16" } },
    voice: {
      mediaId: `${id}-voice`,
      name: id,
      durationMs: ms,
      captions: [{ startMs: 0, endMs: ms, text: `${id} words` }],
      origin: { tool: "brief-voice", voiceId: "v", voiceName: "V", modelId: "m", prompt: `${id} words` } as never,
    },
  }
}

let next = 0
const newId = () => `id-${(next += 1)}`

describe("landing a template's brief", () => {
  it("lays the music under the whole video with the last scene, on a lane that ducks", () => {
    const landing: BriefLanding = { startMs: 0, lanes: {}, music: { mediaId: "song", name: "Song", durationMs: 60_000 } }
    const first = landBriefScenes([], { scenes: [madeScene("a", 2000), { ...madeScene("b", 3000), state: "queued" }], landing }, newId, null)
    expect(first?.landing.music?.laid).toBeFalsy()
    const both = landBriefScenes([], { scenes: [madeScene("a", 2000), madeScene("b", 3000)], landing }, newId, null)
    const music = both?.tracks.find((track) => track.duck)
    expect(music?.clips[0]).toMatchObject({ mediaId: "song", startMs: 0, durationMs: 2000 + 200 + 3000 + 200 })
    expect(both?.landing.music).toMatchObject({ laid: true, lane: music?.id })
    // Captions off: no words lane at all.
    expect(both?.tracks.some((track) => track.clips.some((clip) => clip.kind === "text"))).toBe(false)
  })

  it("swaps a changed scene's reading in place and moves the later scenes by the difference", () => {
    const captions = { ...DEFAULT_CAPTION_SETTINGS, aspect: "9:16" as const }
    const landed = landBriefScenes(
      [],
      { scenes: [madeScene("a", 2000), madeScene("b", 3000)], landing: { startMs: 0, lanes: {} } },
      newId,
      captions
    )
    if (!landed) throw new Error("not landed")
    const tracks = landed.tracks as ProjectTimeline["tracks"]
    const relaid = relayBriefScene(
      tracks,
      landed.landing,
      {
        oldVoiceMediaId: "a-voice",
        stillMediaId: "a-still",
        voice: { ...madeScene("a2", 3500).voice!, mediaId: "a-new-voice" },
      },
      captions
    )
    if (!relaid) throw new Error("not relaid")
    const voices = relaid.find((track) => track.id === landed.landing.lanes.voice)?.clips ?? []
    expect(voices.map((clip) => [clip.mediaId, clip.startMs, clip.durationMs])).toEqual([
      ["a-new-voice", 0, 3500],
      ["b-voice", 2200 + 1500, 3000],
    ])
    const stills = relaid.find((track) => track.id === landed.landing.lanes.pictures)?.clips ?? []
    expect(stills.map((clip) => [clip.mediaId, clip.startMs, clip.durationMs])).toEqual([
      ["a-still", 0, 2200 + 1500],
      ["b-still", 3700, 3200],
    ])
    const words = relaid.find((track) => track.id === landed.landing.lanes.words)?.clips ?? []
    expect(words.map((clip) => clip.text)).toEqual(["a2 words", "b words"])
  })
})
