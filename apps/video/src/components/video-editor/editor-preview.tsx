import * as React from "react"
import { PlayIcon } from "lucide-react"

import {
  computeDuckEnvelope,
  dbToGain,
  DEFAULT_DUCK_DB,
  sampleEnvelope,
  type Interval,
} from "@/lib/video/audio-ducking"
import {
  clipMsAt,
  clipSpeed,
  clipVolume,
  sourceMsAt,
} from "@/lib/video/clip-playback"
import {
  fadeLevelAt,
  pictureFades,
  soundFadeGain,
  type FadePair,
} from "@/lib/video/clip-fades"
import {
  clipFillFocus,
  clipFit,
  fillFocusCss,
  storedFillFocus,
} from "@/lib/video/clip-frame-fit"
import {
  clipBoxRatio,
  containedShare,
  isPlacedPicture,
  pictureBoxCss,
  type FrameShare,
} from "@/lib/video/clip-size"
import {
  clipColour,
  colourMatrix,
  isColourTouched,
} from "@/lib/video/clip-colour"
import {
  clipMotion,
  motionPoseAt,
  motionTransformCss,
} from "@/lib/video/clip-motion"
import {
  dipOpacityAt,
  resolveIncomingTransition,
  transitionReachState,
  type ClipTransition,
} from "@/lib/video/clip-transitions"
import type { PlaybackSeekMode } from "@/lib/video/playback-clock"
import {
  progressBarShare,
  progressBarThicknessPx,
  progressBarTopPx,
} from "@/lib/video/progress-bar"
import {
  captionEntranceProgress,
  captionWordAnimation,
  captionWordTransformCss,
  isAnimatedCaption,
  resolveCaptionAnimation,
} from "@/lib/video/caption-animations"
import { captionWordHighlight, litWordAt } from "@/lib/video/caption-words"
import { SAFE_BOX_ASPECT, safeBoxShares } from "@/lib/video/safe-box"
import {
  shapeDesignFrame,
  shapePathsMarkup,
  shapeProgress,
} from "@/lib/video/shapes"
import { requireTextFont } from "@/lib/video/text-fonts"
import {
  TEXT_LINE_HEIGHT,
  TEXT_WRAP_WIDTH,
  textOutlineCss,
} from "@/lib/video/text-lines"
import {
  snapStageCenter,
  stageSnapThreshold,
} from "@/lib/video/timeline-snapping"
import { DESIGN_HEIGHT } from "@/lib/video/timeline-utils"
import { cn } from "@/lib/utils"
import { cleanSoundKey } from "@/lib/video/voice-clean"
import { useCleanSounds } from "@/components/video-editor/sound-tool-store"
import { useCaptionSettings } from "@/components/video-editor/caption-settings-context"
import {
  timelineDurationMs,
  useEditorRuntime,
  useEditorSelector,
  type EditorClip,
  type EditorTrack,
} from "@/components/video-editor/editor-store"

/**
 * The picture. Everything the playhead is over, drawn on one stage.
 *
 * The whole file exists to keep playback smooth, and that shapes every choice
 * in it. React draws the elements once per edit; from then on a single loop
 * subscribed to the clock moves them by touching the DOM directly, because a
 * re-render per frame would reload the very `<video>` elements that are
 * playing. Clips of the same file share one element, which keeps playback
 * smooth — but it means the moment the playhead crosses from one piece of that
 * file to another, the element has to be jumped to the new place exactly, or
 * it simply carries on playing the part that was cut out.
 */

// How far a video or audio element may drift from the clock before it is
// nudged back.
const PLAYING_DRIFT_S = 0.25
const PAUSED_DRIFT_S = 0.04
// How far ahead of its turn a file is mounted, so it has time to load.
const MEDIA_LOOK_AHEAD_MS = 2000

// Video and audio need their track as well, because a muted lane silences
// them. `transition` is the blend entering this clip: a crossfade or slide
// draws it early over the clip before it; a dip is a separate black layer.
// `fades` is the picture fading in and out, once the lane's transitions have
// overruled any fade at their seams (see clip-fades.ts).
type MediaEntry = {
  clip: EditorClip
  track: EditorTrack
  zIndex: number
  order: number
  transition?: ClipTransition | null
  fades: FadePair
  /**
   * A video whose sound plays from its cleaned copy instead (voice-clean.ts),
   * so its own element stays silent.
   */
  soundElsewhere?: boolean
}
// Pictures and text are still — they only need to know what covers what.
type VisualEntry = {
  clip: EditorClip
  zIndex: number
  transition?: ClipTransition | null
  fades: FadePair
}
type DipWindow = { seamMs: number; durationMs: number }
type PlaybackFrame = {
  startMs: number
  videos: Map<string, MediaEntry>
  audios: Map<string, MediaEntry>
  images: Map<string, VisualEntry>
  texts: Map<string, VisualEntry>
  shapes: Map<string, VisualEntry>
  preparedVideos: Map<string, MediaEntry>
  preparedAudios: Map<string, MediaEntry>
}
type PlaybackEntry =
  | { kind: "media"; entry: MediaEntry }
  | { kind: "image"; entry: VisualEntry }
  | { kind: "text"; entry: VisualEntry }
  | { kind: "shape"; entry: VisualEntry }
type FastSeekMediaElement = HTMLMediaElement & {
  fastSeek?: (time: number) => void
}
type MediaSeekRequest = { mode: PlaybackSeekMode; targetS: number }

function seekPreviewMedia(
  element: HTMLMediaElement,
  targetS: number,
  mode: PlaybackSeekMode,
  toleranceS: number,
  requests: WeakMap<HTMLMediaElement, MediaSeekRequest>
) {
  if (
    !Number.isFinite(targetS) ||
    Math.abs(element.currentTime - targetS) <= toleranceS
  ) {
    return
  }
  const previous = requests.get(element)
  if (previous?.mode === mode && Math.abs(previous.targetS - targetS) < 0.001) {
    return
  }
  // Nothing is loaded yet; the metadata event runs this again once seeking is
  // possible.
  if (element.readyState === 0) return

  if (mode === "fast") {
    const fastSeek = (element as FastSeekMediaElement).fastSeek
    if (typeof fastSeek === "function") {
      try {
        fastSeek.call(element, targetS)
        requests.set(element, { mode, targetS })
        return
      } catch {
        // Metadata may not be ready — setting the time exactly always works.
      }
    }
  }

  element.currentTime = targetS
  requests.set(element, { mode, targetS })
}

// The two ends of a shape, each with a handle of its own while it is picked.
const SHAPE_ENDS = ["from", "to"] as const

/** Where a shape's dashed box and its two end dots sit, in percent. */
function shapeHandleCss(clip: EditorClip) {
  const fromX = clip.x ?? 0.5
  const fromY = clip.y ?? 0.5
  const toX = clip.toX ?? 0.5
  const toY = clip.toY ?? 0.5
  return {
    box: {
      left: `calc(${Math.min(fromX, toX) * 100}% - 8px)`,
      top: `calc(${Math.min(fromY, toY) * 100}% - 8px)`,
      width: `calc(${Math.abs(toX - fromX) * 100}% + 16px)`,
      height: `calc(${Math.abs(toY - fromY) * 100}% + 16px)`,
    },
    from: { left: `${fromX * 100}%`, top: `${fromY * 100}%` },
    to: { left: `${toX * 100}%`, top: `${toY * 100}%` },
  }
}

/** Moves a dragged shape's box and dots without a render. */
function placeShapeHandles(stage: HTMLElement, clip: EditorClip) {
  const css = shapeHandleCss(clip)
  const parts = [
    ["box", css.box],
    ["from", css.from],
    ["to", css.to],
  ] as const
  for (const [part, style] of parts) {
    const element = stage.querySelector<HTMLElement>(
      `[data-shape-handle="${clip.id}:${part}"]`
    )
    if (element) Object.assign(element.style, style)
  }
}

/** How far before its end a file is parked to hold its last frame. */
const HOLD_LAST_FRAME_S = 0.05

/**
 * Whether a clip that runs on past the end of its file has used the file up
 * at this point. It then holds the last frame (B-roll shorter than its
 * sentence does this, see b-roll.md), the way the export's overlay does.
 */
function holdsLastFrame(element: HTMLMediaElement, targetS: number) {
  return (
    Number.isFinite(element.duration) &&
    element.duration > 0 &&
    targetS >= element.duration - HOLD_LAST_FRAME_S
  )
}

// Flatten the lanes into draw order (the top lane covers the ones below it),
// working out the blend entering each clip from the one before it on its lane.
// A clip whose voice is cleaned plays its sound from the cleaned copy once
// the worker has made it: a sound clip simply plays that file, and a video
// is drawn as before with a sound clip of the copy laid alongside it, timed
// and trimmed the same, so the picture and the cleaned sound stay together.
function flattenTracks(tracks: EditorTrack[], cleanUrls: Map<string, string>) {
  const media: MediaEntry[] = []
  const images: VisualEntry[] = []
  const texts: VisualEntry[] = []
  const shapes: VisualEntry[] = []
  const dips: DipWindow[] = []
  tracks.forEach((track, trackIndex) => {
    const zIndex = tracks.length - trackIndex
    track.clips.forEach((clip, index) => {
      const previous = index > 0 ? track.clips[index - 1] : null
      const transition = resolveIncomingTransition(clip, previous)
      const fades = pictureFades(clip, previous, track.clips[index + 1] ?? null)
      if (transition?.kind === "dip") {
        dips.push({ seamMs: clip.startMs, durationMs: transition.durationMs })
      }
      if (clip.kind === "text") {
        texts.push({ clip, zIndex, fades })
      } else if (clip.kind === "shape") {
        shapes.push({ clip, zIndex, fades })
      } else if (clip.kind === "image" && clip.url) {
        images.push({ clip, zIndex, transition, fades })
      } else if (clip.url) {
        const cleanUrl =
          clip.voiceClean && clip.mediaId
            ? cleanUrls.get(cleanSoundKey(clip.mediaId, clip.voiceClean))
            : undefined
        if (cleanUrl && clip.kind === "audio") {
          media.push({
            clip: { ...clip, url: cleanUrl },
            track,
            zIndex,
            order: media.length,
            fades,
          })
          return
        }
        media.push({
          clip,
          track,
          zIndex,
          order: media.length,
          transition,
          fades,
          soundElsewhere: !!cleanUrl,
        })
        if (cleanUrl) {
          media.push({
            clip: { ...clip, id: `${clip.id}:clean`, kind: "audio", url: cleanUrl },
            track,
            zIndex,
            order: media.length,
            fades,
          })
        }
      }
    })
  })
  return { media, images, texts, shapes, dips }
}

// Keep a map of live elements. The ref is read in the callback (after the
// element exists), never during render.
function registerRef<K, T extends Element>(
  refs: { current: Map<K, T> },
  key: K
) {
  return (element: T | null) => {
    if (element) refs.current.set(key, element)
    else refs.current.delete(key)
  }
}

function isActive(clip: EditorClip, timeMs: number) {
  return timeMs >= clip.startMs && timeMs < clip.startMs + clip.durationMs
}

// Brightness, contrast and saturation are drawn by an SVG colour matrix that
// does the export's `eq` sums (see clip-colour.ts), one per clip that has any.
// A clip left alone gets no filter, so it costs the browser nothing.
function colourFilterId(clip: EditorClip) {
  return `clip-colour-${clip.id}`
}

function colourFilterCss(clip: EditorClip) {
  if (clip.kind !== "video" && clip.kind !== "image") return ""
  return isColourTouched(clipColour(clip))
    ? `url(#${colourFilterId(clip)})`
    : ""
}

// Where a filled picture's crop sits; a fitted one is always centred.
function objectPositionCss(clip: EditorClip) {
  return clipFit(clip) === "cover" ? fillFocusCss(clipFillFocus(clip)) : "50% 50%"
}

/**
 * How much of its box a picture or video covers once fitted, so its box can
 * hug it. Only for one fitted inside and holding still: a filled one covers
 * its whole box, and a moving one is moved as a whole frame, the way the
 * export draws it.
 */
function fittedShare(
  ratios: Map<string, number>,
  clip: EditorClip,
  frameRatio: number
): FrameShare {
  const pictureRatio = clip.url ? ratios.get(clip.url) : undefined
  if (!pictureRatio || clipFit(clip) !== "contain" || clipMotion(clip)) {
    return { width: 1, height: 1 }
  }
  return containedShare(pictureRatio, clipBoxRatio(clip, frameRatio))
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function playbackFrameAt(frames: PlaybackFrame[], timeMs: number) {
  let low = 0
  let high = frames.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (frames[middle].startMs <= timeMs) low = middle + 1
    else high = middle
  }
  return frames[Math.max(0, low - 1)]
}

export function EditorPreview() {
  const tracks = useEditorSelector((state) => state.tracks)
  const aspect = useEditorSelector((state) => state.aspect)
  const selectedClipId = useEditorSelector((state) => state.selectedClipId)
  const progressBar = useEditorSelector((state) => state.progressBar)
  const { clock, dispatch } = useEditorRuntime()

  const containerRef = React.useRef<HTMLDivElement>(null)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const videoRefs = React.useRef(new Map<string, HTMLVideoElement>())
  const audioRefs = React.useRef(new Map<string, HTMLAudioElement>())
  const imageRefs = React.useRef(new Map<string, HTMLImageElement>())
  const textRefs = React.useRef(new Map<string, HTMLDivElement>())
  const shapeRefs = React.useRef(new Map<string, SVGSVGElement>())
  // The black layer a dip-to-black seam drives.
  const dipRef = React.useRef<HTMLDivElement>(null)
  // The progress bar's filled part, widened by the frame loop.
  const progressFillRef = React.useRef<HTMLDivElement>(null)
  const syncFrameRef = React.useRef<() => void>(() => undefined)
  // A text overlay, or a picture or video smaller than the frame, being
  // dragged. Its position moves directly on the element during the drag and
  // is written to the store once, on release. `box` is set for a picture or
  // video, whose element is placed by its corner rather than its middle.
  const overlayDragRef = React.useRef<{
    clipId: string
    element: HTMLElement
    box: EditorClip | null
    share: FrameShare
    offsetX: number
    offsetY: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  // A filled picture or video having its crop slid inside its box. The same
  // rule as above: the element moves during the drag, the store hears once.
  const focusDragRef = React.useRef<{
    clipId: string
    element: HTMLElement
    axis: "x" | "y"
    overflowPx: number
    startX: number
    startY: number
    startFocus: number
    focus: number
    moved: boolean
  } | null>(null)
  // A shape, or one of its two ends, being moved. The same rule again: the
  // frame loop draws it from `patch` during the drag, and the store hears
  // once on release, as one undo step.
  const shapeDragRef = React.useRef<{
    clip: EditorClip
    part: "whole" | "from" | "to"
    startX: number
    startY: number
    moved: boolean
    patch: Partial<EditorClip>
  } | null>(null)
  // The two centre lines a dragged overlay locks onto. Shown and hidden
  // directly for the same reason the drag is: state here would re-render the
  // preview, and reload its videos, on every pointer move.
  const centerGuideRefs = React.useRef<{
    x: HTMLDivElement | null
    y: HTMLDivElement | null
  }>({ x: null, y: null })
  const [containerBox, setContainerBox] = React.useState({ w: 0, h: 0 })
  // Each picture's own width over height, keyed by address, learned as it
  // loads. A small picture's box hugs it once this is known.
  const [pictureRatios, setPictureRatios] = React.useState(
    () => new Map<string, number>()
  )
  // The same numbers for the frame loop, which runs outside React's renders.
  const pictureRatiosRef = React.useRef(pictureRatios)

  // Watch the space the stage has. The stage is sized in code because CSS
  // cannot fit a box to a shape against both a maximum width and height.
  React.useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(() =>
      setContainerBox({ w: element.clientWidth, h: element.clientHeight })
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // The biggest stage of the project's shape that fits the space.
  const ratio = React.useMemo(() => {
    const [width, height] = aspect.split(":").map(Number)
    return width / height
  }, [aspect])
  let stageWidth = containerBox.w
  let stageHeight = stageWidth / ratio
  if (stageHeight > containerBox.h) {
    stageHeight = containerBox.h
    stageWidth = stageHeight * ratio
  }

  const allClips = React.useMemo(
    () => tracks.flatMap((track) => track.clips),
    [tracks]
  )
  const cleanSounds = useCleanSounds(allClips)
  const cleanUrls = React.useMemo(() => {
    const urls = new Map<string, string>()
    for (const [key, state] of cleanSounds) {
      if (state.status === "ready") urls.set(key, state.url)
    }
    return urls
  }, [cleanSounds])
  const { media, images, texts, shapes, dips } = React.useMemo(
    () => flattenTracks(tracks, cleanUrls),
    [tracks, cleanUrls]
  )
  const projectDurationMs = React.useMemo(() => timelineDurationMs(tracks), [tracks])
  const shapeFrame = React.useMemo(() => shapeDesignFrame(ratio), [ratio])

  /**
   * What is on screen only changes where a clip starts or ends. Build one
   * snapshot per such moment on edit, and playback then finds the current set
   * with a binary search instead of walking the whole project every frame.
   */
  const playbackFrames = React.useMemo(() => {
    const events = new Map<
      number,
      {
        enter: PlaybackEntry[]
        leave: PlaybackEntry[]
        prepare: MediaEntry[]
        release: MediaEntry[]
      }
    >()
    const empty = () => ({ enter: [], leave: [], prepare: [], release: [] })
    const add = (item: PlaybackEntry) => {
      const { clip } = item.entry
      // A crossfade or slide is drawn early over the outgoing clip, so it
      // becomes active that much before its real start. A dip does not reach
      // back — it is its own black layer. Leaving is always at the end.
      const transition = item.entry.transition
      const reachMs =
        transition && transition.kind !== "dip" ? transition.durationMs : 0
      const enterMs = clip.startMs - reachMs
      const start = events.get(enterMs) ?? empty()
      start.enter.push(item)
      events.set(enterMs, start)
      const endMs = clip.startMs + clip.durationMs
      const end = events.get(endMs) ?? empty()
      end.leave.push(item)
      if (item.kind === "media") {
        const prepareMs = Math.max(0, enterMs - MEDIA_LOOK_AHEAD_MS)
        const prepare = events.get(prepareMs) ?? empty()
        prepare.prepare.push(item.entry)
        events.set(prepareMs, prepare)
        end.release.push(item.entry)
      }
      events.set(endMs, end)
    }
    for (const entry of media) add({ kind: "media", entry })
    for (const entry of images) add({ kind: "image", entry })
    for (const entry of texts) add({ kind: "text", entry })
    for (const entry of shapes) add({ kind: "shape", entry })
    if (!events.has(0)) {
      events.set(0, { enter: [], leave: [], prepare: [], release: [] })
    }

    const activeMedia = new Map<string, MediaEntry>()
    const preparedMedia = new Map<string, MediaEntry>()
    const activeImages = new Map<string, VisualEntry>()
    const activeTexts = new Map<string, VisualEntry>()
    const activeShapes = new Map<string, VisualEntry>()
    const frames: PlaybackFrame[] = []
    for (const startMs of [...events.keys()].sort((a, b) => a - b)) {
      const event = events.get(startMs)!
      for (const entry of event.release) preparedMedia.delete(entry.clip.id)
      for (const item of event.leave) {
        if (item.kind === "media") activeMedia.delete(item.entry.clip.id)
        else if (item.kind === "image") activeImages.delete(item.entry.clip.id)
        else if (item.kind === "shape") activeShapes.delete(item.entry.clip.id)
        else activeTexts.delete(item.entry.clip.id)
      }
      for (const entry of event.prepare) preparedMedia.set(entry.clip.id, entry)
      for (const item of event.enter) {
        if (item.kind === "media") {
          activeMedia.set(item.entry.clip.id, item.entry)
        } else if (item.kind === "image") {
          activeImages.set(item.entry.clip.id, item.entry)
        } else if (item.kind === "shape") {
          activeShapes.set(item.entry.clip.id, item.entry)
        } else {
          activeTexts.set(item.entry.clip.id, item.entry)
        }
      }

      const videos = new Map<string, MediaEntry>()
      const audios = new Map<string, MediaEntry>()
      for (const entry of [...activeMedia.values()].sort(
        (a, b) => a.order - b.order
      )) {
        const { clip } = entry
        if (clip.kind === "audio") {
          audios.set(clip.id, entry)
        } else if (clip.kind === "video" && clip.url) {
          const current = videos.get(clip.url)
          if (!current || entry.zIndex > current.zIndex) {
            videos.set(clip.url, entry)
          }
        }
      }
      const preparedVideos = new Map(videos)
      const preparedAudios = new Map(audios)
      for (const entry of preparedMedia.values()) {
        const { clip } = entry
        if (clip.kind === "audio") {
          preparedAudios.set(clip.id, entry)
        } else if (clip.kind === "video" && clip.url) {
          const current = preparedVideos.get(clip.url)
          if (!current || clip.startMs < current.clip.startMs) {
            preparedVideos.set(clip.url, entry)
          }
        }
      }
      frames.push({
        startMs,
        videos,
        audios,
        images: new Map(activeImages),
        texts: new Map(activeTexts),
        shapes: new Map(activeShapes),
        preparedVideos,
        preparedAudios,
      })
    }
    return frames
  }, [media, images, texts, shapes])

  /**
   * "Duck under voice", while editing rather than only in the finished film:
   * the volume curve for any lane marked as background, worked out from when
   * every other lane is making a sound. A video counts as a voice whether or
   * not it actually carries any — the browser cannot cheaply tell, and being
   * slightly too quiet is better than talking over somebody.
   */
  const duckEnvelope = React.useMemo(() => {
    const duckGain = dbToGain(DEFAULT_DUCK_DB)
    const voiceIntervals: Interval[] = []
    let hasDuckedLane = false
    for (const track of tracks) {
      if (track.muted) continue
      const audible = track.clips.filter(
        (clip) =>
          (clip.kind === "audio" || clip.kind === "video") &&
          !clip.muted &&
          clipVolume(clip) > 0
      )
      if (track.duck) {
        if (audible.length) hasDuckedLane = true
        continue
      }
      for (const clip of audible) {
        voiceIntervals.push({
          startMs: clip.startMs,
          endMs: clip.startMs + clip.durationMs,
        })
      }
    }
    if (!hasDuckedLane || !voiceIntervals.length) return []
    return computeDuckEnvelope({
      voiceIntervals,
      durationMs: timelineDurationMs(tracks),
      duckGain,
    })
  }, [tracks])

  const preparedFrame = React.useSyncExternalStore(
    clock.subscribe,
    () => playbackFrameAt(playbackFrames, clock.getTime()),
    () => playbackFrames[0]
  )
  React.useLayoutEffect(() => syncFrameRef.current(), [preparedFrame])
  // A bar switched on while paused is filled to the playhead at once.
  React.useLayoutEffect(() => syncFrameRef.current(), [progressBar])
  // The picked clip, for the frame loop: a shape being placed shows whole.
  const selectedRef = React.useRef(selectedClipId)
  React.useLayoutEffect(() => {
    selectedRef.current = selectedClipId
    syncFrameRef.current()
  }, [selectedClipId])

  /**
   * Let the sound lead. The clock follows whichever element is actually
   * carrying audio — an unmuted audio clip first, otherwise the topmost video
   * — so a file that stalls holds the playhead instead of the playhead running
   * away and having to seek back, which is what makes a picture stutter.
   */
  React.useEffect(() => {
    clock.setTimeSource(() => {
      const timeMs = clock.getTime()
      const frame = playbackFrameAt(playbackFrames, timeMs)
      let hasAudioSource = false
      let endedAudioTime: number | null = null
      for (const { clip, track } of frame.audios.values()) {
        if (track.muted || clip.muted) continue
        hasAudioSource = true
        const element = audioRefs.current.get(clip.id)
        if (!element) continue
        if (element.ended) {
          endedAudioTime = Math.max(
            endedAudioTime ?? 0,
            clip.startMs + clip.durationMs
          )
          continue
        }
        if (element.seeking || element.readyState < 2 || element.paused) continue
        const timelineTime =
          clip.startMs + clipMsAt(clip, element.currentTime * 1000)
        if (timelineTime > timeMs) return timelineTime
      }
      if (endedAudioTime != null) return Math.max(timeMs, endedAudioTime)
      if (hasAudioSource) return timeMs

      let source: [string, MediaEntry] | null = null
      for (const entry of frame.videos) {
        if (!source || entry[1].zIndex > source[1].zIndex) {
          source = entry
        }
      }
      if (!source) return null // A gap runs on ordinary wall time.

      const [url, entry] = source
      const element = videoRefs.current.get(url)
      if (!element) return timeMs
      // A file that has run out, whether or not its clip has, leaves the
      // playhead on ordinary wall time, so a held last frame keeps time.
      if (
        element.ended ||
        holdsLastFrame(element, sourceMsAt(entry.clip, timeMs - entry.clip.startMs) / 1000)
      ) {
        return null
      }
      if (element.seeking || element.readyState < 2 || element.paused) {
        return timeMs
      }
      return Math.max(
        timeMs,
        entry.clip.startMs + clipMsAt(entry.clip, element.currentTime * 1000)
      )
    })
    return () => clock.setTimeSource(null)
  }, [clock, playbackFrames])

  // The frame loop reads the shapes from the ref, so it sees new ones without
  // being rebuilt; a render reads the state (fittedShare, below).
  const shareOf = React.useCallback(
    (clip: EditorClip) => fittedShare(pictureRatiosRef.current, clip, ratio),
    [ratio]
  )

  // The one per-frame loop, driven by the clock: it ticks while playing and
  // fires once per seek. Everything in here touches the DOM directly.
  React.useEffect(() => {
    let previousFrame: PlaybackFrame | null = null
    const mediaSeekRequests = new WeakMap<HTMLMediaElement, MediaSeekRequest>()
    // Which piece of its file each element is playing. When that changes, the
    // element has to land on the new piece exactly rather than drift into it.
    const playingClipIds = new WeakMap<HTMLMediaElement, string>()
    // Start from a known state whenever the project changes shape; the loop
    // below then only touches what is active or crossing a boundary.
    for (const element of videoRefs.current.values()) {
      if (element.style.opacity !== "0") element.style.opacity = "0"
      if (element.style.transform) element.style.transform = ""
      if (element.style.filter) element.style.filter = ""
      if (!element.paused) element.pause()
    }
    for (const element of audioRefs.current.values()) {
      if (!element.paused) element.pause()
    }
    for (const element of imageRefs.current.values()) {
      element.style.visibility = "hidden"
      if (element.style.opacity && element.style.opacity !== "1") {
        element.style.opacity = "1"
      }
      if (element.style.transform) element.style.transform = ""
    }
    for (const element of textRefs.current.values()) {
      element.style.visibility = "hidden"
    }
    for (const element of shapeRefs.current.values()) {
      element.style.visibility = "hidden"
    }
    // How far drawn each shape's paths were last written, so a shape that is
    // whole is not redrawn on every frame.
    const drawnShapes = new WeakMap<SVGSVGElement, string>()

    function syncFrame() {
      const timeMs = clock.getTime()
      const playing = clock.playing
      const frame = playbackFrameAt(playbackFrames, timeMs)

      if (frame !== previousFrame) {
        for (const [url] of previousFrame?.videos ?? []) {
          if (frame.videos.has(url)) continue
          const element = videoRefs.current.get(url)
          if (!element) continue
          if (element.style.opacity !== "0") element.style.opacity = "0"
          if (!element.paused) element.pause()
        }
        for (const [clipId] of previousFrame?.audios ?? []) {
          if (frame.audios.has(clipId)) continue
          const element = audioRefs.current.get(clipId)
          if (element && !element.paused) element.pause()
        }
        for (const [clipId] of previousFrame?.images ?? []) {
          if (frame.images.has(clipId)) continue
          const element = imageRefs.current.get(clipId)
          if (element && element.style.visibility !== "hidden") {
            element.style.visibility = "hidden"
          }
        }
        for (const [clipId] of frame.images) {
          if (previousFrame?.images.has(clipId)) continue
          const element = imageRefs.current.get(clipId)
          if (element && element.style.visibility !== "visible") {
            element.style.visibility = "visible"
          }
        }
        for (const [clipId] of previousFrame?.texts ?? []) {
          if (frame.texts.has(clipId)) continue
          const element = textRefs.current.get(clipId)
          if (element && element.style.visibility !== "hidden") {
            element.style.visibility = "hidden"
          }
        }
        for (const [clipId] of frame.texts) {
          if (previousFrame?.texts.has(clipId)) continue
          const element = textRefs.current.get(clipId)
          if (element && element.style.visibility !== "visible") {
            element.style.visibility = "visible"
          }
        }
        for (const [clipId] of previousFrame?.shapes ?? []) {
          if (frame.shapes.has(clipId)) continue
          const element = shapeRefs.current.get(clipId)
          if (element && element.style.visibility !== "hidden") {
            element.style.visibility = "hidden"
          }
        }
        for (const [clipId] of frame.shapes) {
          if (previousFrame?.shapes.has(clipId)) continue
          const element = shapeRefs.current.get(clipId)
          if (element && element.style.visibility !== "visible") {
            element.style.visibility = "visible"
          }
        }
        previousFrame = frame
      }

      // Shapes drawing themselves on, from the same sums the export draws
      // its pictures with, and fading the way a picture does. A shape that
      // is picked while the video is paused shows whole, because one that
      // lands at the playhead would otherwise be nothing yet, with nothing
      // to see while it is placed.
      for (const [clipId, entry] of frame.shapes) {
        const element = shapeRefs.current.get(clipId)
        if (!element) continue
        const drag = shapeDragRef.current
        const clip =
          drag?.clip.id === clipId ? { ...entry.clip, ...drag.patch } : entry.clip
        const intoMs = timeMs - clip.startMs
        const placing = !playing && clipId === selectedRef.current
        const progress = placing ? 1 : shapeProgress(clip, intoMs)
        const markup = shapePathsMarkup(clip, shapeFrame, progress)
        if (drawnShapes.get(element) !== markup) {
          drawnShapes.set(element, markup)
          element.innerHTML = markup
        }
        const level = fadeLevelAt(entry.fades, entry.clip.durationMs, intoMs)
        const opacity = level === 1 ? "" : String(level)
        if (element.style.opacity !== opacity) element.style.opacity = opacity
      }

      // The entrance. Every visible line is moved from the same numbers the
      // export bakes into its pictures, so what is watched here and what comes
      // out of an export are the same thing.
      for (const [clipId, entry] of frame.texts) {
        const element = textRefs.current.get(clipId)
        if (!element) continue
        const animation = resolveCaptionAnimation(entry.clip.animation)
        const at = isAnimatedCaption(animation)
          ? captionWordAnimation(
              animation,
              captionEntranceProgress(timeMs - entry.clip.startMs, 0)
            )
          : null
        const transform = at
          ? `translate(-50%, -50%) ${captionWordTransformCss(at)}`
          : "translate(-50%, -50%)"
        if (element.style.transform !== transform) {
          element.style.transform = transform
        }
        // A picture fade multiplies into the entrance, the way the export's
        // fade takes down a layer that already carries the entrance.
        const level =
          (at ? at.opacity : 1) *
          fadeLevelAt(
            entry.fades,
            entry.clip.durationMs,
            timeMs - entry.clip.startMs
          )
        const opacity = level === 1 ? "" : String(level)
        if (element.style.opacity !== opacity) element.style.opacity = opacity

        // The word being said. Each word's span remembers the colour it was
        // given, so a span React has just drawn afresh is caught as well.
        const highlight = captionWordHighlight(entry.clip)
        if (!highlight) continue
        const lit = litWordAt(entry.clip, highlight.times, timeMs)
        for (const span of element.querySelectorAll<HTMLElement>(
          "[data-word]"
        )) {
          const colour =
            Number(span.dataset.word) === lit ? highlight.color : ""
          if ((span.dataset.lit ?? "") === colour) continue
          span.dataset.lit = colour
          span.style.color = colour
        }
      }

      const seekMode = clock.seekMode ?? "precise"
      const seekToleranceS =
        clock.seekMode === "precise"
          ? 0.001
          : playing
            ? PLAYING_DRIFT_S
            : PAUSED_DRIFT_S

      for (const [url, entry] of frame.videos) {
        const element = videoRefs.current.get(url)
        if (!element) continue
        const { clip } = entry
        // Reaching back: this clip is drawn early over the one before it, held
        // on its first frame while it fades or slides in. It sits one layer
        // above its neighbour for the length of the blend.
        const reaching =
          !!entry.transition &&
          entry.transition.kind !== "dip" &&
          timeMs < clip.startMs
        if (reaching) {
          const state = transitionReachState(
            entry.transition!.kind,
            clip.startMs,
            entry.transition!.durationMs,
            timeMs
          )
          const opacity = String(state.opacity)
          if (element.style.opacity !== opacity) element.style.opacity = opacity
          const zIndex = String(entry.zIndex + 1)
          if (element.style.zIndex !== zIndex) element.style.zIndex = zIndex
          // A placed video has further to come than its own width, the same
          // as a small picture below.
          const transform = !state.translateXPct
            ? ""
            : isPlacedPicture(clip)
              ? `translateX(${((stageRef.current?.clientWidth ?? 0) - element.offsetLeft) * (state.translateXPct / 100)}px)`
              : `translateX(${state.translateXPct}%)`
          if (element.style.transform !== transform) {
            element.style.transform = transform
          }
        } else {
          const opacity = String(
            fadeLevelAt(entry.fades, clip.durationMs, timeMs - clip.startMs)
          )
          if (element.style.opacity !== opacity) element.style.opacity = opacity
          const zIndex = String(entry.zIndex)
          if (element.style.zIndex !== zIndex) element.style.zIndex = zIndex
          if (element.style.transform) element.style.transform = ""
        }
        // Fit or fill, the crop's spot and the clip's box. Written here
        // rather than on the element because clips of the same file share one
        // element, and two clips of that file may be set differently.
        const objectFit = clipFit(clip)
        if (element.style.objectFit !== objectFit) {
          element.style.objectFit = objectFit
        }
        // A video being dragged, or having its crop slid, is moved by the
        // drag itself until release; writing the stored place here would
        // snap it back every frame while it plays.
        const dragging =
          overlayDragRef.current?.element === element ||
          focusDragRef.current?.element === element
        if (!dragging) {
          const objectPosition = objectPositionCss(clip)
          if (element.style.objectPosition !== objectPosition) {
            element.style.objectPosition = objectPosition
          }
          const box = pictureBoxCss(clip, shareOf(clip))
          if (element.style.left !== box.left) element.style.left = box.left
          if (element.style.top !== box.top) element.style.top = box.top
          if (element.style.width !== box.width) element.style.width = box.width
          if (element.style.height !== box.height) element.style.height = box.height
        }
        // Colour, for the same reason: it belongs to the clip, not the file.
        const filter = colourFilterCss(clip)
        if (element.style.filter !== filter) element.style.filter = filter
        const muted = entry.track.muted || !!clip.muted || !!entry.soundElsewhere
        if (element.muted !== muted) element.muted = muted
        const volume =
          clipVolume(clip) *
          soundFadeGain(clip, timeMs - clip.startMs) *
          (entry.track.duck ? sampleEnvelope(duckEnvelope, timeMs) : 1)
        if (element.volume !== volume) element.volume = volume
        const rate = clipSpeed(clip)
        if (element.playbackRate !== rate) element.playbackRate = rate
        // Hold the first frame through the blend, so the picture is continuous
        // once real playback starts at the seam.
        const wantedS = reaching
          ? clip.trimStartMs / 1000
          : sourceMsAt(clip, timeMs - clip.startMs) / 1000
        // Past the end of its file the clip is parked on its last frame and
        // left paused: playing an ended file would start it from the top.
        const holding = holdsLastFrame(element, wantedS)
        const targetS = holding ? element.duration - HOLD_LAST_FRAME_S : wantedS
        if ((!playing || reaching || holding) && !element.paused) element.pause()
        // A different piece of the same file: jump to it exactly. Letting the
        // usual drift allowance decide would play a short cut straight through
        // — the very thing that was just taken out.
        const crossedIntoNewPiece = playingClipIds.get(element) !== clip.id
        playingClipIds.set(element, clip.id)
        seekPreviewMedia(
          element,
          targetS,
          // A fast seek lands on the nearest keyframe, which can be a
          // fraction of a second before the frame meant to be held.
          crossedIntoNewPiece || holding ? "precise" : seekMode,
          crossedIntoNewPiece ? 0.001 : seekToleranceS,
          mediaSeekRequests
        )
        if (playing && !reaching && !holding && element.paused) {
          void element.play().catch(() => undefined)
        }
      }

      for (const { clip, track } of frame.audios.values()) {
        const element = audioRefs.current.get(clip.id)
        if (!element) continue
        const muted = track.muted || !!clip.muted
        if (element.muted !== muted) element.muted = muted
        const volume =
          clipVolume(clip) *
          soundFadeGain(clip, timeMs - clip.startMs) *
          (track.duck ? sampleEnvelope(duckEnvelope, timeMs) : 1)
        if (element.volume !== volume) element.volume = volume
        const rate = clipSpeed(clip)
        if (element.playbackRate !== rate) element.playbackRate = rate
        const targetS = sourceMsAt(clip, timeMs - clip.startMs) / 1000
        if (!playing && !element.paused) element.pause()
        seekPreviewMedia(
          element,
          targetS,
          seekMode,
          seekToleranceS,
          mediaSeekRequests
        )
        if (playing && element.paused) {
          void element.play().catch(() => undefined)
        }
      }

      // A picture reaching back fades or slides in exactly like a video; it
      // simply holds its one frame throughout. A picture set to move is
      // placed from the same numbers the export draws with, and holds its
      // first pose while it is still reaching back.
      for (const entry of frame.images.values()) {
        const { clip } = entry
        const transition =
          entry.transition && entry.transition.kind !== "dip"
            ? entry.transition
            : null
        const motion = clipMotion(clip)
        const fading = entry.fades.inMs > 0 || entry.fades.outMs > 0
        if (!transition && !motion && !fading) continue
        const element = imageRefs.current.get(clip.id)
        if (!element) continue
        const moveCss = motion
          ? motionTransformCss(
              motionPoseAt(motion, timeMs - clip.startMs, clip.durationMs)
            )
          : ""
        let transform = moveCss
        if (transition && timeMs < clip.startMs) {
          const state = transitionReachState(
            transition.kind,
            clip.startMs,
            transition.durationMs,
            timeMs
          )
          element.style.opacity = String(state.opacity)
          element.style.zIndex = String(entry.zIndex + 1)
          if (state.translateXPct) {
            // The export starts a slide with the picture's left edge on the
            // frame's right edge. A full-frame picture is that far from it by
            // its own width; a small one has further to come.
            const slide = isPlacedPicture(clip)
              ? `${((stageRef.current?.clientWidth ?? 0) - element.offsetLeft) * (state.translateXPct / 100)}px`
              : `${state.translateXPct}%`
            transform = `translateX(${slide}) ${moveCss}`.trim()
          }
        } else {
          const opacity = String(
            fadeLevelAt(entry.fades, clip.durationMs, timeMs - clip.startMs)
          )
          if (element.style.opacity !== opacity) element.style.opacity = opacity
          const zIndex = String(entry.zIndex)
          if (element.style.zIndex !== zIndex) element.style.zIndex = zIndex
        }
        if (element.style.transform !== transform) {
          element.style.transform = transform
        }
      }

      // The progress bar, measured against the whole video the way the
      // export measures it.
      const progressFill = progressFillRef.current
      if (progressFill) {
        const width = `${progressBarShare(timeMs, projectDurationMs) * 100}%`
        if (progressFill.style.width !== width) progressFill.style.width = width
      }

      // Dip to black: one full-frame black layer, at whichever seam is nearest.
      const dipElement = dipRef.current
      if (dipElement) {
        let dipOpacity = 0
        for (const dip of dips) {
          const value = dipOpacityAt(dip.seamMs, dip.durationMs, timeMs)
          if (value > dipOpacity) dipOpacity = value
        }
        const opacity = String(dipOpacity)
        if (dipElement.style.opacity !== opacity) {
          dipElement.style.opacity = opacity
        }
      }
    }

    syncFrameRef.current = syncFrame
    syncFrame()
    const unsubscribe = clock.subscribe(syncFrame)
    return () => {
      if (syncFrameRef.current === syncFrame) {
        syncFrameRef.current = () => undefined
      }
      unsubscribe()
    }
  }, [clock, playbackFrames, dips, duckEnvelope, shareOf, projectDurationMs, shapeFrame])

  // Each file's own shape, learned as it loads: a picture's natural size, a
  // video's frame size. Kept twice, for the render and for the frame loop.
  function learnPictureRatio(url: string | undefined, width: number, height: number) {
    if (!url || !width || !height) return
    const pictureRatio = width / height
    if (pictureRatiosRef.current.get(url) === pictureRatio) return
    const next = new Map(pictureRatiosRef.current)
    next.set(url, pictureRatio)
    pictureRatiosRef.current = next
    setPictureRatios(next)
    syncFrameRef.current()
  }

  // The one clip of a file the preview is showing right now, for a press on
  // the file's shared `<video>`.
  function videoClipAt(url: string) {
    return playbackFrameAt(playbackFrames, clock.getTime()).videos.get(url)?.clip
  }

  // --- Dragging text, or a small picture, around the frame ------------------
  // Grab it anywhere; the gap between the pointer and its middle is kept so it
  // follows the cursor rather than jumping under it.
  function handleOverlayDown(event: React.PointerEvent, clip: EditorClip) {
    if (event.button !== 0) return
    // Select it too, so the inspector opens on it — a plain click just selects,
    // and a drag past a few pixels moves it.
    dispatch({ type: "SELECT_CLIP", clipId: clip.id })
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const centerX = (clip.x ?? 0.5) * rect.width
    const centerY = (clip.y ?? 0.5) * rect.height
    overlayDragRef.current = {
      clipId: clip.id,
      element: event.currentTarget as HTMLElement,
      box: clip.kind === "text" ? null : clip,
      share: shareOf(clip),
      offsetX: centerX - (event.clientX - rect.left),
      offsetY: centerY - (event.clientY - rect.top),
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  // Where its middle would land, centre snapping included. Holding Alt sets the
  // threshold to zero, which is how the bypass works: nothing is ever within
  // zero of a centre line.
  function resolveOverlayDrag(
    drag: { offsetX: number; offsetY: number },
    event: React.PointerEvent,
    rect: DOMRect
  ) {
    const x = clamp01((event.clientX - rect.left + drag.offsetX) / rect.width)
    const y = clamp01((event.clientY - rect.top + drag.offsetY) / rect.height)
    return snapStageCenter({
      x,
      y,
      thresholdX: event.altKey ? 0 : stageSnapThreshold(rect.width),
      thresholdY: event.altKey ? 0 : stageSnapThreshold(rect.height),
    })
  }

  function paintCenterGuides(showX: boolean, showY: boolean) {
    const { x, y } = centerGuideRefs.current
    if (x) x.style.display = showX ? "block" : "none"
    if (y) y.style.display = showY ? "block" : "none"
  }

  function handleOverlayMove(event: React.PointerEvent) {
    const drag = overlayDragRef.current
    const stage = stageRef.current
    if (!drag || !stage) return
    // A few pixels of slack, so a click never counts as a move.
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4
    ) {
      return
    }
    drag.moved = true
    const snapped = resolveOverlayDrag(drag, event, stage.getBoundingClientRect())
    if (!drag.box) {
      drag.element.style.left = `${snapped.x * 100}%`
      drag.element.style.top = `${snapped.y * 100}%`
    } else {
      const box = pictureBoxCss(
        { ...drag.box, x: snapped.x, y: snapped.y },
        drag.share
      )
      drag.element.style.left = box.left
      drag.element.style.top = box.top
    }
    paintCenterGuides(snapped.snappedX, snapped.snappedY)
  }

  function handleOverlayUp(event: React.PointerEvent) {
    const drag = overlayDragRef.current
    overlayDragRef.current = null
    const stage = stageRef.current
    if (!drag) return
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    paintCenterGuides(false, false)
    if (!drag.moved || !stage) return
    // Write the final position once, as a single undo step.
    const snapped = resolveOverlayDrag(drag, event, stage.getBoundingClientRect())
    dispatch({
      type: "UPDATE_CLIP",
      clipId: drag.clipId,
      patch: { x: snapped.x, y: snapped.y },
    })
  }

  // --- Sliding a filled clip's crop ------------------------------------------
  // Only on the clip already picked, so a stray press on the picture never
  // moves anything. Returns false when the clip does not overflow its box.
  function handleFocusDown(event: React.PointerEvent, clip: EditorClip) {
    if (event.button !== 0 || clipFit(clip) !== "cover" || !clip.url) return false
    const pictureRatio = pictureRatiosRef.current.get(clip.url)
    const element = event.currentTarget as HTMLElement
    const rect = element.getBoundingClientRect()
    if (!pictureRatio || !rect.width || !rect.height) return false
    const boxRatio = rect.width / rect.height
    if (Math.abs(pictureRatio - boxRatio) < 0.01) return false
    const axis = pictureRatio > boxRatio ? "x" : "y"
    const overflowPx =
      axis === "x"
        ? rect.height * pictureRatio - rect.width
        : rect.width / pictureRatio - rect.height
    const focus = clipFillFocus(clip)
    focusDragRef.current = {
      clipId: clip.id,
      element,
      axis,
      overflowPx,
      startX: event.clientX,
      startY: event.clientY,
      startFocus: focus,
      focus,
      moved: false,
    }
    element.setPointerCapture(event.pointerId)
    return true
  }

  function handleFocusMove(event: React.PointerEvent) {
    const drag = focusDragRef.current
    if (!drag) return false
    const delta =
      drag.axis === "x" ? event.clientX - drag.startX : event.clientY - drag.startY
    if (!drag.moved && Math.abs(delta) < 4) return true
    drag.moved = true
    // Dragging the picture right shows more of its left side.
    drag.focus = clamp01(drag.startFocus - delta / drag.overflowPx)
    drag.element.style.objectPosition = fillFocusCss(drag.focus)
    return true
  }

  function handleFocusUp(event: React.PointerEvent) {
    const drag = focusDragRef.current
    if (!drag) return false
    focusDragRef.current = null
    drag.element.releasePointerCapture(event.pointerId)
    if (drag.moved) {
      dispatch({
        type: "UPDATE_CLIP",
        clipId: drag.clipId,
        patch: { fillFocus: storedFillFocus(drag.focus) },
      })
    }
    return true
  }

  // Every picture and video gets the same three handlers: a placed one drags,
  // a filled one that is picked slides its crop, and anything else just
  // selects nothing new.
  function handleBoxDown(event: React.PointerEvent, clip: EditorClip | undefined) {
    if (!clip) return
    if (isPlacedPicture(clip)) {
      handleOverlayDown(event, clip)
    } else if (clip.id === selectedClipId) {
      handleFocusDown(event, clip)
    }
  }
  function handleBoxMove(event: React.PointerEvent) {
    if (!handleFocusMove(event)) handleOverlayMove(event)
  }
  function handleBoxUp(event: React.PointerEvent) {
    if (!handleFocusUp(event)) handleOverlayUp(event)
  }

  // --- Moving a shape, or one of its two ends --------------------------------
  function handleShapeDown(
    event: React.PointerEvent,
    clip: EditorClip,
    part: "whole" | "from" | "to"
  ) {
    if (event.button !== 0) return
    event.stopPropagation()
    // A drag must not start the browser selecting the page's text.
    event.preventDefault()
    dispatch({ type: "SELECT_CLIP", clipId: clip.id })
    shapeDragRef.current = {
      clip,
      part,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      patch: {},
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function handleShapeMove(event: React.PointerEvent) {
    const drag = shapeDragRef.current
    const stage = stageRef.current
    if (!drag || !stage) return
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4
    ) {
      return
    }
    drag.moved = true
    const rect = stage.getBoundingClientRect()
    const dx = (event.clientX - drag.startX) / rect.width
    const dy = (event.clientY - drag.startY) / rect.height
    const { clip } = drag
    const fromX = clip.x ?? 0.5
    const fromY = clip.y ?? 0.5
    const toX = clip.toX ?? 0.5
    const toY = clip.toY ?? 0.5
    let patch: Partial<EditorClip>
    if (drag.part === "from") {
      patch = { x: clamp01(fromX + dx), y: clamp01(fromY + dy) }
    } else if (drag.part === "to") {
      patch = { toX: clamp01(toX + dx), toY: clamp01(toY + dy) }
    } else {
      // The whole shape moves as one, and stops at the frame's edge rather
      // than squashing against it.
      const moveX = Math.min(Math.max(dx, -Math.min(fromX, toX)), 1 - Math.max(fromX, toX))
      const moveY = Math.min(Math.max(dy, -Math.min(fromY, toY)), 1 - Math.max(fromY, toY))
      patch = {
        x: fromX + moveX,
        y: fromY + moveY,
        toX: toX + moveX,
        toY: toY + moveY,
      }
    }
    drag.patch = patch
    placeShapeHandles(stage, { ...clip, ...patch })
    syncFrameRef.current()
  }

  function handleShapeUp(event: React.PointerEvent) {
    const drag = shapeDragRef.current
    if (!drag) return
    shapeDragRef.current = null
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    if (drag.moved) {
      dispatch({ type: "UPDATE_CLIP", clipId: drag.clip.id, patch: drag.patch })
    }
  }

  const hasClips =
    media.length > 0 || images.length > 0 || texts.length > 0 || shapes.length > 0
  const colouredClips = [...media, ...images]
    .map((entry) => entry.clip)
    .filter((clip) => colourFilterCss(clip) !== "")
  const textScale = stageHeight > 0 ? stageHeight / DESIGN_HEIGHT : 0
  const timeMs = clock.getTime()
  // The platform new captions keep clear of, drawn faintly so a caption
  // moved by hand can be kept inside it too. Never part of the export.
  const { look: captionLook, safeBoxes: captionSettingsBoxes } =
    useCaptionSettings()
  const safeBox =
    captionLook.platform && aspect === SAFE_BOX_ASPECT
      ? safeBoxShares(captionSettingsBoxes[captionLook.platform])
      : null

  return (
    <div ref={containerRef} className="grid h-full w-full place-items-center">
      <div
        ref={stageRef}
        className="relative overflow-hidden rounded-md bg-black"
        style={{ width: stageWidth, height: stageHeight }}
      >
        {/* One element per file that is playing or about to; the loop above
            drives it to whichever clip of that file is current. */}
        {[...preparedFrame.preparedVideos].map(([url]) => (
          <video
            key={url}
            ref={registerRef(videoRefs, url)}
            src={url}
            preload="auto"
            onLoadedMetadata={(event) => {
              const element = event.currentTarget
              learnPictureRatio(url, element.videoWidth, element.videoHeight)
              syncFrameRef.current()
            }}
            onClick={() => {
              if (clock.playing) clock.pause()
            }}
            onPointerDown={(event) => handleBoxDown(event, videoClipAt(url))}
            onPointerMove={handleBoxMove}
            onPointerUp={handleBoxUp}
            onPointerCancel={handleBoxUp}
            playsInline
            className="absolute inset-0 h-full w-full touch-none"
            style={{ opacity: 0, objectFit: "contain" }}
          />
        ))}

        {[...preparedFrame.preparedAudios.values()].map(({ clip }) => (
          <audio
            key={clip.id}
            ref={registerRef(audioRefs, clip.id)}
            src={clip.url}
            preload="auto"
            onLoadedMetadata={() => syncFrameRef.current()}
          />
        ))}

        {/* A picture smaller than the frame, such as a sticker, sits in a
            box of its own and drags like text. A full-frame one does nothing
            when clicked, the way it never has. */}
        {images.map(({ clip, zIndex }) => {
          const placed = isPlacedPicture(clip)
          const slides = !placed && clip.id === selectedClipId && clipFit(clip) === "cover"
          // A picture taller than its box slides up and down, not across.
          const slidesDown =
            (pictureRatios.get(clip.url ?? "") ?? Infinity) < clipBoxRatio(clip, ratio)
          return (
            <img
              key={clip.id}
              ref={registerRef(imageRefs, clip.id)}
              src={clip.url}
              alt={clip.name}
              draggable={false}
              onPointerDown={(event) => handleBoxDown(event, clip)}
              onPointerMove={handleBoxMove}
              onPointerUp={handleBoxUp}
              onPointerCancel={handleBoxUp}
              // Learned for every picture, so one that is shrunk later
              // already knows its shape.
              onLoad={(event) =>
                learnPictureRatio(
                  clip.url,
                  event.currentTarget.naturalWidth,
                  event.currentTarget.naturalHeight
                )
              }
              className={
                placed
                  ? "absolute cursor-move touch-none select-none"
                  : slides
                    ? cn(
                        "absolute touch-none select-none",
                        slidesDown ? "cursor-ns-resize" : "cursor-ew-resize"
                      )
                    : "absolute"
              }
              style={{
                ...pictureBoxCss(clip, fittedShare(pictureRatios, clip, ratio)),
                objectFit: clipFit(clip),
                objectPosition: objectPositionCss(clip),
                filter: colourFilterCss(clip) || undefined,
                zIndex,
                visibility: isActive(clip, timeMs) ? "visible" : "hidden",
              }}
            />
          )
        })}

        {/* Text overlays — drag to move. Anchored at their middle, wrapping at
            90% of the frame (less when a caption was fitted into a platform's
            safe box), and scaled from the 1080-tall design space so the
            same size means the same thing at any stage size. `w-max` is what
            lets a line reach that 90%: placed from the middle, the box would
            otherwise only grow into the right half and wrap sooner than the
            export does. */}
        {texts.map(({ clip, zIndex }) => {
          const font = requireTextFont(clip.fontId)
          return (
            <div
              key={clip.id}
              ref={registerRef(textRefs, clip.id)}
              onPointerDown={(event) => handleOverlayDown(event, clip)}
              onPointerMove={handleOverlayMove}
              onPointerUp={handleOverlayUp}
              onPointerCancel={handleOverlayUp}
              title="Click to edit · drag to move"
              className="absolute w-max cursor-move touch-none text-center font-semibold whitespace-pre-wrap outline-1 outline-dashed outline-transparent select-none hover:outline-white/70"
              style={{
                maxWidth: `${(clip.wrapWidth ?? TEXT_WRAP_WIDTH) * 100}%`,
                left: `${(clip.x ?? 0.5) * 100}%`,
                top: `${(clip.y ?? 0.5) * 100}%`,
                transform: "translate(-50%, -50%)",
                color: clip.color ?? "#ffffff",
                fontFamily: font.family,
                fontWeight: font.weight,
                fontSize: (clip.fontSize ?? 80) * textScale,
                lineHeight: TEXT_LINE_HEIGHT,
                ...textOutlineCss(clip.strokeColor, clip.strokeWidth, textScale),
                // A block of colour behind the words. With one, the shadow goes
                // — boxed text should read like a sticker, not a drop shadow.
                backgroundColor: clip.highlightColor,
                padding: clip.highlightColor ? "0.2em 0.45em" : undefined,
                borderRadius: clip.highlightColor ? "0.14em" : undefined,
                textShadow: clip.highlightColor
                  ? undefined
                  : "0 2px 12px rgba(0,0,0,0.45)",
                zIndex,
                visibility: isActive(clip, timeMs) ? "visible" : "hidden",
              }}
            >
              <CaptionText clip={clip} />
            </div>
          )
        })}

        {/* Shapes: the lines are drawn by the frame loop, in the same pixels
            the export uses. The dashed box round the two ends takes the
            press that moves it, so while a shape is on screen anything under
            that box is picked from the timeline instead. */}
        {shapes.map(({ clip, zIndex }) => {
          const handles = shapeHandleCss(clip)
          const selected = clip.id === selectedClipId
          const active = isActive(clip, timeMs)
          return (
            <React.Fragment key={clip.id}>
              <svg
                ref={registerRef(shapeRefs, clip.id)}
                aria-hidden="true"
                viewBox={`0 0 ${shapeFrame.width} ${shapeFrame.height}`}
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full"
                style={{ zIndex, visibility: active ? "visible" : "hidden" }}
              />
              {active ? (
                <div
                  data-shape-handle={`${clip.id}:box`}
                  aria-label={`Move the ${clip.name.toLowerCase()}`}
                  onPointerDown={(event) => handleShapeDown(event, clip, "whole")}
                  onPointerMove={handleShapeMove}
                  onPointerUp={handleShapeUp}
                  onPointerCancel={handleShapeUp}
                  className={cn(
                    "absolute cursor-move touch-none outline-1 outline-dashed select-none",
                    selected ? "outline-white/70" : "outline-transparent hover:outline-white/40"
                  )}
                  style={{ ...handles.box, zIndex }}
                />
              ) : null}
              {active && selected
                ? SHAPE_ENDS.map((part) => (
                    <div
                      key={part}
                      data-shape-handle={`${clip.id}:${part}`}
                      aria-label={
                        clip.shape === "arrow"
                          ? part === "from"
                            ? "Move the arrow's tail"
                            : "Move the arrow's tip"
                          : "Resize the circle"
                      }
                      onPointerDown={(event) => handleShapeDown(event, clip, part)}
                      onPointerMove={handleShapeMove}
                      onPointerUp={handleShapeUp}
                      onPointerCancel={handleShapeUp}
                      className="absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-crosshair touch-none rounded-full border-2 border-white bg-black/60 select-none"
                      style={{ ...handles[part], zIndex: 93 }}
                    />
                  ))
                : null}
            </React.Fragment>
          )
        })}

        {/* The colour matrices the clips above point at. `sRGB` makes the
            sums run on the stored values, as `eq` does, rather than on the
            browser's default linear light. */}
        <svg aria-hidden="true" className="absolute size-0">
          {colouredClips.map((clip) => (
            <filter
              key={clip.id}
              id={colourFilterId(clip)}
              colorInterpolationFilters="sRGB"
            >
              <feColorMatrix
                type="matrix"
                values={colourMatrix(clipColour(clip)).join(" ")}
              />
            </filter>
          ))}
        </svg>

        {safeBox ? (
          <div
            aria-hidden="true"
            data-safe-box={captionLook.platform}
            className="pointer-events-none absolute border border-dashed border-white/35"
            style={{
              top: `${safeBox.top * 100}%`,
              bottom: `${safeBox.bottom * 100}%`,
              left: `${safeBox.left * 100}%`,
              right: `${safeBox.right * 100}%`,
              zIndex: 94,
            }}
          />
        ) : null}

        {/* The centre lines, only while a dragged overlay is locked onto one. */}
        <div
          ref={(element) => {
            centerGuideRefs.current.x = element
          }}
          data-snap-guide="stage-x"
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/80"
          style={{ display: "none", zIndex: 95 }}
        />
        <div
          ref={(element) => {
            centerGuideRefs.current.y = element
          }}
          data-snap-guide="stage-y"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/80"
          style={{ display: "none", zIndex: 95 }}
        />

        {/* The progress bar, over everything the way the export draws it. */}
        {progressBar && stageHeight > 0 ? (
          <div
            aria-hidden="true"
            data-progress-bar={progressBar.edge}
            className="pointer-events-none absolute inset-x-0"
            style={{
              top: progressBarTopPx(progressBar, { width: stageWidth, height: stageHeight }),
              height: progressBarThicknessPx(progressBar, { width: stageWidth, height: stageHeight }),
              zIndex: 91,
            }}
          >
            <div
              ref={progressFillRef}
              className="h-full"
              style={{ width: 0, backgroundColor: progressBar.color }}
            />
          </div>
        ) : null}

        {/* The dip-to-black layer, above every clip so the frame really does
            pass through black. */}
        <div
          ref={dipRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: 0, zIndex: 90 }}
        />

        {!hasClips && (
          <div className="absolute inset-0 grid place-items-center">
            <PlayIcon className="size-10 text-white/15" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * A text clip's words. A caption that lights up word by word has each word in
 * a span of its own, numbered, for the frame loop to colour. The spaces and
 * line breaks between them are kept exactly as typed, so the line wraps the
 * same as the plain text would.
 */
function CaptionText({ clip }: { clip: EditorClip }) {
  const text = clip.text ?? ""
  if (!captionWordHighlight(clip)) return text
  let index = 0
  return text.split(/(\s+)/).map((part, at) =>
    !part || /^\s+$/.test(part) ? (
      part
    ) : (
      <span key={at} data-word={index++}>
        {part}
      </span>
    )
  )
}
