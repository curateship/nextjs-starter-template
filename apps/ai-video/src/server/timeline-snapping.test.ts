import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildSnapIndex,
  candidatesForTrack,
  nearestSnap,
  snapClipMove,
  snapEdge,
  snapStageCenter,
  snapThresholdMs,
  stageSnapThreshold,
  SNAP_THRESHOLD_PX,
  STAGE_SNAP_THRESHOLD_PX,
} from "../pages/video-editor/timeline-snapping.ts"

function track(
  clips: { id: string; startMs: number; durationMs: number }[]
) {
  return { clips }
}

// A three-lane project: two butting clips on lane 0, one clip on lane 1, and
// an empty lane 2 far away from both.
const TRACKS = [
  track([
    { id: "a", startMs: 0, durationMs: 3000 },
    { id: "b", startMs: 3000, durationMs: 2000 },
  ]),
  track([{ id: "c", startMs: 8000, durationMs: 1000 }]),
  track([]),
]

describe("snapThresholdMs", () => {
  it("converts the pixel threshold at the current zoom", () => {
    // 8px at 30px/s is 8/30 of a second.
    assert.equal(snapThresholdMs(30), (SNAP_THRESHOLD_PX / 30) * 1000)
  })

  it("shrinks as the timeline is zoomed in", () => {
    assert.ok(snapThresholdMs(90) < snapThresholdMs(18))
  })

  it("is zero for an unusable zoom", () => {
    assert.equal(snapThresholdMs(0), 0)
    assert.equal(snapThresholdMs(-5), 0)
  })
})

describe("buildSnapIndex", () => {
  it("collects both edges of every clip on the lane and its neighbours", () => {
    const index = buildSnapIndex({ tracks: TRACKS })
    assert.deepEqual(index.perTrack[0], [0, 3000, 5000, 8000, 9000])
  })

  it("excludes the dragged clip so it cannot snap to itself", () => {
    const index = buildSnapIndex({ tracks: TRACKS, excludeClipId: "b" })
    assert.deepEqual(index.perTrack[0], [0, 3000, 8000, 9000])
  })

  it("reaches only one lane away", () => {
    const index = buildSnapIndex({ tracks: TRACKS })
    // Lane 2's neighbours are lane 1 and lane 3 (which does not exist), so
    // lane 0's edges are out of reach.
    assert.deepEqual(index.perTrack[2], [8000, 9000])
  })

  it("adds the caller's extra positions to every lane", () => {
    const index = buildSnapIndex({ tracks: TRACKS, extraMs: [0, 4200] })
    for (const candidates of index.perTrack) {
      assert.ok(candidates.includes(0))
      assert.ok(candidates.includes(4200))
    }
  })

  it("deduplicates and sorts", () => {
    const index = buildSnapIndex({
      tracks: [track([{ id: "a", startMs: 1000, durationMs: 1000 }])],
      extraMs: [2000, 1000, 0],
    })
    assert.deepEqual(index.perTrack[0], [0, 1000, 2000])
  })

  it("handles a project with no tracks", () => {
    const index = buildSnapIndex({ tracks: [] })
    assert.deepEqual(index.perTrack, [])
    assert.deepEqual(candidatesForTrack(index, 0), [])
  })
})

describe("candidatesForTrack", () => {
  it("clamps a drag past the last lane back onto it", () => {
    const index = buildSnapIndex({ tracks: TRACKS })
    assert.deepEqual(candidatesForTrack(index, 9), index.perTrack[2])
    assert.deepEqual(candidatesForTrack(index, -3), index.perTrack[0])
  })
})

describe("nearestSnap", () => {
  const candidates = [0, 3000, 5000, 8000]

  it("finds the nearest candidate inside the threshold", () => {
    assert.equal(nearestSnap(candidates, 3080, 200), 3000)
    assert.equal(nearestSnap(candidates, 2900, 200), 3000)
  })

  it("returns null when nothing is close enough", () => {
    assert.equal(nearestSnap(candidates, 3400, 200), null)
  })

  it("includes a candidate exactly at the threshold", () => {
    assert.equal(nearestSnap(candidates, 3200, 200), 3000)
  })

  it("picks the closer of two candidates on either side", () => {
    assert.equal(nearestSnap([3000, 3400], 3300, 500), 3400)
    assert.equal(nearestSnap([3000, 3400], 3100, 500), 3000)
  })

  it("breaks an exact tie toward the earlier candidate", () => {
    assert.equal(nearestSnap([3000, 3400], 3200, 500), 3000)
  })

  it("lands exactly on a candidate it is already sitting on", () => {
    assert.equal(nearestSnap(candidates, 5000, 200), 5000)
  })

  it("snaps nothing with an empty candidate list or a zero threshold", () => {
    assert.equal(nearestSnap([], 3000, 200), null)
    assert.equal(nearestSnap(candidates, 3000, 0), null)
  })
})

describe("snapClipMove", () => {
  // Lane 0 of TRACKS with clip "a" being dragged: candidates are the edges of
  // "b" (3000/5000) and of lane 1's "c" (8000/9000).
  const candidates = [3000, 5000, 8000, 9000]

  it("closes a small gap so the clip butts the next one exactly", () => {
    const result = snapClipMove({
      candidates,
      startMs: 5040,
      durationMs: 2000,
      thresholdMs: 200,
    })
    assert.equal(result.ms, 5000)
    assert.equal(result.guideMs, 5000)
  })

  it("snaps by the trailing edge when that is the closer fit", () => {
    // A 2s clip whose tail is 30ms short of 3000 slides back to start at 1000.
    const result = snapClipMove({
      candidates,
      startMs: 970,
      durationMs: 2000,
      thresholdMs: 200,
    })
    assert.equal(result.ms, 1000)
    // The guide is drawn on the edge that was met, not on the clip's start.
    assert.equal(result.guideMs, 3000)
  })

  it("prefers the edge that needs the smaller nudge", () => {
    // Head is 100ms from 5000; the tail (7980 for a 2880ms clip) is only 20ms
    // from 8000, so the clip slides forward to meet that edge instead.
    const result = snapClipMove({
      candidates,
      startMs: 5100,
      durationMs: 2880,
      thresholdMs: 200,
    })
    assert.equal(result.ms, 5120)
    assert.equal(result.guideMs, 8000)
  })

  it("breaks a tie between the two edges toward the leading one", () => {
    // Head 60ms from 5000, tail 60ms from 8000 — the head wins, so a clip
    // dragged into a gap always reads as butting the clip before it.
    const result = snapClipMove({
      candidates,
      startMs: 5060,
      durationMs: 2880,
      thresholdMs: 200,
    })
    assert.equal(result.ms, 5000)
    assert.equal(result.guideMs, 5000)
  })

  it("leaves the position untouched when nothing is in range", () => {
    const result = snapClipMove({
      candidates,
      startMs: 6000,
      durationMs: 500,
      thresholdMs: 200,
    })
    assert.equal(result.ms, 6000)
    assert.equal(result.guideMs, null)
  })

  it("never snaps a clip to a negative start", () => {
    // The tail is near 3000 but the clip is 4s long, so a tail snap would put
    // it at -1000; it stays where the pointer left it instead.
    const result = snapClipMove({
      candidates,
      startMs: -940,
      durationMs: 4000,
      thresholdMs: 200,
    })
    assert.equal(result.ms, -940)
    assert.equal(result.guideMs, null)
  })

  it("bypasses entirely at a zero threshold (Alt held)", () => {
    const result = snapClipMove({
      candidates,
      startMs: 5040,
      durationMs: 2000,
      thresholdMs: 0,
    })
    assert.equal(result.ms, 5040)
    assert.equal(result.guideMs, null)
  })
})

describe("snapEdge", () => {
  it("pulls a trim grip onto the nearest edge", () => {
    const result = snapEdge({
      candidates: [3000, 5000],
      valueMs: 4880,
      thresholdMs: 200,
    })
    assert.equal(result.ms, 5000)
    assert.equal(result.guideMs, 5000)
  })

  it("leaves the grip alone when nothing is near", () => {
    const result = snapEdge({
      candidates: [3000, 5000],
      valueMs: 4000,
      thresholdMs: 200,
    })
    assert.equal(result.ms, 4000)
    assert.equal(result.guideMs, null)
  })
})

describe("stageSnapThreshold", () => {
  it("is the pixel threshold as a fraction of the frame", () => {
    assert.equal(stageSnapThreshold(600), STAGE_SNAP_THRESHOLD_PX / 600)
  })

  it("is zero before the stage has been measured", () => {
    assert.equal(stageSnapThreshold(0), 0)
  })
})

describe("snapStageCenter", () => {
  it("centres a text overlay that comes close to the middle", () => {
    const result = snapStageCenter({
      x: 0.505,
      y: 0.494,
      thresholdX: 0.01,
      thresholdY: 0.01,
    })
    assert.equal(result.x, 0.5)
    assert.equal(result.y, 0.5)
    assert.equal(result.snappedX, true)
    assert.equal(result.snappedY, true)
  })

  it("snaps each axis on its own", () => {
    const result = snapStageCenter({
      x: 0.502,
      y: 0.86,
      thresholdX: 0.01,
      thresholdY: 0.01,
    })
    assert.equal(result.x, 0.5)
    assert.equal(result.y, 0.86)
    assert.equal(result.snappedX, true)
    assert.equal(result.snappedY, false)
  })

  it("leaves a position that is nowhere near the centre", () => {
    const result = snapStageCenter({
      x: 0.2,
      y: 0.9,
      thresholdX: 0.01,
      thresholdY: 0.01,
    })
    assert.equal(result.x, 0.2)
    assert.equal(result.y, 0.9)
    assert.equal(result.snappedX, false)
    assert.equal(result.snappedY, false)
  })

  it("bypasses entirely at a zero threshold (Alt held)", () => {
    const result = snapStageCenter({
      x: 0.5001,
      y: 0.5001,
      thresholdX: 0,
      thresholdY: 0,
    })
    assert.equal(result.x, 0.5001)
    assert.equal(result.y, 0.5001)
    assert.equal(result.snappedX, false)
    assert.equal(result.snappedY, false)
  })
})

describe("no-gap guarantee", () => {
  it("lands a dragged clip exactly adjacent at every zoom level", () => {
    // The acceptance criterion: whatever the zoom, releasing near a neighbour's
    // edge must produce a start equal to that edge — not one millisecond off.
    for (const pxPerSecond of [18, 30, 48, 90]) {
      const index = buildSnapIndex({
        tracks: TRACKS,
        excludeClipId: "a",
        extraMs: [0],
      })
      const thresholdMs = snapThresholdMs(pxPerSecond)
      // Two pixels of pointer slop, in ms at this zoom.
      const slopMs = (2 / pxPerSecond) * 1000
      const result = snapClipMove({
        candidates: candidatesForTrack(index, 0),
        startMs: 5000 + slopMs,
        durationMs: 1500,
        thresholdMs,
      })
      assert.equal(result.ms, 5000, `zoom ${pxPerSecond}`)
      assert.equal(
        result.ms,
        TRACKS[0].clips[1].startMs + TRACKS[0].clips[1].durationMs
      )
    }
  })
})
