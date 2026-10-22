import type { ProjectTimeline } from "@/lib/video/timeline-schema"

/**
 * The scenes of an export: every stretch of the file where the same picture is
 * on screen, so the retention curve can say which one people left during
 * (`workspace/docs/retention-curve.md`).
 *
 * The render works them out from the timeline it draws and keeps them with the
 * export, so editing the project afterwards never moves them. A scene starts
 * wherever a video or picture clip starts or ends, and is named after the clip
 * on the top lane at that moment. Text, sound and empty clips do not change
 * the picture, so they start no scene.
 */

export type ExportScene = {
  startMs: number
  endMs: number
  /** The clip on screen, or NOTHING_ON_SCREEN for a gap. */
  name: string
}

export const NOTHING_ON_SCREEN = "Nothing on screen"

/**
 * Two changes closer together than this are one cut. A blend between two
 * clips overlaps them for a moment, and that moment is not a scene of its own.
 */
const SHORTEST_SCENE_MS = 250

/** More than this and the strip is a smear; a timeline never gets close. */
const MAX_SCENES = 500

const NAME_MAX = 80

type Picture = { id: string; name: string; startMs: number; endMs: number; lane: number }

export function scenesOfTimeline(
  timeline: ProjectTimeline,
  lengthMs: number
): ExportScene[] {
  if (!(lengthMs > 0)) return []

  // Lane 0 is drawn on top, as the render draws it.
  const pictures: Picture[] = timeline.tracks.flatMap((track, lane) =>
    track.clips
      .filter(
        (clip) =>
          (clip.kind === "video" || clip.kind === "image") &&
          clip.mediaId &&
          clip.durationMs > 0 &&
          clip.startMs < lengthMs
      )
      .map((clip) => ({
        id: clip.id,
        name: clip.name.trim().slice(0, NAME_MAX) || "Untitled clip",
        startMs: clip.startMs,
        endMs: Math.min(lengthMs, clip.startMs + clip.durationMs),
        lane,
      }))
  )

  const cuts = [
    ...new Set([0, ...pictures.flatMap((one) => [one.startMs, one.endMs])]),
  ]
    .filter((at) => at >= 0 && at < lengthMs)
    .sort((a, b) => a - b)
  const kept: number[] = []
  for (const at of cuts) {
    if (!kept.length || at - kept[kept.length - 1] >= SHORTEST_SCENE_MS) {
      kept.push(at)
    }
  }

  const scenes: (ExportScene & { pictureId: string | null })[] = []
  kept.forEach((startMs, index) => {
    const endMs = kept[index + 1] ?? lengthMs
    const middle = (startMs + endMs) / 2
    const onTop = pictures
      .filter((one) => one.startMs <= middle && middle < one.endMs)
      .sort((a, b) => a.lane - b.lane)[0]
    const pictureId = onTop?.id ?? null
    const previous = scenes[scenes.length - 1]
    // The top clip carrying on past a change underneath it is still one scene.
    if (previous && previous.pictureId === pictureId) {
      previous.endMs = endMs
      return
    }
    scenes.push({
      startMs,
      endMs,
      name: onTop?.name ?? NOTHING_ON_SCREEN,
      pictureId,
    })
  })

  return scenes
    .slice(0, MAX_SCENES)
    .map(({ startMs, endMs, name }) => ({ startMs, endMs, name }))
}

/** The scene playing at this moment, counted from 1. Null past the end. */
export function sceneAt(
  scenes: ExportScene[],
  atMs: number
): { number: number; scene: ExportScene } | null {
  const index = scenes.findIndex(
    (scene) => scene.startMs <= atMs && atMs < scene.endMs
  )
  if (index >= 0) return { number: index + 1, scene: scenes[index] }
  // The very last moment belongs to the last scene, not to nothing.
  const last = scenes[scenes.length - 1]
  return last && atMs === last.endMs
    ? { number: scenes.length, scene: last }
    : null
}
