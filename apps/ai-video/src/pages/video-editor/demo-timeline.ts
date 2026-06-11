// Static demo data + layout math for the UI-only video editor timeline.
// The DEMO_* values are throwaway mock content: they get deleted once real
// editing functionality (project loading, clip manipulation) is built.

export type TimelineClipKind = "text" | "video" | "audio"

export type TimelineClip = {
  id: string
  kind: TimelineClipKind
  label: string
  startMs: number
  durationMs: number
}

export type TimelineTrack = {
  id: string
  clips: TimelineClip[]
}

// Horizontal scale: how many pixels one second of timeline occupies.
export const PX_PER_SECOND = 40

// Width of the sticky per-track controls gutter (must match Tailwind w-24 = 96px).
export const TIMELINE_GUTTER_PX = 96

// Total demo project length shown in the ruler and transport readout (33.7s).
export const DEMO_DURATION_MS = 33_700

// Convert a timeline position/duration in ms to pixels at the fixed scale.
export function msToPx(ms: number) {
  return (ms / 1000) * PX_PER_SECOND
}

// Format ms as "m:ss.cc" for the transport readout (33_700 -> "0:33.70").
export function formatTimecode(ms: number) {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds - minutes * 60
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`
}

// Deterministic ids for the hardcoded clips below.
let demoClipCount = 0
function clip(
  kind: TimelineClipKind,
  label: string,
  startMs: number,
  durationMs: number
): TimelineClip {
  demoClipCount += 1
  return { id: `demo-clip-${demoClipCount}`, kind, label, startMs, durationMs }
}

// Six tracks mirroring the reference mock: text overlays, filmstrip video
// clips spread across lanes, and one long music bed at the bottom.
export const DEMO_TRACKS: TimelineTrack[] = [
  {
    id: "demo-track-1",
    clips: [clip("text", "What are you waiting for?", 300, 3200)],
  },
  {
    id: "demo-track-2",
    clips: [
      clip("video", "rocket-launch.mp4", 0, 12_500),
      clip("text", "React Video Editor is building for the future", 26_200, 3600),
      clip("text", "There's never been a better time to build", 30_200, 3500),
    ],
  },
  {
    id: "demo-track-3",
    clips: [
      clip("text", "Video AI is evolving faster than ever", 4000, 3600),
      clip("text", "Theres never been", 8200, 2200),
      clip("video", "crowd-concert.mp4", 14_500, 6500),
    ],
  },
  {
    id: "demo-track-4",
    clips: [clip("video", "stage-lights.mp4", 25_300, 8400)],
  },
  {
    id: "demo-track-5",
    clips: [
      clip("video", "earth-orbit.mp4", 10_500, 6500),
      clip("video", "jellyfish-deep.mp4", 19_500, 6000),
    ],
  },
  {
    id: "demo-track-6",
    clips: [clip("audio", "Another Lowfi", 0, 30_000)],
  },
]
