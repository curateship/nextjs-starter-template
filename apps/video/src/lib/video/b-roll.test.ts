import { describe, expect, it } from "vitest"

import {
  BROLL_MIN_SENTENCE_MS,
  brollCredit,
  cleanPhrase,
  landBroll,
  pexelsOrientation,
  pickPexelsFile,
  splitSentences,
  suggestedCandidate,
  wordsFromCaptionLines,
  type BrollCandidate,
  type TimedWord,
} from "@/lib/video/b-roll"
import { MAX_TIMELINE_TRACKS, type ProjectTimeline } from "@/lib/video/timeline-schema"

type Track = ProjectTimeline["tracks"][number]

/** Words said back to back, each `ms` long, starting at `fromMs`. */
function said(text: string, fromMs = 0, ms = 400, gapMs = 0): TimedWord[] {
  return text.split(" ").map((word, index) => ({
    text: word,
    startMs: fromMs + index * (ms + gapMs),
    endMs: fromMs + index * (ms + gapMs) + ms,
  }))
}

describe("sentences from the voice line's words", () => {
  it("cut at full stops, question marks and exclamation marks, timed by their words", () => {
    const sentences = splitSentences(
      said("Bread goes stale fast. Why does that happen? Starch dries out!", 0, 600)
    )
    expect(sentences.map((one) => one.text)).toEqual([
      "Bread goes stale fast.",
      "Why does that happen?",
      "Starch dries out!",
    ])
    expect(sentences[1]).toMatchObject({ startMs: 2400, endMs: 4800 })
  })

  it("join a sentence under 1.5 seconds to the one after it", () => {
    // "Yes." is 400ms; the next sentence is 1.6 seconds.
    const sentences = splitSentences(said("Yes. Bread goes stale fast."))
    expect(sentences).toHaveLength(1)
    expect(sentences[0]).toMatchObject({
      text: "Yes. Bread goes stale fast.",
      startMs: 0,
      endMs: 2000,
    })
  })

  it("join a short last sentence to the one before it", () => {
    const sentences = splitSentences(said("Bread goes stale fast. Really."))
    expect(sentences).toHaveLength(1)
    expect(sentences[0].text).toBe("Bread goes stale fast. Really.")
  })

  it("keep joining until nothing left is shorter than 1.5 seconds", () => {
    const sentences = splitSentences(said("One. Two. Three. Four. Bread goes stale fast."))
    expect(sentences.every((one) => one.endMs - one.startMs >= BROLL_MIN_SENTENCE_MS)).toBe(true)
    expect(sentences.map((one) => one.text).join(" ")).toBe(
      "One. Two. Three. Four. Bread goes stale fast."
    )
  })

  it("leave a single short sentence alone, since there is nothing to join it to", () => {
    expect(splitSentences(said("Hi."))).toEqual([
      { id: "s1", text: "Hi.", startMs: 0, endMs: 400 },
    ])
  })

  it("cut at pauses when the words carry no full stops, as Whisper's do", () => {
    const first = said("bread goes stale fast", 0, 400)
    const second = said("starch dries out overnight", 2100, 400)
    const sentences = splitSentences([...first, ...second])
    expect(sentences.map((one) => one.text)).toEqual([
      "bread goes stale fast",
      "starch dries out overnight",
    ])
  })

  it("count a full stop before a closing quote", () => {
    const sentences = splitSentences([
      ...said('She said "it is stale."', 0),
      ...said("Then she baked more bread.", 2000),
    ])
    expect(sentences).toHaveLength(2)
  })
})

describe("words from a voiceover's kept caption lines", () => {
  it("pair each word with its time by position", () => {
    expect(
      wordsFromCaptionLines([
        {
          startMs: 0,
          endMs: 900,
          text: "Bread goes",
          words: [
            { startMs: 0, endMs: 400 },
            { startMs: 450, endMs: 900 },
          ],
        },
      ])
    ).toEqual([
      { text: "Bread", startMs: 0, endMs: 400 },
      { text: "goes", startMs: 450, endMs: 900 },
    ])
  })

  it("share the line's time out evenly when the times do not match the words", () => {
    expect(
      wordsFromCaptionLines([{ startMs: 1000, endMs: 1900, text: "stale too fast" }])
    ).toEqual([
      { text: "stale", startMs: 1000, endMs: 1300 },
      { text: "too", startMs: 1300, endMs: 1600 },
      { text: "fast", startMs: 1600, endMs: 1900 },
    ])
  })
})

describe("a search phrase", () => {
  it("is one to three words, with quotes and full stops taken off", () => {
    expect(cleanPhrase('  "Email inbox on a laptop."  ')).toBe("Email inbox on")
    expect(cleanPhrase("city   traffic")).toBe("city traffic")
    expect(cleanPhrase(" ... ")).toBe("")
  })
})

describe("the project's shape", () => {
  it("decides which way round Pexels clips are", () => {
    expect(pexelsOrientation("9:16")).toBe("portrait")
    expect(pexelsOrientation("16:9")).toBe("landscape")
    expect(pexelsOrientation("4:3")).toBe("landscape")
    expect(pexelsOrientation("1:1")).toBe("square")
  })
})

describe("the Pexels file Place downloads", () => {
  const file = (width: number, height: number, link = `https://videos.pexels.com/video-files/1/1-${width}.mp4`) => ({
    link,
    width,
    height,
    file_type: "video/mp4",
  })

  it("is the smallest copy at 720p or above", () => {
    expect(
      pickPexelsFile([file(3840, 2160), file(1280, 720), file(640, 360), file(1920, 1080)])?.width
    ).toBe(1280)
    // Portrait: the shorter side is the width.
    expect(pickPexelsFile([file(1080, 1920), file(720, 1280), file(540, 960)])?.width).toBe(720)
  })

  it("is nothing when no copy reaches 720p", () => {
    expect(pickPexelsFile([file(640, 360), file(960, 540)])).toBeNull()
  })

  it("never comes from anywhere but Pexels' own video host", () => {
    expect(
      pickPexelsFile([file(1280, 720, "https://player.vimeo.com/external/1.mp4")])
    ).toBeNull()
  })
})

function candidate(durationMs: number, id = durationMs): BrollCandidate {
  return {
    pexelsId: id,
    pageUrl: `https://www.pexels.com/video/${id}/`,
    photographer: "Jane Doe",
    photographerUrl: "https://www.pexels.com/@jane",
    pictureUrl: `https://images.pexels.com/videos/${id}/a.jpeg`,
    previewUrl: `https://videos.pexels.com/video-files/${id}/sd.mp4`,
    fileUrl: `https://videos.pexels.com/video-files/${id}/hd.mp4`,
    width: 1080,
    height: 1920,
    durationMs,
  }
}

describe("the clip a row starts ticked on", () => {
  it("is the best match that runs as long as the sentence", () => {
    expect(suggestedCandidate([candidate(2000), candidate(6000), candidate(9000)], 5000)).toBe(1)
  })

  it("is the longest when none runs long enough", () => {
    expect(suggestedCandidate([candidate(2000), candidate(4000), candidate(3000)], 9000)).toBe(1)
  })

  it("is none for a row with no clips", () => {
    expect(suggestedCandidate([], 3000)).toBeNull()
  })
})

describe("the credit kept with a file", () => {
  it("names the photographer and links the clip and their page", () => {
    expect(brollCredit(candidate(5000, 42))).toBe(
      "Video by Jane Doe on Pexels: https://www.pexels.com/video/42/ (photographer: https://www.pexels.com/@jane)"
    )
  })
})

describe("placing B-roll on the timeline", () => {
  let ids = 0
  const newId = () => `new-${++ids}`
  const placement = (startMs: number, endMs: number, sourceDurationMs = 10_000) => ({
    startMs,
    endMs,
    mediaId: `m-${startMs}`,
    url: `https://media.test/${startMs}.mp4`,
    name: "Pexels: bread",
    sourceDurationMs,
  })
  const talkingHead: Track[] = [
    {
      id: "captions",
      muted: false,
      clips: [
        { id: "c1", kind: "text", name: "Hi", text: "Hi", fontId: "inter", startMs: 0, durationMs: 1000, trimStartMs: 0 },
      ],
    },
    {
      id: "speaker",
      muted: false,
      clips: [{ id: "v1", kind: "video", name: "Me", mediaId: "me", startMs: 0, durationMs: 20_000, trimStartMs: 0 }],
    },
    {
      id: "music",
      muted: false,
      clips: [{ id: "a1", kind: "audio", name: "Song", mediaId: "song", startMs: 0, durationMs: 20_000, trimStartMs: 0 }],
    },
  ]

  it("goes on one new lane above the speaker and under the captions", () => {
    const tracks = landBroll(talkingHead, [placement(1000, 4000), placement(5000, 7000)], newId)!
    expect(tracks.map((track) => track.id)).toEqual(["captions", "new-3", "speaker", "music"])
    expect(tracks[1].clips).toHaveLength(2)
  })

  it("starts each clip at its sentence and runs it as long as the sentence, muted and filling the frame", () => {
    const tracks = landBroll(talkingHead, [placement(1000, 4000)], newId)!
    expect(tracks[1].clips[0]).toMatchObject({
      kind: "video",
      startMs: 1000,
      durationMs: 3000,
      trimStartMs: 0,
      muted: true,
      fit: "cover",
      sourceDurationMs: 10_000,
    })
  })

  it("keeps a clip shorter than its sentence at the sentence's length, so its last frame holds", () => {
    const tracks = landBroll(talkingHead, [placement(1000, 9000, 3000)], newId)!
    expect(tracks[1].clips[0]).toMatchObject({ durationMs: 8000, sourceDurationMs: 3000 })
  })

  it("moves nothing already on the timeline", () => {
    const before = talkingHead.flatMap((track) => track.clips.map((clip) => `${clip.id}@${clip.startMs}`))
    const tracks = landBroll(talkingHead, [placement(1000, 4000), placement(5000, 7000)], newId)!
    const after = tracks
      .filter((track) => !track.id.startsWith("new-"))
      .flatMap((track) => track.clips.map((clip) => `${clip.id}@${clip.startMs}`))
    expect(after).toEqual(before)
  })

  it("goes straight above the voice when nothing on the timeline is a picture", () => {
    const voiceOnly: Track[] = [talkingHead[0], talkingHead[2]]
    const tracks = landBroll(voiceOnly, [placement(0, 2000)], newId)!
    expect(tracks.map((track) => track.id)).toEqual(["captions", tracks[1].id, "music"])
  })

  it("refuses when the project has no room for another lane", () => {
    const full = Array.from({ length: MAX_TIMELINE_TRACKS }, (_, index) => ({
      id: `t${index}`,
      muted: false,
      clips: [],
    }))
    expect(landBroll(full, [placement(0, 2000)], newId)).toBeNull()
  })
})
