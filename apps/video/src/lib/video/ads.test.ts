import { describe, expect, it } from "vitest"

import {
  AD_TOO_SHORT_MESSAGE,
  DEFAULT_AD_RULES,
  DEFAULT_TEXT_AD_LOOK,
  TEXT_AD_MS,
  adBreakTimes,
  adCountForLength,
  adLoad,
  adSpots,
  adsOf,
  adsOfTimeline,
  changeAd,
  clipAdTemplate,
  fitAdToLength,
  formatAdLength,
  layAd,
  matchedVolume,
  moveAd,
  pauseAtAds,
  placeAdAtEdge,
  placeAds,
  readAdRules,
  removeAd,
  removeAllAds,
  respaceAds,
  speechSpans,
  swapAds,
  textAdSafeBox,
  textAdTemplate,
  videoEndMs,
  viewerSpots,
  voiceMediaId,
  watchingAroundAd,
  type AdTemplate,
} from "@/lib/video/ads"
import { DEFAULT_SAFE_BOXES } from "@/lib/video/safe-box"
import { timelineSchema, type ProjectTimeline } from "@/lib/video/timeline-schema"

type Track = ProjectTimeline["tracks"][number]
type Clip = Track["clips"][number]

const MIN = 60_000

let next = 0
const newId = () => `id-${++next}`

function footage(durationMs: number, extra: Partial<Clip> = {}): Clip {
  return {
    id: "footage",
    kind: "video",
    name: "Talk",
    mediaId: "talk",
    url: "https://example.com/talk.mp4",
    startMs: 0,
    durationMs,
    trimStartMs: 0,
    sourceDurationMs: durationMs,
    ...extra,
  }
}

function lane(id: string, clips: Clip[], extra: Partial<Track> = {}): Track {
  return { id, muted: false, clips, ...extra }
}

function sponsor(durationMs = 30_000, mode: "pause" | "over" = "pause"): AdTemplate {
  return clipAdTemplate({
    shelfId: "shelf-1",
    name: "Sponsor",
    mediaId: "sponsor",
    url: "https://example.com/sponsor.mp4",
    fileType: "video",
    durationMs,
    mode,
  })
}

function placed(tracks: Track[] | { refusal: string }) {
  if (!Array.isArray(tracks)) throw new Error(tracks.refusal)
  return tracks
}

function adStarts(tracks: Track[]) {
  return adsOf(tracks).map(({ clip }) => clip.startMs)
}

describe("how many ads the rules give a video", () => {
  it("none under a minute, one up to 8 minutes, then one every 4", () => {
    expect(adCountForLength(30_000, DEFAULT_AD_RULES)).toBe(0)
    expect(adCountForLength(5 * MIN, DEFAULT_AD_RULES)).toBe(1)
    expect(adCountForLength(8 * MIN, DEFAULT_AD_RULES)).toBe(1)
    expect(adCountForLength(9 * MIN, DEFAULT_AD_RULES)).toBe(2)
    expect(adCountForLength(12 * MIN, DEFAULT_AD_RULES)).toBe(3)
  })

  it("reads saved rules field by field, keeping the defaults for anything unreadable", () => {
    expect(readAdRules({ oneEveryMinutes: 3, limitPercent: "lots" })).toEqual({
      ...DEFAULT_AD_RULES,
      oneEveryMinutes: 3,
    })
    expect(readAdRules(null)).toEqual(DEFAULT_AD_RULES)
  })
})

describe("placing ads in equal parts", () => {
  it("puts 3 ads over a 12 minute video at 3:00, 6:00 and 9:00", () => {
    const tracks = placed(
      placeAds([lane("a", [footage(12 * MIN)])], sponsor(30_000, "over"), 3, newId)
    )
    expect(adStarts(tracks)).toEqual([3 * MIN, 6 * MIN, 9 * MIN])
    // Every ad is on one Ads lane at the top, and the footage lane holds none.
    expect(tracks[0].ads).toBe(true)
    expect(tracks[0].clips).toHaveLength(3)
    expect(tracks[1].clips.every((clip) => !clip.ad)).toBe(true)
    expect(videoEndMs(tracks)).toBe(12 * MIN)
  })

  it("cuts the video at each pause ad and carries on after it", () => {
    const tracks = placed(placeAds([lane("a", [footage(12 * MIN)])], sponsor(), 3, newId))
    // Each ad pushes the ones after it 30 seconds later.
    expect(adStarts(tracks)).toEqual([3 * MIN, 6.5 * MIN, 10 * MIN])
    const pieces = tracks[1].clips
    expect(pieces.map((clip) => [clip.startMs, clip.durationMs, clip.trimStartMs])).toEqual([
      [0, 3 * MIN, 0],
      [3.5 * MIN, 3 * MIN, 3 * MIN],
      [7 * MIN, 3 * MIN, 6 * MIN],
      [10.5 * MIN, 3 * MIN, 9 * MIN],
    ])
    expect(videoEndMs(tracks)).toBe(13.5 * MIN)
    // What is saved still reads.
    expect(timelineSchema.safeParse({ tracks, aspect: "9:16" }).success).toBe(true)
  })

  it("lays a fresh set when pressed again, and keeps an ad put by hand", () => {
    const once = placed(placeAds([lane("a", [footage(12 * MIN)])], sponsor(), 3, newId))
    const byHand = layAd(once, sponsor(10_000, "over"), 30_000, newId)
    if ("refusal" in byHand) throw new Error(byHand.refusal)
    const twice = placed(placeAds(byHand.tracks, sponsor(), 2, newId))
    expect(adsOf(twice).filter(({ clip }) => clip.ad.auto)).toHaveLength(2)
    expect(adsOf(twice).filter(({ clip }) => !clip.ad.auto)).toHaveLength(1)
    // The footage went back together before the new set was cut in.
    expect(twice.find((track) => !track.ads)?.clips).toHaveLength(3)
  })

  it("keeps the first minute and the last 30 seconds clear", () => {
    const tracks = placed(
      placeAds([lane("a", [footage(3 * MIN)])], sponsor(10_000, "over"), 2, newId)
    )
    for (const start of adStarts(tracks)) {
      expect(start).toBeGreaterThanOrEqual(MIN)
      expect(start).toBeLessThanOrEqual(2.5 * MIN)
    }
  })

  it("says so when the video is too short to leave any room", () => {
    expect(placeAds([lane("a", [footage(80_000)])], sponsor(), 1, newId)).toEqual({
      refusal: AD_TOO_SHORT_MESSAGE,
    })
  })
})

describe("ads land at pauses", () => {
  // Captions with words every 500ms, except a long pause at 2:58 to 2:59.
  function captions(): Clip {
    const wordTimes: { startMs: number; endMs: number }[] = []
    for (let ms = 0; ms < 6 * MIN; ms += 500) {
      if (ms >= 178_000 && ms < 179_000) continue
      wordTimes.push({ startMs: ms, endMs: ms + 450 })
    }
    return {
      id: "words",
      kind: "text",
      name: "Captions",
      text: "words",
      fontId: DEFAULT_TEXT_AD_LOOK.fontId,
      startMs: 0,
      durationMs: 6 * MIN,
      trimStartMs: 0,
      wordTimes,
    }
  }

  it("moves an ad to the nearest pause between sentences", () => {
    const spots = adSpots({
      lengthMs: 6 * MIN,
      count: 1,
      spans: speechSpans([lane("c", [captions()])]),
    })
    // The gap runs from 177.95s to 179s; the ad goes in its middle.
    expect(spots).toEqual([178_475])
  })

  it("never starts an ad inside a word when there is no pause nearby", () => {
    const words: Clip = {
      ...captions(),
      wordTimes: [{ startMs: 179_000, endMs: 181_000 }],
    }
    const spots = adSpots({ lengthMs: 6 * MIN, count: 1, spans: speechSpans([lane("c", [words])]) })
    expect(spots).toEqual([181_000])
  })

  it("keeps the equal spots in a video with no voice", () => {
    expect(adSpots({ lengthMs: 12 * MIN, count: 3, spans: [] })).toEqual([3 * MIN, 6 * MIN, 9 * MIN])
  })
})

describe("taking ads off and changing them", () => {
  it("closes the gap and puts the footage back in one piece", () => {
    const tracks = placed(placeAds([lane("a", [footage(12 * MIN)])], sponsor(), 1, newId))
    const [{ clip }] = adsOf(tracks)
    const without = removeAd(tracks, clip.id)
    expect(without).toEqual([lane("a", [footage(12 * MIN)])])
  })

  it("takes every ad off at once", () => {
    const tracks = placed(placeAds([lane("a", [footage(12 * MIN)])], sponsor(), 3, newId))
    expect(removeAllAds(tracks)).toEqual([lane("a", [footage(12 * MIN)])])
  })

  it("switches an ad from pausing the video to playing over it", () => {
    const tracks = placed(placeAds([lane("a", [footage(12 * MIN)])], sponsor(), 1, newId))
    const [{ clip }] = adsOf(tracks)
    const over = placed(
      changeAd(tracks, clip.id, (old) => ({ ad: { ...old.ad, mode: "over" } }), newId)
    )
    expect(videoEndMs(over)).toBe(12 * MIN)
    expect(adsOf(over)[0].clip).toMatchObject({ id: clip.id, startMs: 6 * MIN })
  })

  it("forgets an ad was placed once it is moved by hand", () => {
    const tracks = placed(placeAds([lane("a", [footage(12 * MIN)])], sponsor(), 1, newId))
    const [{ clip }] = adsOf(tracks)
    const moved = placed(moveAd(tracks, clip.id, 8 * MIN, newId))
    const [{ clip: after }] = adsOf(moved)
    expect(after.ad.auto).toBeUndefined()
    // 8:00 on the old timeline is 7:30 once the ad's own 30 seconds close.
    expect(after.startMs).toBe(7.5 * MIN)
    expect(videoEndMs(moved)).toBe(12.5 * MIN)
  })

  it("puts an ad at the very start or the very end on purpose", () => {
    const start = placeAdAtEdge([lane("a", [footage(12 * MIN)])], sponsor(), "start", newId)
    if ("refusal" in start) throw new Error(start.refusal)
    expect(adStarts(start.tracks)).toEqual([0])
    expect(start.tracks[1].clips[0].startMs).toBe(30_000)
    const end = placeAdAtEdge([lane("a", [footage(12 * MIN)])], sponsor(), "end", newId)
    if ("refusal" in end) throw new Error(end.refusal)
    expect(adStarts(end.tracks)).toEqual([12 * MIN])
  })

  it("swaps every ad of one sponsor for another, moving the video after a longer one", () => {
    const tracks = placed(placeAds([lane("a", [footage(12 * MIN)])], sponsor(), 3, newId))
    const other = clipAdTemplate({
      shelfId: "shelf-2",
      name: "Other",
      mediaId: "other",
      url: "https://example.com/other.mp4",
      fileType: "video",
      durationMs: 60_000,
    })
    const swapped = placed(swapAds(tracks, "shelf-1", other, newId))
    expect(adsOf(swapped).map(({ clip }) => [clip.name, clip.startMs, clip.ad.auto])).toEqual([
      ["Other", 3 * MIN, true],
      ["Other", 7 * MIN, true],
      ["Other", 11 * MIN, true],
    ])
    expect(videoEndMs(swapped)).toBe(15 * MIN)
  })
})

describe("ads stay spread after edits", () => {
  it("moves the placed ads to equal parts of the new length", () => {
    const before = placed(
      placeAds([lane("a", [footage(12 * MIN)])], sponsor(30_000, "over"), 3, newId)
    )
    // A minute cut off the end of the footage.
    const after = before.map((track) =>
      track.ads ? track : { ...track, clips: [footage(11 * MIN)] }
    )
    expect(adStarts(respaceAds(before, after, newId))).toEqual([165_000, 330_000, 495_000])
  })

  it("moves pause ads too, closing and opening their gaps", () => {
    const before = placed(placeAds([lane("a", [footage(12 * MIN)])], sponsor(), 3, newId))
    // The last piece of footage loses a minute.
    const after = before.map((track) => {
      if (track.ads) return track
      const last = track.clips.at(-1)!
      return {
        ...track,
        clips: [...track.clips.slice(0, -1), { ...last, durationMs: last.durationMs - MIN }],
      }
    })
    expect(adStarts(respaceAds(before, after, newId))).toEqual([165_000, 360_000, 555_000])
  })

  it("leaves a locked Ads lane alone", () => {
    const before = placed(
      placeAds([lane("a", [footage(12 * MIN)])], sponsor(30_000, "over"), 3, newId)
    )
    const locked = before.map((track) => (track.ads ? { ...track, locked: true } : track))
    const after = locked.map((track) =>
      track.ads ? track : { ...track, clips: [footage(11 * MIN)] }
    )
    expect(respaceAds(locked, after, newId)).toBe(after)
  })
})

describe("fitting an ad to a length", () => {
  it("fits a 33 second ad into 30 seconds by speed alone", () => {
    const clip = { ...sponsor(33_000), id: "x", startMs: 0 } as Clip
    expect(fitAdToLength(clip, 30_000)).toEqual({ speed: 1.1, durationMs: 30_000 })
  })

  it("never goes past 1.2 times, and trims the end instead", () => {
    const clip = { ...sponsor(40_000), id: "x", startMs: 0 } as Clip
    expect(fitAdToLength(clip, 30_000)).toEqual({ speed: 1.2, durationMs: 30_000 })
  })

  it("runs a text ad for that long", () => {
    const clip = { ...textAdTemplate({ text: "Hi", look: DEFAULT_TEXT_AD_LOOK, safeBox: null }), id: "t", startMs: 0 } as Clip
    expect(fitAdToLength(clip, 5_000)).toEqual({ durationMs: 5_000 })
  })
})

describe("ad volume", () => {
  it("turns a loud ad down to the voice's level", () => {
    // 6 decibels louder plays at half volume.
    expect(matchedVolume(-10, -16)).toBe(0.5)
  })

  it("leaves a quieter ad as recorded", () => {
    expect(matchedVolume(-20, -16)).toBeUndefined()
    expect(matchedVolume(null, -16)).toBeUndefined()
  })

  it("takes the voice from the file heard longest that is not music or an ad", () => {
    const tracks = [
      lane("m", [footage(12 * MIN, { id: "music", mediaId: "song" })], { duck: true }),
      lane("a", [footage(12 * MIN)]),
    ]
    expect(voiceMediaId(tracks)).toBe("talk")
  })
})

describe("text ads", () => {
  it("sit along the bottom for 8 seconds, over the video", () => {
    const template = textAdTemplate({ text: "Use code TYLER", look: DEFAULT_TEXT_AD_LOOK, safeBox: null })
    expect(template).toMatchObject({ kind: "text", durationMs: TEXT_AD_MS, y: 0.86, ad: { mode: "over" } })
  })

  it("stay inside every platform's safe box on a tall video with no platform picked", () => {
    const box = textAdSafeBox("9:16", null, DEFAULT_SAFE_BOXES)
    const template = textAdTemplate({ text: "Use code TYLER", look: DEFAULT_TEXT_AD_LOOK, safeBox: box })
    // The strictest bottom edge is Reels' 450 of 1920.
    expect(template.y).toBeLessThan(1 - 450 / 1920)
    expect(textAdSafeBox("16:9", null, DEFAULT_SAFE_BOXES)).toBeNull()
  })
})

describe("reporting the ads", () => {
  it("warns past the limit: 2 minutes of ads in 12 does, 1 min 30 does not", () => {
    const two = placed(placeAds([lane("a", [footage(12 * MIN)])], sponsor(40_000, "over"), 3, newId))
    expect(adLoad(two, 15)).toMatchObject({ count: 3, adMs: 120_000, tooMany: true })
    const less = placed(placeAds([lane("a", [footage(12 * MIN)])], sponsor(30_000, "over"), 3, newId))
    expect(adLoad(less, 15).tooMany).toBe(false)
    expect(formatAdLength(90_000)).toBe("1 min 30")
    expect(formatAdLength(12 * MIN)).toBe("12 min")
  })

  it("lists the ad break times for YouTube Studio", () => {
    const tracks = placed(placeAds([lane("a", [footage(12 * MIN)])], sponsor(), 3, newId))
    expect(adBreakTimes(tracks)).toEqual({ times: "3:00, 6:30, 10:00", tooShort: false })
    const short = placed(placeAds([lane("a", [footage(5 * MIN)])], sponsor(), 1, newId))
    expect(adBreakTimes(short).tooShort).toBe(true)
  })

  it("keeps where each ad was for the export", () => {
    const tracks = placed(placeAds([lane("a", [footage(12 * MIN)])], sponsor(), 1, newId))
    expect(adsOfTimeline(tracks, 12.5 * MIN)).toEqual([
      { startMs: 6 * MIN, endMs: 6.5 * MIN, name: "Sponsor" },
    ])
  })
})

describe("ads where viewers stay", () => {
  // Watching drops slowly, with a bump at 70% of the way through.
  const curve = (bump: number) =>
    Array.from({ length: 11 }, (_, index) => ({
      ratio: index / 10,
      watch: 1 - index * 0.05 + (index === 7 ? bump : 0),
    }))

  it("picks the spots where most people were still watching, kept apart", () => {
    const spots = viewerSpots({ curves: [curve(0.5), curve(0.4)], lengthMs: 10 * MIN, count: 2 })
    expect(spots).toHaveLength(2)
    expect(spots).toContain(7 * MIN)
  })

  it("needs at least 2 curves", () => {
    expect(viewerSpots({ curves: [curve(0.5)], lengthMs: 10 * MIN, count: 1 })).toBeNull()
  })
})

describe("viewers around an ad", () => {
  it("reads how many were watching just before and just after it", () => {
    const points = [
      { ratio: 0, watch: 1 },
      { ratio: 0.5, watch: 0.6 },
      { ratio: 1, watch: 0.2 },
    ]
    // A 100 second video, the ad from 25 to 50 seconds.
    expect(
      watchingAroundAd(points, 100, { startMs: 25_000, endMs: 50_000, name: "Ad" })
    ).toEqual({ before: 80, after: 60 })
    expect(watchingAroundAd([], 100, { startMs: 0, endMs: 1, name: "Ad" })).toBeNull()
  })
})

describe("found in review, 4 Nov 2026", () => {
  it("never cuts an ad in two when a pause ad goes in across it", () => {
    const withText = layAd(
      [lane("a", [footage(12 * MIN)])],
      textAdTemplate({ text: "Code TYLER", look: DEFAULT_TEXT_AD_LOOK, safeBox: null }),
      100_000,
      newId
    )
    if ("refusal" in withText) throw new Error(withText.refusal)
    const paused = layAd(withText.tracks, sponsor(), 104_000, newId)
    if ("refusal" in paused) throw new Error(paused.refusal)
    const ads = adsOf(paused.tracks)
    expect(ads).toHaveLength(2)
    expect(ads.find(({ clip }) => clip.kind === "text")?.clip).toMatchObject({ startMs: 100_000, durationMs: TEXT_AD_MS })
  })

  it("takes the gap out of music laid across a pause ad, so nothing overlaps", () => {
    const laid = layAd([lane("a", [footage(12 * MIN)])], sponsor(), 200_000, newId)
    if ("refusal" in laid) throw new Error(laid.refusal)
    const music: Clip[] = [
      footage(100_000, { id: "m1", mediaId: "song", startMs: 150_000, sourceDurationMs: 600_000 }),
      footage(50_000, { id: "m2", mediaId: "song2", startMs: 250_000, sourceDurationMs: 600_000 }),
    ]
    const tracks = [...laid.tracks, lane("music", music, { duck: true })]
    const removed = removeAd(tracks, laid.clipId)
    const lane2 = removed.find((track) => track.id === "music")!.clips
    for (let index = 1; index < lane2.length; index++) {
      const before = lane2[index - 1]
      expect(lane2[index].startMs).toBeGreaterThanOrEqual(before.startMs + before.durationMs)
    }
    expect(lane2.map((clip) => [clip.startMs, clip.durationMs])).toEqual([
      [150_000, 50_000],
      [200_000, 20_000],
      [220_000, 50_000],
    ])
  })

  it("makes a voice laid later pause at each pause ad", () => {
    const placed2 = placed(placeAds([lane("a", [footage(12 * MIN)])], sponsor(), 2, newId))
    const dub = footage(12 * MIN, { id: "dub", kind: "audio", mediaId: "dub" })
    const tracks = pauseAtAds([...placed2, lane("voice", [dub])], new Set(["dub"]), newId)
    const pieces = tracks.find((track) => track.id === "voice")!.clips
    expect(pieces.map((clip) => [clip.startMs, clip.trimStartMs])).toEqual([
      [0, 0],
      [4.5 * MIN, 4 * MIN],
      [9 * MIN, 8 * MIN],
    ])
  })

  it("keeps two spots apart and out of the clear ends inside one long stretch of talk", () => {
    const spots = adSpots({ lengthMs: 200_000, count: 2, spans: [{ startMs: 0, endMs: 200_000 }] })
    expect(Array.isArray(spots) && new Set(spots).size).toBe(2)
    for (const spot of spots as number[]) {
      expect(spot).toBeGreaterThanOrEqual(60_000)
      expect(spot).toBeLessThanOrEqual(170_000)
    }
  })
})
