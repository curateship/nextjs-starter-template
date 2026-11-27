/**
 * Where a new sound goes when nothing says which lane (ai-sound-effects.md,
 * fix-a-word.md): the first lane holding only sound that has room for it,
 * never a video's lane, the Ads lane or a locked one.
 */
type LaneClip = { kind: string; startMs: number; durationMs: number }
type Lane = { id: string; ads?: boolean; locked?: boolean; clips: LaneClip[] }

/** The lane's place in the list, or -1 when the sound needs a lane of its own. */
export function soundLaneIndex(tracks: Lane[], atMs: number, durationMs: number) {
  const endMs = atMs + durationMs
  return tracks.findIndex(
    (track) =>
      !track.ads &&
      !track.locked &&
      track.clips.length > 0 &&
      track.clips.every((clip) => clip.kind === "audio") &&
      track.clips.every((clip) => endMs <= clip.startMs || atMs >= clip.startMs + clip.durationMs)
  )
}

/** The same lane by its id, or null. */
export function soundLaneAt(tracks: Lane[], atMs: number, durationMs: number) {
  return tracks[soundLaneIndex(tracks, atMs, durationMs)]?.id ?? null
}
