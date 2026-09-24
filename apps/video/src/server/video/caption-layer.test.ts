import { describe, expect, it } from "vitest"

import { captionLayerSegments } from "./caption-layer"

/** At 30 frames a second, 1.5 seconds is frame 45. */
const FPS = 30

describe("flattening captions into one layer", () => {
  it("gives a caption on its own the frames from its start to its end", () => {
    expect(
      captionLayerSegments(
        [
          {
            startMs: 1_000,
            durationMs: 1_000,
            pieces: [{ fromMs: 0, toMs: 1_000, picture: "a" }],
          },
        ],
        FPS
      )
    ).toEqual([
      // Ends exactly on frame 60, so it shows on that frame too.
      { fromFrame: 30, toFrame: 61, pictures: ["a"] },
    ])
  })

  it("shares the frame where one caption ends and the next begins", () => {
    expect(
      captionLayerSegments(
        [
          {
            startMs: 0,
            durationMs: 1_500,
            pieces: [{ fromMs: 0, toMs: 1_500, picture: "a" }],
          },
          {
            startMs: 1_500,
            durationMs: 1_500,
            pieces: [{ fromMs: 0, toMs: 1_500, picture: "b" }],
          },
        ],
        FPS
      )
    ).toEqual([
      { fromFrame: 0, toFrame: 45, pictures: ["a"] },
      { fromFrame: 45, toFrame: 46, pictures: ["a", "b"] },
      { fromFrame: 46, toFrame: 91, pictures: ["b"] },
    ])
  })

  it("leaves an empty stretch between captions that do not touch", () => {
    const segments = captionLayerSegments(
      [
        {
          startMs: 0,
          durationMs: 1_010,
          pieces: [{ fromMs: 0, toMs: 1_010, picture: "a" }],
        },
        {
          startMs: 2_000,
          durationMs: 1_000,
          pieces: [{ fromMs: 0, toMs: 1_000, picture: "b" }],
        },
      ],
      FPS
    )
    expect(segments.map((segment) => segment.pictures)).toEqual([
      ["a"],
      [],
      ["b"],
    ])
    // 1.01 s is not on a frame, so the caption stops at frame 31.
    expect(segments[0]).toEqual({ fromFrame: 0, toFrame: 31, pictures: ["a"] })
  })

  it("steps through a caption's own pictures on the frames they are due", () => {
    expect(
      captionLayerSegments(
        [
          {
            startMs: 0,
            durationMs: 1_000,
            pieces: [
              { fromMs: 0, toMs: 350, picture: "one" },
              { fromMs: 350, toMs: 1_000, picture: "two" },
            ],
          },
        ],
        FPS
      )
    ).toEqual([
      // 350 ms is frame 10.5, so the second picture shows from frame 11.
      { fromFrame: 0, toFrame: 11, pictures: ["one"] },
      { fromFrame: 11, toFrame: 31, pictures: ["two"] },
    ])
  })

  it("draws captions on higher lanes on top", () => {
    const [segment] = captionLayerSegments(
      [
        {
          startMs: 0,
          durationMs: 990,
          pieces: [{ fromMs: 0, toMs: 990, picture: "low" }],
        },
        {
          startMs: 0,
          durationMs: 990,
          pieces: [{ fromMs: 0, toMs: 990, picture: "high" }],
        },
      ],
      FPS
    )
    expect(segment.pictures).toEqual(["low", "high"])
  })

  it("leaves out a picture too short to reach a frame", () => {
    expect(
      captionLayerSegments(
        [
          {
            startMs: 5,
            durationMs: 20,
            pieces: [{ fromMs: 0, toMs: 20, picture: "a" }],
          },
        ],
        FPS
      )
    ).toEqual([])
  })
})

describe("flattening many captions", () => {
  /**
   * The same answer worked out the slow way: each caption placed on its own,
   * then every caption asked at every frame, lowest lane first.
   */
  function slowly(
    clips: Parameters<typeof captionLayerSegments<string>>[0],
    lastFrame: number
  ) {
    const alone = clips.map((clip) => captionLayerSegments([clip], FPS))
    const frames: string[] = []
    for (let frame = 0; frame < lastFrame; frame += 1) {
      const showing: string[] = []
      for (const segments of alone) {
        const hit = segments.find(
          (segment) => segment.fromFrame <= frame && frame < segment.toFrame
        )
        if (hit) showing.push(...hit.pictures)
      }
      frames.push(showing.join("+"))
    }
    return frames
  }

  function frameByFrame(
    segments: ReturnType<typeof captionLayerSegments<string>>,
    lastFrame: number
  ) {
    const frames: string[] = []
    for (let frame = 0; frame < lastFrame; frame += 1) {
      const hit = segments.find(
        (segment) => segment.fromFrame <= frame && frame < segment.toFrame
      )
      frames.push(hit ? hit.pictures.join("+") : "")
    }
    return frames
  }

  it("matches working it out frame by frame, however the captions overlap", () => {
    // A fixed sequence standing in for random numbers, so a failure repeats.
    let seed = 7
    const next = (below: number) => {
      seed = (seed * 48_271) % 2_147_483_647
      return seed % below
    }
    const clips = Array.from({ length: 60 }, (_, index) => {
      const durationMs = 200 + next(2_000)
      const cut = 10 + next(durationMs - 20)
      return {
        startMs: next(20_000),
        durationMs,
        pieces: [
          { fromMs: 0, toMs: cut, picture: `${index}a` },
          { fromMs: cut, toMs: durationMs, picture: `${index}b` },
        ],
      }
    })
    const lastFrame = 30 * 23
    expect(frameByFrame(captionLayerSegments(clips, FPS), lastFrame)).toEqual(
      slowly(clips, lastFrame)
    )
  })

  it("handles the most captions a timeline can hold", () => {
    // 50 lanes of 500 captions, all inside ten minutes.
    const clips = Array.from({ length: 25_000 }, (_, index) => ({
      startMs: (index % 500) * 1_200,
      durationMs: 1_000,
      pieces: [{ fromMs: 0, toMs: 1_000, picture: String(index) }],
    }))
    const started = performance.now()
    const segments = captionLayerSegments(clips, FPS)
    expect(segments).toHaveLength(999)
    expect(segments[0].pictures).toHaveLength(50)
    // Seconds, not minutes: generous so a busy machine never fails it.
    expect(performance.now() - started).toBeLessThan(5_000)
  })
})
