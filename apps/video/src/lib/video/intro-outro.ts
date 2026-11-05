/**
 * A project's intro and outro (`workspace/docs/intro-and-outro.md`): a video
 * picked in Project settings, added before and after every export of every
 * video in the project. Tyler, 4 Nov 2026: "Per project".
 *
 * They go around the timeline the export draws, never into the editor's:
 * everything moves later by the intro's length, the intro plays first on a
 * lane of its own, and the outro plays after the last clip. Because the
 * export then reads an ordinary timeline, its scene lines, ads and chapters
 * all count the intro without being told.
 */

import type { TimelineMarker } from "./timeline-markers"

export const INTRO_CHAPTER = "Intro"

export type IntroOutroPart = { mediaId: string; durationMs: number }

type WrapClip = { startMs: number }
type WrapTrack<C extends WrapClip> = { id: string; muted: boolean; clips: C[] }
type WrapTimeline<C extends WrapClip> = {
  tracks: WrapTrack<C>[]
  markers?: TimelineMarker[]
}

function introOutroClip(id: string, name: string, part: IntroOutroPart, startMs: number) {
  return {
    id,
    kind: "video" as const,
    name,
    mediaId: part.mediaId,
    startMs,
    durationMs: part.durationMs,
    trimStartMs: 0,
    sourceDurationMs: part.durationMs,
  }
}

/** The timeline with the intro in front and the outro after its last clip. */
export function withIntroOutro<C extends WrapClip & { durationMs: number }, T extends WrapTimeline<C>>(
  timeline: T,
  { intro, outro }: { intro?: IntroOutroPart | null; outro?: IntroOutroPart | null }
): T {
  if (!intro && !outro) return timeline
  const introMs = intro?.durationMs ?? 0
  const tracks = timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => ({ ...clip, startMs: clip.startMs + introMs })),
  }))
  const endMs = tracks.reduce(
    (latest, track) =>
      Math.max(latest, ...track.clips.map((clip) => clip.startMs + clip.durationMs)),
    introMs
  )
  const added = [
    ...(intro ? [introOutroClip("intro", "Intro", intro, 0)] : []),
    ...(outro ? [introOutroClip("outro", "Outro", outro, endMs)] : []),
  ]
  const markers = (timeline.markers ?? []).map((marker) => ({
    ...marker,
    atMs: marker.atMs + introMs,
  }))
  return {
    ...timeline,
    tracks: [...tracks, { id: "intro-outro", muted: false, clips: added as unknown as C[] }],
    markers: intro
      ? [{ id: "intro", atMs: 0, name: INTRO_CHAPTER }, ...markers]
      : markers,
  }
}
