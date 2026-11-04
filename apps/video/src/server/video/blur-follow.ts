import { z } from "zod"

import {
  BLUR_NOT_FOUND_MESSAGE,
  BLUR_NOTHING_UNDER_MESSAGE,
  BLUR_TRACK_STEP_MS,
  blurFollowMoments,
  cleanBlurTrack,
  isBlurClip,
  type BlurTrackPoint,
  type ShareBox,
} from "@/lib/video/blur"
import {
  BLUR_FOLLOW_FRAMES_PER_ASK,
  blurFollowCostCents,
  findFacesCostCents,
  PICTURE_READER_MODEL,
} from "@/lib/video/ai-estimates"
import { requireCanonicalTimeline } from "@/lib/video/timeline-schema"
import { runAiCall } from "@/server/ai/usage"
import { generateJson, requireGeminiKey } from "@/server/video/gemini"
import {
  requireVideoBudget,
  videoSpendMetadata,
} from "@/server/video/project-spend"
import { getOwnedVideo } from "@/server/video/project-videos"
import { renderTimelineStills } from "@/server/video/render"

/**
 * Blur that follows something (blur.md): the frames under a blur, read by
 * Gemini, turned into the places the blur's middle moves through.
 *
 * The frames are drawn from the lanes under the blur only, so the blur itself
 * and anything laid over it never hide what is being followed. Each is a
 * small still at most 384 pixels on its longer side, because Gemini needs
 * nothing bigger to find a face and a small picture is cheaper to send.
 *
 * Nothing is saved here. The places go back to the editor, which puts them
 * on the clip as one undo step, the same as any other edit.
 */

const STILL_MAX_SIDE = 384

/** Gemini's own box: top, left, bottom, right, each out of 1000. */
const box2d = z.tuple([z.number(), z.number(), z.number(), z.number()])

const followSchema = z.object({
  frames: z
    .array(
      z.object({
        index: z.number().int(),
        found: z.boolean(),
        box_2d: box2d.optional(),
      })
    )
    .max(200),
})

const facesSchema = z.object({
  faces: z.array(z.object({ box_2d: box2d })).max(40),
})

function toShareBox([top, left, bottom, right]: z.infer<typeof box2d>): ShareBox | null {
  const clamp = (value: number) => Math.min(1, Math.max(0, value / 1000))
  const box = {
    left: clamp(Math.min(left, right)),
    top: clamp(Math.min(top, bottom)),
    width: clamp(Math.abs(right - left)),
    height: clamp(Math.abs(bottom - top)),
  }
  return box.width > 0.002 && box.height > 0.002 ? box : null
}

function toBox2d(box: ShareBox) {
  const at = (value: number) => Math.round(value * 1000)
  return [at(box.top), at(box.left), at(box.top + box.height), at(box.left + box.width)]
}

function jpegPart(bytes: Uint8Array) {
  return {
    inline_data: { mime_type: "image/jpeg", data: Buffer.from(bytes).toString("base64") },
  }
}

/**
 * The saved blur and the timeline of only the lanes under it. The editor
 * sends any waiting edit before asking, so the saved timeline is the one on
 * screen.
 */
function blurAndLanesUnder(rawTimeline: unknown, clipId: string) {
  const timeline = requireCanonicalTimeline(rawTimeline)
  const trackIndex = timeline.tracks.findIndex((track) =>
    track.clips.some((clip) => clip.id === clipId)
  )
  const clip = timeline.tracks[trackIndex]?.clips.find((one) => one.id === clipId)
  if (!clip || !isBlurClip(clip)) throw new Error(BLUR_NOT_FOUND_MESSAGE)
  const under = { ...timeline, tracks: timeline.tracks.slice(trackIndex + 1) }
  return { clip, under }
}

async function stillsUnder(
  userId: string,
  rawTimeline: unknown,
  clipId: string,
  lastMs: number
) {
  const { clip, under } = blurAndLanesUnder(rawTimeline, clipId)
  try {
    const stills = await renderTimelineStills({
      userId,
      timeline: under,
      fromMs: clip.startMs,
      toMs: clip.startMs + Math.min(clip.durationMs, lastMs) + 1,
      everyMs: BLUR_TRACK_STEP_MS,
      maxSide: STILL_MAX_SIDE,
    })
    if (!stills.length) throw new Error(BLUR_NOTHING_UNDER_MESSAGE)
    return { clip, stills }
  } catch (error) {
    if (error instanceof Error && error.message === BLUR_NOTHING_UNDER_MESSAGE) throw error
    console.error("Drawing the frames under a blur failed", error)
    throw new Error(BLUR_NOTHING_UNDER_MESSAGE)
  }
}

/**
 * The faces on the blur's first frame, biggest first, as boxes of the frame.
 * The editor numbers them on the preview and follows the one picked.
 */
export async function findFacesUnderBlur({
  userId,
  videoId,
  clipId,
}: {
  userId: string
  videoId: string
  clipId: string
}): Promise<ShareBox[]> {
  const video = await requireVideoBudget(userId, videoId, findFacesCostCents())
  const apiKey = await requireGeminiKey()
  const { stills } = await stillsUnder(userId, video.timeline, clipId, 0)
  const answer = await runAiCall(
    {
      userId,
      provider: "gemini",
      model: PICTURE_READER_MODEL,
      feature: "blur_faces",
      metadata: videoSpendMetadata(video),
    },
    async () => {
      const reply = await generateJson({
        apiKey,
        model: PICTURE_READER_MODEL,
        label: "Finding faces",
        schema: facesSchema,
        parts: [
          {
            text: 'Find every human face in this video frame, biggest first, at most 12. Give each as box_2d: [ymin, xmin, ymax, xmax] on a 0 to 1000 scale. Answer only JSON like {"faces":[{"box_2d":[120,340,300,470]}]}. An empty list is fine when there are none.',
          },
          jpegPart(stills[0]),
        ],
      })
      return {
        result: reply.value,
        usage: { inputTokens: reply.inputTokens, outputTokens: reply.outputTokens },
      }
    }
  )
  return answer.faces
    .map((face) => toShareBox(face.box_2d))
    .filter((box): box is ShareBox => box !== null)
    .slice(0, 12)
}

/**
 * Where the thing in `box` on the blur's first frame is in every frame after
 * it, one every half second, as the places of the box's middle. A frame the
 * thing is missing from is left out, and the blur slides straight across it.
 */
export async function followUnderBlur({
  userId,
  videoId,
  clipId,
  box,
}: {
  userId: string
  videoId: string
  clipId: string
  box: ShareBox
}): Promise<BlurTrackPoint[]> {
  const saved = blurAndLanesUnder(
    (await getOwnedVideo(userId, videoId)).timeline,
    clipId
  ).clip
  const moments = blurFollowMoments(saved.durationMs)
  const video = await requireVideoBudget(
    userId,
    videoId,
    blurFollowCostCents(moments.length)
  )
  const apiKey = await requireGeminiKey()
  const { clip, stills } = await stillsUnder(
    userId,
    video.timeline,
    clipId,
    moments[moments.length - 1]
  )
  const frames = stills.slice(0, moments.length)
  const start = { atMs: 0, x: box.left + box.width / 2, y: box.top + box.height / 2 }
  const points: BlurTrackPoint[] = [start]

  for (let first = 1; first < frames.length; first += BLUR_FOLLOW_FRAMES_PER_ASK) {
    const batch = frames.slice(first, first + BLUR_FOLLOW_FRAMES_PER_ASK)
    const answer = await runAiCall(
      {
        userId,
        provider: "gemini",
        model: PICTURE_READER_MODEL,
        feature: "blur_follow",
        metadata: videoSpendMetadata(video),
      },
      async () => {
        const reply = await generateJson({
          apiKey,
          model: PICTURE_READER_MODEL,
          label: "Following the blur",
          schema: followSchema,
          parts: [
            {
              text: `You are following one thing through frames of a video. In the first picture the thing is inside box_2d ${JSON.stringify(toBox2d(box))} ([ymin, xmin, ymax, xmax] on a 0 to 1000 scale). The ${batch.length} pictures after it are later frames, in order, numbered 1 to ${batch.length}. For each numbered frame give the box around the same thing in that frame, in the same format, or found: false when it is not in the frame. Answer only JSON like {"frames":[{"index":1,"found":true,"box_2d":[120,340,300,470]}]}.`,
            },
            jpegPart(frames[0]),
            ...batch.map(jpegPart),
          ],
        })
        return {
          result: reply.value,
          usage: { inputTokens: reply.inputTokens, outputTokens: reply.outputTokens },
        }
      }
    )
    for (const frame of answer.frames) {
      if (!frame.found || !frame.box_2d) continue
      if (frame.index < 1 || frame.index > batch.length) continue
      const found = toShareBox(frame.box_2d)
      if (!found) continue
      points.push({
        atMs: moments[first + frame.index - 1],
        x: found.left + found.width / 2,
        y: found.top + found.height / 2,
      })
    }
  }

  return cleanBlurTrack(points, clip.durationMs)
}
