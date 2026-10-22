import { eq } from "drizzle-orm"
import { describe, expect, it, vi } from "vitest"

import {
  requireCanonicalTimeline,
  summarizeTimeline,
} from "@/lib/video/timeline-schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  carouselVideoTimeline,
  makeCarouselVideo,
} from "@/server/video/carousel-video"
import { createOwnedCarousel } from "@/server/video/carousels"
import { videoProjects } from "@/server/video/schema"

// Slide files are kept in a list instead of storage, and the render queue
// refuses, as it does when it is full.
const kept = vi.hoisted(() => ({ saved: 0, discarded: 0 }))
vi.mock("@/server/video/asset-factories/media", () => ({
  saveGeneratedAsset: async () => {
    kept.saved += 1
    return { id: `slide-${kept.saved}`, storagePath: "x", url: "https://example.com/x.png" }
  },
  discardGeneratedAsset: async () => {
    kept.discarded += 1
  },
}))
vi.mock("@/server/video/render-queue", () => ({
  enqueueRenderJobs: async () => {
    throw new Error("The render queue is full. Try again in a few minutes.")
  },
}))

function stills(count: number, ms = 3000) {
  return Array.from({ length: count }, (_, index) => ({
    kind: "image" as const,
    mediaId: `slide-${index}`,
    url: `https://example.com/${index}.png`,
    name: `Slide ${index + 1}`,
    ms,
  }))
}

describe("a carousel made into a video", () => {
  it("runs 21 seconds for 7 slides at 3 seconds, with fades taking no extra time", () => {
    for (const transition of ["cut", "fade", "slide"] as const) {
      const timeline = requireCanonicalTimeline(
        carouselVideoTimeline({ slides: stills(7), transition })
      )
      expect(timeline.aspect).toBe("9:16")
      expect(summarizeTimeline(timeline).durationMs).toBe(21_000)
    }
  })

  it("puts the change asked for on every seam but the first slide's", () => {
    const [lane] = carouselVideoTimeline({
      slides: stills(3),
      transition: "fade",
    }).tracks
    expect(lane.clips.map((clip) => clip.transition?.kind ?? "none")).toEqual([
      "none",
      "crossfade",
      "crossfade",
    ])
    const [cuts] = carouselVideoTimeline({
      slides: stills(3),
      transition: "cut",
    }).tracks
    expect(cuts.clips.every((clip) => !clip.transition)).toBe(true)
  })

  it("plays a video slide for its own length", () => {
    const [lane] = carouselVideoTimeline({
      slides: [
        ...stills(1),
        {
          kind: "video",
          mediaId: "clip",
          url: "https://example.com/clip.mp4",
          name: "Clip",
          ms: 8_400,
        },
        ...stills(1),
      ],
      transition: "slide",
    }).tracks
    expect(lane.clips.map((clip) => [clip.startMs, clip.durationMs])).toEqual([
      [0, 3000],
      [3000, 8400],
      [11_400, 3000],
    ])
  })

  it("lays the music under the whole video, ducked, on its own lane", () => {
    const timeline = carouselVideoTimeline({
      slides: stills(4),
      transition: "cut",
      music: {
        mediaId: "song",
        url: "https://example.com/song.mp3",
        name: "Song",
        sourceDurationMs: 5_000,
      },
    })
    const music = timeline.tracks[1]
    expect(music.duck).toBe(true)
    const end = Math.max(...music.clips.map((clip) => clip.startMs + clip.durationMs))
    expect(end).toBe(12_000)
  })
})

describe("making the video", () => {
  it("leaves no project and no slide files behind when the queue refuses it", async () => {
    const { client, db: database } = await createTestDatabase()
    try {
      const user = await insertUser(database)
      const carousel = await createOwnedCarousel(user.id, "Tips", database)
      await expect(
        makeCarouselVideo({
          userId: user.id,
          carouselId: carousel.id,
          secondsPerSlide: 3,
          transition: "fade",
          database,
        })
      ).rejects.toThrow("render queue is full")
      expect(kept.saved).toBeGreaterThan(0)
      expect(kept.discarded).toBe(kept.saved)
      const projects = await database
        .select({ id: videoProjects.id })
        .from(videoProjects)
        .where(eq(videoProjects.userId, user.id))
      expect(projects).toEqual([])
    } finally {
      await client.close()
    }
  }, 20_000)
})
