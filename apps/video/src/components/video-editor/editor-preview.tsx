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
  dipOpacityAt,
  resolveIncomingTransition,
  transitionReachState,
  type ClipTransition,
} from "@/lib/video/clip-transitions"
import type { PlaybackSeekMode } from "@/lib/video/playback-clock"
import { requireTextFont } from "@/lib/video/text-fonts"
import {
  snapStageCenter,
  stageSnapThreshold,
} from "@/lib/video/timeline-snapping"
import { DESIGN_HEIGHT } from "@/lib/video/timeline-utils"
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
 * playing. Clips of the same file share one element, so a cut between two
 * pieces of the same footage plays straight through without a handover.
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
type MediaEntry = {
  clip: EditorClip
  track: EditorTrack
  zIndex: number
  order: number
  transition?: ClipTransition | null
}
// Pictures and text are still — they only need to know what covers what.
type VisualEntry = {
  clip: EditorClip
  zIndex: number
  transition?: ClipTransition | null
}
type DipWindow = { seamMs: number; durationMs: number }
type PlaybackFrame = {
  startMs: number
  videos: Map<string, MediaEntry>
  audios: Map<string, MediaEntry>
  images: Map<string, VisualEntry>
  texts: Map<string, VisualEntry>
  preparedVideos: Map<string, MediaEntry>
  preparedAudios: Map<string, MediaEntry>
}
type PlaybackEntry =
  | { kind: "media"; entry: MediaEntry }
  | { kind: "image"; entry: VisualEntry }
  | { kind: "text"; entry: VisualEntry }
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

// Flatten the lanes into draw order (the top lane covers the ones below it),
// working out the blend entering each clip from the one before it on its lane.
function flattenTracks(tracks: EditorTrack[]) {
  const media: MediaEntry[] = []
  const images: VisualEntry[] = []
  const texts: VisualEntry[] = []
  const dips: DipWindow[] = []
  tracks.forEach((track, trackIndex) => {
    const zIndex = tracks.length - trackIndex
    track.clips.forEach((clip, index) => {
      const transition = resolveIncomingTransition(
        clip,
        index > 0 ? track.clips[index - 1] : null
      )
      if (transition?.kind === "dip") {
        dips.push({ seamMs: clip.startMs, durationMs: transition.durationMs })
      }
      if (clip.kind === "text") {
        texts.push({ clip, zIndex })
      } else if (clip.kind === "image" && clip.url) {
        images.push({ clip, zIndex, transition })
      } else if (clip.url) {
        media.push({ clip, track, zIndex, order: media.length, transition })
      }
    })
  })
  return { media, images, texts, dips }
}

// Keep a map of live elements. The ref is read in the callback (after the
// element exists), never during render.
function registerRef<K, T extends HTMLElement>(
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
  const { clock, dispatch } = useEditorRuntime()

  const containerRef = React.useRef<HTMLDivElement>(null)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const videoRefs = React.useRef(new Map<string, HTMLVideoElement>())
  const audioRefs = React.useRef(new Map<string, HTMLAudioElement>())
  const imageRefs = React.useRef(new Map<string, HTMLImageElement>())
  const textRefs = React.useRef(new Map<string, HTMLDivElement>())
  // The black layer a dip-to-black seam drives.
  const dipRef = React.useRef<HTMLDivElement>(null)
  const syncFrameRef = React.useRef<() => void>(() => undefined)
  // A text overlay being dragged. Its position moves directly on the element
  // during the drag and is written to the store once, on release.
  const textDragRef = React.useRef<{
    clipId: string
    offsetX: number
    offsetY: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  // The two centre lines a dragged overlay locks onto. Shown and hidden
  // directly for the same reason the drag is: state here would re-render the
  // preview, and reload its videos, on every pointer move.
  const centerGuideRefs = React.useRef<{
    x: HTMLDivElement | null
    y: HTMLDivElement | null
  }>({ x: null, y: null })
  const [containerBox, setContainerBox] = React.useState({ w: 0, h: 0 })

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

  const { media, images, texts, dips } = React.useMemo(
    () => flattenTracks(tracks),
    [tracks]
  )

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
    if (!events.has(0)) {
      events.set(0, { enter: [], leave: [], prepare: [], release: [] })
    }

    const activeMedia = new Map<string, MediaEntry>()
    const preparedMedia = new Map<string, MediaEntry>()
    const activeImages = new Map<string, VisualEntry>()
    const activeTexts = new Map<string, VisualEntry>()
    const frames: PlaybackFrame[] = []
    for (const startMs of [...events.keys()].sort((a, b) => a - b)) {
      const event = events.get(startMs)!
      for (const entry of event.release) preparedMedia.delete(entry.clip.id)
      for (const item of event.leave) {
        if (item.kind === "media") activeMedia.delete(item.entry.clip.id)
        else if (item.kind === "image") activeImages.delete(item.entry.clip.id)
        else activeTexts.delete(item.entry.clip.id)
      }
      for (const entry of event.prepare) preparedMedia.set(entry.clip.id, entry)
      for (const item of event.enter) {
        if (item.kind === "media") {
          activeMedia.set(item.entry.clip.id, item.entry)
        } else if (item.kind === "image") {
          activeImages.set(item.entry.clip.id, item.entry)
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
        preparedVideos,
        preparedAudios,
      })
    }
    return frames
  }, [media, images, texts])

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
        (clip) => (clip.kind === "audio" || clip.kind === "video") && !clip.muted
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
          clip.startMs + (element.currentTime * 1000 - clip.trimStartMs)
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
      if (element.ended) return entry.clip.startMs + entry.clip.durationMs
      if (element.seeking || element.readyState < 2 || element.paused) {
        return timeMs
      }
      return Math.max(
        timeMs,
        entry.clip.startMs +
          (element.currentTime * 1000 - entry.clip.trimStartMs)
      )
    })
    return () => clock.setTimeSource(null)
  }, [clock, playbackFrames])

  // The one per-frame loop, driven by the clock: it ticks while playing and
  // fires once per seek. Everything in here touches the DOM directly.
  React.useEffect(() => {
    let previousFrame: PlaybackFrame | null = null
    const mediaSeekRequests = new WeakMap<HTMLMediaElement, MediaSeekRequest>()
    // Start from a known state whenever the project changes shape; the loop
    // below then only touches what is active or crossing a boundary.
    for (const element of videoRefs.current.values()) {
      if (element.style.opacity !== "0") element.style.opacity = "0"
      if (element.style.transform) element.style.transform = ""
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
        previousFrame = frame
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
          const transform = state.translateXPct
            ? `translateX(${state.translateXPct}%)`
            : ""
          if (element.style.transform !== transform) {
            element.style.transform = transform
          }
        } else {
          if (element.style.opacity !== "1") element.style.opacity = "1"
          const zIndex = String(entry.zIndex)
          if (element.style.zIndex !== zIndex) element.style.zIndex = zIndex
          if (element.style.transform) element.style.transform = ""
        }
        const muted = entry.track.muted || !!clip.muted
        if (element.muted !== muted) element.muted = muted
        const volume = entry.track.duck
          ? sampleEnvelope(duckEnvelope, timeMs)
          : 1
        if (element.volume !== volume) element.volume = volume
        // Hold the first frame through the blend, so the picture is continuous
        // once real playback starts at the seam.
        const targetS = reaching
          ? clip.trimStartMs / 1000
          : (clip.trimStartMs + (timeMs - clip.startMs)) / 1000
        if ((!playing || reaching) && !element.paused) element.pause()
        seekPreviewMedia(
          element,
          targetS,
          seekMode,
          seekToleranceS,
          mediaSeekRequests
        )
        if (playing && !reaching && element.paused) {
          void element.play().catch(() => undefined)
        }
      }

      for (const { clip, track } of frame.audios.values()) {
        const element = audioRefs.current.get(clip.id)
        if (!element) continue
        const muted = track.muted || !!clip.muted
        if (element.muted !== muted) element.muted = muted
        const volume = track.duck ? sampleEnvelope(duckEnvelope, timeMs) : 1
        if (element.volume !== volume) element.volume = volume
        const targetS = (clip.trimStartMs + (timeMs - clip.startMs)) / 1000
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
      // simply holds its one frame throughout.
      for (const entry of frame.images.values()) {
        const transition = entry.transition
        if (!transition || transition.kind === "dip") continue
        const element = imageRefs.current.get(entry.clip.id)
        if (!element) continue
        if (timeMs < entry.clip.startMs) {
          const state = transitionReachState(
            transition.kind,
            entry.clip.startMs,
            transition.durationMs,
            timeMs
          )
          element.style.opacity = String(state.opacity)
          element.style.zIndex = String(entry.zIndex + 1)
          element.style.transform = state.translateXPct
            ? `translateX(${state.translateXPct}%)`
            : ""
        } else {
          if (element.style.opacity !== "1") element.style.opacity = "1"
          const zIndex = String(entry.zIndex)
          if (element.style.zIndex !== zIndex) element.style.zIndex = zIndex
          if (element.style.transform) element.style.transform = ""
        }
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
  }, [clock, playbackFrames, dips, duckEnvelope])

  // --- Dragging a text overlay around the frame ----------------------------
  // Grab it anywhere; the gap between the pointer and the text's middle is kept
  // so it follows the cursor rather than jumping under it.
  function handleTextDown(event: React.PointerEvent, clip: EditorClip) {
    if (event.button !== 0) return
    // Select it too, so the inspector opens on it — a plain click just selects,
    // and a drag past a few pixels moves it.
    dispatch({ type: "SELECT_CLIP", clipId: clip.id })
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const centerX = (clip.x ?? 0.5) * rect.width
    const centerY = (clip.y ?? 0.5) * rect.height
    textDragRef.current = {
      clipId: clip.id,
      offsetX: centerX - (event.clientX - rect.left),
      offsetY: centerY - (event.clientY - rect.top),
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  // Where the text would land, centre snapping included. Holding Alt sets the
  // threshold to zero, which is how the bypass works: nothing is ever within
  // zero of a centre line.
  function resolveTextDrag(
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

  function handleTextMove(event: React.PointerEvent) {
    const drag = textDragRef.current
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
    const snapped = resolveTextDrag(drag, event, stage.getBoundingClientRect())
    const element = textRefs.current.get(drag.clipId)
    if (element) {
      element.style.left = `${snapped.x * 100}%`
      element.style.top = `${snapped.y * 100}%`
    }
    paintCenterGuides(snapped.snappedX, snapped.snappedY)
  }

  function handleTextUp(event: React.PointerEvent) {
    const drag = textDragRef.current
    textDragRef.current = null
    const stage = stageRef.current
    if (!drag) return
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    paintCenterGuides(false, false)
    if (!drag.moved || !stage) return
    // Write the final position once, as a single undo step.
    const snapped = resolveTextDrag(drag, event, stage.getBoundingClientRect())
    dispatch({
      type: "UPDATE_CLIP",
      clipId: drag.clipId,
      patch: { x: snapped.x, y: snapped.y },
    })
  }

  const hasClips = media.length > 0 || images.length > 0 || texts.length > 0
  const textScale = stageHeight > 0 ? stageHeight / DESIGN_HEIGHT : 0
  const timeMs = clock.getTime()

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
            onLoadedMetadata={() => syncFrameRef.current()}
            onClick={() => {
              if (clock.playing) clock.pause()
            }}
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
            style={{ opacity: 0 }}
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

        {images.map(({ clip, zIndex }) => (
          <img
            key={clip.id}
            ref={registerRef(imageRefs, clip.id)}
            src={clip.url}
            alt={clip.name}
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain"
            style={{
              zIndex,
              visibility: isActive(clip, timeMs) ? "visible" : "hidden",
            }}
          />
        ))}

        {/* Text overlays — drag to move. Anchored at their middle, wrapping at
            90% of the frame, and scaled from the 1080-tall design space so the
            same size means the same thing at any stage size. */}
        {texts.map(({ clip, zIndex }) => {
          const font = requireTextFont(clip.fontId)
          return (
            <div
              key={clip.id}
              ref={registerRef(textRefs, clip.id)}
              onPointerDown={(event) => handleTextDown(event, clip)}
              onPointerMove={handleTextMove}
              onPointerUp={handleTextUp}
              onPointerCancel={handleTextUp}
              title="Click to edit · drag to move"
              className="absolute max-w-[90%] cursor-move touch-none text-center font-semibold whitespace-pre-wrap outline-1 outline-dashed outline-transparent select-none hover:outline-white/70"
              style={{
                left: `${(clip.x ?? 0.5) * 100}%`,
                top: `${(clip.y ?? 0.5) * 100}%`,
                transform: "translate(-50%, -50%)",
                color: clip.color ?? "#ffffff",
                fontFamily: font.family,
                fontWeight: font.weight,
                fontSize: (clip.fontSize ?? 80) * textScale,
                lineHeight: 1.15,
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
              {clip.text}
            </div>
          )
        })}

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
