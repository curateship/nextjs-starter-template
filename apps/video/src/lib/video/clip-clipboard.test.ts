import { afterAll, afterEach, describe, expect, it, vi } from "vitest"

import {
  CLIP_CLIPBOARD_STORAGE_KEY,
  clipboardMediaIds,
  copyClips,
  prepareClipsForPaste,
  readClipClipboard,
  writeClipClipboard,
} from "./clip-clipboard"
import type { ProjectTimeline } from "./timeline-schema"

type Clip = ProjectTimeline["tracks"][number]["clips"][number]

function footage(id: string, startMs: number, extra: Partial<Clip> = {}): Clip {
  return {
    id,
    kind: "video",
    name: `${id}.mp4`,
    mediaId: `media-${id}`,
    url: `https://files.example.test/${id}.mp4`,
    startMs,
    durationMs: 1_000,
    trimStartMs: 0,
    ...extra,
  }
}

const fade = { kind: "crossfade", durationMs: 400 } as const

const tracks: ProjectTimeline["tracks"] = [
  { id: "top", muted: false, clips: [footage("title", 500)] },
  {
    id: "main",
    muted: false,
    clips: [
      footage("a", 2_000),
      footage("b", 3_000, { transition: fade }),
      footage("c", 6_000, { transition: fade }),
    ],
  },
]

describe("copying clips", () => {
  it("counts time from the earliest clip and lanes from the highest", () => {
    const copied = copyClips(tracks, ["a", "c"])
    expect(
      copied?.map(({ clip, lane }) => [clip.id, clip.startMs, lane])
    ).toEqual([
      ["a", 0, 0],
      ["c", 4_000, 0],
    ])
  })

  it("keeps a blend only when the clip before it was copied too", () => {
    const copied = copyClips(tracks, ["a", "b", "c"])
    const byId = new Map(copied?.map(({ clip }) => [clip.id, clip]))
    expect(byId.get("b")?.transition).toEqual(fade)
    expect(copyClips(tracks, ["c"])?.[0].clip.transition).toBeUndefined()
  })

  it("keeps each clip's lane relative to the others", () => {
    const copied = copyClips(tracks, ["title", "a"])
    expect(copied?.map(({ clip, lane }) => [clip.id, lane])).toEqual([
      ["title", 0],
      ["a", 1],
    ])
  })

  it("has nothing to copy when no id names a clip", () => {
    expect(copyClips(tracks, [])).toBeNull()
    expect(copyClips(tracks, ["gone"])).toBeNull()
  })
})

describe("the stored copy", () => {
  const store = new Map<string, string>()
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
  })
  afterEach(() => store.clear())
  afterAll(() => vi.unstubAllGlobals())

  it("reads back what was written", () => {
    const copied = copyClips(tracks, ["a", "b"])!
    writeClipClipboard("me", copied)
    expect(readClipClipboard("me")).toEqual(copied)
  })

  it("is empty for anybody but the person who copied", () => {
    writeClipClipboard("me", copyClips(tracks, ["a"])!)
    expect(readClipClipboard("next-person-on-this-browser")).toBeNull()
  })

  it("reads anything it does not recognise as empty", () => {
    expect(readClipClipboard("me")).toBeNull()
    store.set(CLIP_CLIPBOARD_STORAGE_KEY, "{not json")
    expect(readClipClipboard("me")).toBeNull()
    store.set(
      CLIP_CLIPBOARD_STORAGE_KEY,
      JSON.stringify({ ownerId: "me", clips: [{ clip: { id: "x" }, lane: 0 }] })
    )
    expect(readClipClipboard("me")).toBeNull()
  })
})

describe("getting a copy ready to paste", () => {
  const copied = copyClips(tracks, ["a", "b"])!

  it("names every file once", () => {
    const twice = copyClips(
      [{ id: "l", muted: false, clips: [footage("a", 0), footage("a2", 2_000, { mediaId: "media-a" })] }],
      ["a", "a2"]
    )!
    expect(clipboardMediaIds(twice)).toEqual(["media-a"])
  })

  it("gives every clip a new id", () => {
    const { clips } = prepareClipsForPaste(copied, [])
    expect(clips.map(({ clip }) => clip.id)).not.toContain("a")
    expect(clips[0].clip.mediaId).toBe("media-a")
  })

  it("turns a clip whose file is gone into a named gap", () => {
    const { clips, missingNames } = prepareClipsForPaste(copied, ["media-b"])
    const gap = clips[1].clip
    expect(missingNames).toEqual(["b.mp4"])
    expect(gap.mediaId).toBeUndefined()
    expect(gap.url).toBeUndefined()
    expect(gap.name).toBe("b.mp4 (file deleted)")
    expect(gap.startMs).toBe(1_000)
    expect(gap.durationMs).toBe(1_000)
  })
})
