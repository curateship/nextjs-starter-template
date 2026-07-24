// Clip transitions: a blend rendered at the seam between two adjacent visual
// clips instead of a hard cut. The descriptor lives on the INCOMING clip
// (`clip.transition`) and describes the seam entering it. Absent = hard cut,
// so old timelines are byte-for-byte unaffected.
//
// This module is the single source of truth shared by the schema, the editor
// preview, the ffmpeg renderer, and the inspector UI, so all four agree on
// which seams carry a transition and how long it lasts.

export const TRANSITION_KINDS = ["crossfade", "dip", "slide"] as const
export type TransitionKind = (typeof TRANSITION_KINDS)[number]

export type ClipTransition = { kind: TransitionKind; durationMs: number }

// Slider bounds. The effective length is additionally capped to the shorter of
// the two clips at the seam (see clampTransitionMs) so neither is consumed.
export const MIN_TRANSITION_MS = 100
export const MAX_TRANSITION_MS = 2000
export const DEFAULT_TRANSITION_MS = 500

// Two clips must butt within this tolerance (ms) to blend at their seam; a real
// gap between them is a hard cut with empty space, not a transition.
export const TRANSITION_ADJACENCY_EPS_MS = 1

// Inspector choices: "none" clears the transition, the rest set kind+duration.
export const TRANSITION_OPTIONS: {
  id: TransitionKind | "none"
  label: string
  description: string
}[] = [
  { id: "none", label: "None", description: "Hard cut — no blend." },
  {
    id: "crossfade",
    label: "Crossfade",
    description: "Dissolve the previous clip into this one.",
  },
  {
    id: "dip",
    label: "Dip to black",
    description: "Briefly fade through black between the clips.",
  },
  {
    id: "slide",
    label: "Slide",
    description: "Slide this clip in over the previous one.",
  },
]

// Only visual media (video/image) blends. Audio has no visual seam and text
// overlays are composited on their own track, so both keep hard cuts.
export function isTransitionableKind(kind: string): boolean {
  return kind === "video" || kind === "image"
}

// The minimal clip shape the resolver needs, so this stays decoupled from the
// editor's full EditorClip type (which lives in a client module).
type SeamClip = {
  id: string
  kind: string
  startMs: number
  durationMs: number
  transition?: ClipTransition
}

// Clamp a requested transition length to something both clips can afford: never
// longer than the shorter neighbour (so a clip is never fully swallowed by its
// seam) and never past the hard MAX.
export function clampTransitionMs(
  requestedMs: number,
  outgoingDurationMs: number,
  incomingDurationMs: number
): number {
  const ceiling = Math.min(
    MAX_TRANSITION_MS,
    outgoingDurationMs,
    incomingDurationMs
  )
  if (!(ceiling > 0)) return 0
  const clamped = Math.min(Math.max(requestedMs, MIN_TRANSITION_MS), ceiling)
  return Math.round(clamped)
}

// The clip immediately before `clip` on the same track (largest start earlier
// than this clip's). Clips are stored non-overlapping and sorted, but this
// tolerates an unsorted list.
export function precedingClipOnTrack<T extends SeamClip>(
  clips: T[],
  clip: SeamClip
): T | null {
  let best: T | null = null
  for (const candidate of clips) {
    if (candidate.id === clip.id) continue
    if (
      candidate.startMs < clip.startMs &&
      (!best || candidate.startMs > best.startMs)
    ) {
      best = candidate
    }
  }
  return best
}

// Resolve the transition to render at the seam entering `clip`, or null for a
// hard cut. Returns null unless: the clip carries a transition, both it and its
// predecessor are visual, they butt within the adjacency tolerance, and the
// clamped length is positive. The returned duration is already clamped, so
// preview and export use identical timing.
export function resolveIncomingTransition(
  clip: SeamClip,
  prevClip: SeamClip | null
): ClipTransition | null {
  const transition = clip.transition
  if (!transition) return null
  if (!isTransitionableKind(clip.kind)) return null
  if (!prevClip || !isTransitionableKind(prevClip.kind)) return null

  const gapMs = clip.startMs - (prevClip.startMs + prevClip.durationMs)
  if (Math.abs(gapMs) > TRANSITION_ADJACENCY_EPS_MS) return null

  const durationMs = clampTransitionMs(
    transition.durationMs,
    prevClip.durationMs,
    clip.durationMs
  )
  if (durationMs <= 0) return null
  return { kind: transition.kind, durationMs }
}

// Preview-only visual state for a crossfade/slide while the incoming clip is
// drawn early over the outgoing one (the "reach-back" window [start-D, start]).
// The renderer bakes the equivalent with ffmpeg fade/overlay expressions.
//   opacity      — incoming clip alpha (crossfade ramps 0->1; slide stays 1)
//   translateXPct — horizontal offset as a % of the clip's own width (slide)
export type TransitionReachState = { opacity: number; translateXPct: number }

// Progress 0->1 across the reach-back window, then the settled look at/after the
// seam. `dip` never reaches back (it is a separate black overlay), so callers
// should not pass it here.
export function transitionReachState(
  kind: TransitionKind,
  seamMs: number,
  durationMs: number,
  timeMs: number
): TransitionReachState {
  if (timeMs >= seamMs || durationMs <= 0) {
    return { opacity: 1, translateXPct: 0 }
  }
  const progress = Math.min(
    1,
    Math.max(0, (timeMs - (seamMs - durationMs)) / durationMs)
  )
  if (kind === "slide") {
    return { opacity: 1, translateXPct: (1 - progress) * 100 }
  }
  // crossfade (and any non-slide reach-back)
  return { opacity: progress, translateXPct: 0 }
}

// Dip-to-black opacity of the black overlay at `timeMs`: a triangle peaking at
// full black on the seam and back to clear at the window edges.
export function dipOpacityAt(
  seamMs: number,
  durationMs: number,
  timeMs: number
): number {
  const half = durationMs / 2
  if (half <= 0) return 0
  const distance = Math.abs(timeMs - seamMs)
  if (distance >= half) return 0
  return 1 - distance / half
}
