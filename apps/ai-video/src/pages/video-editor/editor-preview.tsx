import * as React from "react"
import { PlayIcon } from "lucide-react"

import { useShellRuntime } from "@/components/shell-runtime"
import {
  computeDuckEnvelope,
  dbToGain,
  sampleEnvelope,
  type Interval,
} from "@/lib/audio-ducking"
import { requireTextFont } from "@/lib/text-fonts"
import {
  captionEntranceProgress,
  captionWordAnimation,
  captionWordTransformCss,
  isAnimatedCaption,
  resolveCaptionAnimation,
} from "@/lib/caption-animations"
import {
  dipOpacityAt,
  resolveIncomingTransition,
  transitionReachState,
  type ClipTransition,
} from "@/lib/clip-transitions"
import {
  timelineDurationMs,
  useEditorRuntime,
  useEditorSelector,
  type EditorClip,
  type EditorTrack,
} from "@/pages/video-editor/editor-store"
import type { PlaybackSeekMode } from "@/pages/video-editor/playback-clock"
import { DESIGN_HEIGHT } from "@/pages/video-editor/timeline-utils"
import {
  snapStageCenter,
  stageSnapThreshold,
} from "@/pages/video-editor/timeline-snapping"

// How far media elements may drift from the clock before being re-seeked.
const PLAYING_DRIFT_S = 0.25
const PAUSED_DRIFT_S = 0.04
const MEDIA_LOOK_AHEAD_MS = 2000

// Clock-synced video/audio elements need their track (mute state)...
// `transition` is the resolved blend entering this clip (crossfade/slide draw
// the clip early over the previous one; dip is handled by a separate overlay).
type MediaEntry = {
  clip: EditorClip
  track: EditorTrack
  zIndex: number
  order: number
  transition?: ClipTransition | null
}
// ...while images/text are static visuals that only need stacking order.
type VisualEntry = {
  clip: EditorClip
  zIndex: number
  transition?: ClipTransition | null
}
// A dip-to-black seam: a black overlay peaking on the seam (see dipOpacityAt).
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
  el: HTMLMediaElement,
  targetS: number,
  mode: PlaybackSeekMode,
  toleranceS: number,
  requests: WeakMap<HTMLMediaElement, MediaSeekRequest>
) {
  if (!Number.isFinite(targetS) || Math.abs(el.currentTime - targetS) <= toleranceS) {
    return
  }
  const previous = requests.get(el)
  if (
    previous?.mode === mode &&
    Math.abs(previous.targetS - targetS) < 0.001
  ) {
    return
  }
  // A metadata event re-runs synchronization once seeking becomes valid.
  if (el.readyState === 0) return

  if (mode === "fast") {
    const fastSeek = (el as FastSeekMediaElement).fastSeek
    if (typeof fastSeek === "function") {
      try {
        fastSeek.call(el, targetS)
        requests.set(el, { mode, targetS })
        return
      } catch {
        // Metadata may not be ready yet; exact currentTime is the safe fallback.
      }
    }
  }

  el.currentTime = targetS
  requests.set(el, { mode, targetS })
}

// Flatten clips with their stacking order (track 0 on top), resolving the
// transition entering each clip from its same-track predecessor.
function flattenTracks(tracks: EditorTrack[]) {
  const media: MediaEntry[] = []
  const images: VisualEntry[] = []
  const texts: VisualEntry[] = []
  const dips: DipWindow[] = []
  tracks.forEach((track, trackIndex) => {
    const zIndex = tracks.length - trackIndex
    track.clips.forEach((clip, idx) => {
      const transition = resolveIncomingTransition(
        clip,
        idx > 0 ? track.clips[idx - 1] : null
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

// Registers/unregisters an element in a shared map. The ref object is
// dereferenced inside the callback (commit time), never in render.
function registerRef<K, T extends HTMLElement>(
  refs: { current: Map<K, T> },
  key: K
) {
  return (el: T | null) => {
    if (el) refs.current.set(key, el)
    else refs.current.delete(key)
  }
}

function isActive(clip: EditorClip, timeMs: number) {
  return timeMs >= clip.startMs && timeMs < clip.startMs + clip.durationMs
}

// Clamp a normalized coordinate to the [0,1] frame bounds.
function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

// Inactive karaoke words are dimmed to this opacity; the active word is full.
const KARAOKE_DIM = 0.5

// Index of the word the playhead has reached (last word whose start <= time),
// so one word stays lit through inter-word gaps. relativeMs is clip-relative.
function activeWordIndex(words: { startMs: number }[], relativeMs: number) {
  let low = 0
  let high = words.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (words[middle].startMs <= relativeMs) low = middle + 1
    else high = middle
  }
  return Math.max(0, low - 1)
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

// Renders the composed timeline. Prepared clips share one <video> per source,
// so contiguous splits play through without an element handoff. Only active
// and near-future video/audio elements are mounted; a single clock-subscribed
// loop drives all per-frame work imperatively.
export function EditorPreview() {
  const tracks = useEditorSelector((state) => state.tracks)
  const aspect = useEditorSelector((state) => state.aspect)
  const { clock, dispatch } = useEditorRuntime()
  const { config } = useShellRuntime()

  const containerRef = React.useRef<HTMLDivElement>(null)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const videoRefs = React.useRef(new Map<string, HTMLVideoElement>())
  const audioRefs = React.useRef(new Map<string, HTMLAudioElement>())
  const imageRefs = React.useRef(new Map<string, HTMLImageElement>())
  const textRefs = React.useRef(new Map<string, HTMLDivElement>())
  // Full-frame black layer driven by any active dip-to-black seam.
  const dipRef = React.useRef<HTMLDivElement>(null)
  const syncFrameRef = React.useRef<() => void>(() => undefined)
  // Per-word spans for karaoke captions, keyed `${clipId}:${index}`.
  const wordRefs = React.useRef(new Map<string, HTMLSpanElement>())
  // Active text-overlay drag (preview positioning). Position is updated
  // imperatively during the drag, then committed to the store on release.
  const textDragRef = React.useRef<{
    clipId: string
    offsetX: number
    offsetY: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  // The two centre lines a dragged text overlay locks onto. Shown and hidden
  // imperatively for the same reason the drag itself is imperative — state
  // here would re-render the preview (and reload its <video> elements) on
  // every pointer move.
  const centerGuideRefs = React.useRef<{
    x: HTMLDivElement | null
    y: HTMLDivElement | null
  }>({ x: null, y: null })
  const [containerBox, setContainerBox] = React.useState({ w: 0, h: 0 })

  // Track the available panel space; the stage is sized in JS because CSS
  // aspect-ratio can't fit a box against BOTH max-width and max-height.
  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() =>
      setContainerBox({ w: el.clientWidth, h: el.clientHeight })
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Largest stage that fits the container at the project aspect ratio.
  const ratio = React.useMemo(() => {
    const [w, h] = aspect.split(":").map(Number)
    return w / h
  }, [aspect])
  let stageWidth = containerBox.w
  let stageHeight = stageWidth / ratio
  if (stageHeight > containerBox.h) {
    stageHeight = containerBox.h
    stageWidth = stageHeight * ratio
  }

  // The clip lists only change on edits.
  const { media, images, texts, dips } = React.useMemo(
    () => flattenTracks(tracks),
    [tracks]
  )
  // Clip activity changes only at start/end boundaries. Build immutable frame
  // snapshots on edits so playback can find the current active set by binary
  // search instead of scanning the whole timeline on every clock tick.
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
      // Crossfade/slide clips are drawn early over the outgoing clip's tail, so
      // they become active `durationMs` before their real start. Dip does not
      // reach back (it is a separate black overlay). Leave stays at the end.
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
        if (item.kind === "media") activeMedia.set(item.entry.clip.id, item.entry)
        else if (item.kind === "image") activeImages.set(item.entry.clip.id, item.entry)
        else activeTexts.set(item.entry.clip.id, item.entry)
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
  const preparedFrame = React.useSyncExternalStore(
    clock.subscribe,
    () => playbackFrameAt(playbackFrames, clock.getTime()),
    () => playbackFrames[0]
  )
  React.useLayoutEffect(() => syncFrameRef.current(), [preparedFrame])

  // Live "duck under voice": a volume envelope for ducked tracks that mirrors
  // the export renderer, so the toggle is audible while editing — not only on
  // export. Best-effort: video counts as "voice" whether or not it actually
  // carries sound (the browser can't cheaply probe that).
  const duckingGain = React.useMemo(
    () => dbToGain(config.duckingDb),
    [config.duckingDb]
  )
  const duckEnvelope = React.useMemo(() => {
    if (duckingGain >= 1) return [] // 0 dB = off
    const voiceIntervals: Interval[] = []
    let hasDuckSource = false
    for (const track of tracks) {
      if (track.muted) continue
      const audible = track.clips.filter(
        (clip) => (clip.kind === "audio" || clip.kind === "video") && !clip.muted
      )
      if (track.duck) {
        if (audible.length) hasDuckSource = true
        continue
      }
      for (const clip of audible) {
        voiceIntervals.push({
          startMs: clip.startMs,
          endMs: clip.startMs + clip.durationMs,
        })
      }
    }
    if (!hasDuckSource || !voiceIntervals.length) return []
    return computeDuckEnvelope({
      voiceIntervals,
      durationMs: timelineDurationMs(tracks),
      duckGain: duckingGain,
    })
  }, [tracks, duckingGain])

  // Drive the clock from the element carrying the SOUND (an unmuted audio track
  // wins, since captions are timed to it; else the topmost active video). The
  // clock holds while that source seeks or buffers, and advances an ended
  // source to its clip boundary instead of running ahead on wall time.
  React.useEffect(() => {
    clock.setTimeSource(() => {
      const t = clock.getTime()
      const frame = playbackFrameAt(playbackFrames, t)
      let hasAudioSource = false
      let endedAudioTime: number | null = null
      for (const { clip, track } of frame.audios.values()) {
        if (track.muted || clip.muted) continue
        hasAudioSource = true
        const el = audioRefs.current.get(clip.id)
        if (!el) continue
        if (el.ended) {
          endedAudioTime = Math.max(
            endedAudioTime ?? 0,
            clip.startMs + clip.durationMs
          )
          continue
        }
        if (el.seeking || el.readyState < 2 || el.paused) continue
        const timelineTime =
          clip.startMs + (el.currentTime * 1000 - clip.trimStartMs)
        if (timelineTime > t) return timelineTime
      }
      if (endedAudioTime != null) return Math.max(t, endedAudioTime)
      if (hasAudioSource) return t

      let source: [string, MediaEntry] | null = null
      for (const entry of frame.videos) {
        if (!source || entry[1].zIndex > source[1].zIndex) {
          source = entry
        }
      }
      if (!source) return null // Gaps continue on wall time.

      const [url, entry] = source
      const el = videoRefs.current.get(url)
      if (!el) return t
      if (el.ended) return entry.clip.startMs + entry.clip.durationMs
      if (el.seeking || el.readyState < 2 || el.paused) return t
      return Math.max(
        t,
        entry.clip.startMs +
          (el.currentTime * 1000 - entry.clip.trimStartMs)
      )
    })
    return () => clock.setTimeSource(null)
  }, [clock, playbackFrames])

  // The single per-frame loop, driven by the clock (ticks while playing, and
  // fires once per seek). All DOM updates here are imperative — no React render.
  React.useEffect(() => {
    let previousFrame: PlaybackFrame | null = null
    const activeWords = new Map<string, number>()
    const mediaSeekRequests = new WeakMap<
      HTMLMediaElement,
      MediaSeekRequest
    >()
    // Reset imperative state once when the index changes. Per-frame work below
    // then touches only active entries and clips crossing a boundary.
    for (const el of videoRefs.current.values()) {
      if (el.style.opacity !== "0") el.style.opacity = "0"
      if (el.style.transform) el.style.transform = ""
      if (!el.paused) el.pause()
    }
    for (const el of audioRefs.current.values()) {
      if (!el.paused) el.pause()
    }
    for (const el of imageRefs.current.values()) {
      el.style.visibility = "hidden"
      if (el.style.opacity && el.style.opacity !== "1") el.style.opacity = "1"
      if (el.style.transform) el.style.transform = ""
    }
    for (const el of textRefs.current.values()) el.style.visibility = "hidden"
    for (const el of wordRefs.current.values()) {
      el.style.opacity = String(KARAOKE_DIM)
      // Clear any lingering animated-caption transform from a prior index.
      if (el.style.transform) el.style.transform = ""
    }

    function syncFrame() {
      const timeMs = clock.getTime()
      const playing = clock.playing
      const frame = playbackFrameAt(playbackFrames, timeMs)

      // One <video> per source, driven to its active clip. Contiguous clips of
      // the same source keep the same target position across the cut, so the
      // element plays straight through with no seek.
      if (frame !== previousFrame) {
        for (const [url] of previousFrame?.videos ?? []) {
          if (frame.videos.has(url)) continue
          const el = videoRefs.current.get(url)
          if (!el) continue
          if (el.style.opacity !== "0") el.style.opacity = "0"
          if (!el.paused) el.pause()
        }
        for (const [clipId] of previousFrame?.audios ?? []) {
          if (frame.audios.has(clipId)) continue
          const el = audioRefs.current.get(clipId)
          if (el && !el.paused) el.pause()
        }
        for (const [clipId] of previousFrame?.images ?? []) {
          if (frame.images.has(clipId)) continue
          const el = imageRefs.current.get(clipId)
          if (el && el.style.visibility !== "hidden") {
            el.style.visibility = "hidden"
          }
        }
        for (const [clipId] of frame.images) {
          if (previousFrame?.images.has(clipId)) continue
          const el = imageRefs.current.get(clipId)
          if (el && el.style.visibility !== "visible") {
            el.style.visibility = "visible"
          }
        }
        for (const [clipId] of previousFrame?.texts ?? []) {
          if (frame.texts.has(clipId)) continue
          const el = textRefs.current.get(clipId)
          if (el && el.style.visibility !== "hidden") {
            el.style.visibility = "hidden"
          }
        }
        for (const [clipId] of frame.texts) {
          if (previousFrame?.texts.has(clipId)) continue
          const el = textRefs.current.get(clipId)
          if (el && el.style.visibility !== "visible") {
            el.style.visibility = "visible"
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
        const el = videoRefs.current.get(url)
        if (!el) continue
        const { clip } = entry
        // Reach-back: this clip is drawn early over the previous one, held on
        // its first frame while its alpha/slide ramps in (see the export path
        // in video-render.ts). It sits one layer above its same-track neighbour.
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
          if (el.style.opacity !== opacity) el.style.opacity = opacity
          const zIndex = String(entry.zIndex + 1)
          if (el.style.zIndex !== zIndex) el.style.zIndex = zIndex
          const transform = state.translateXPct
            ? `translateX(${state.translateXPct}%)`
            : ""
          if (el.style.transform !== transform) el.style.transform = transform
        } else {
          if (el.style.opacity !== "1") el.style.opacity = "1"
          const zIndex = String(entry.zIndex)
          if (el.style.zIndex !== zIndex) el.style.zIndex = zIndex
          if (el.style.transform) el.style.transform = ""
        }
        const muted = entry.track.muted || !!clip.muted
        if (el.muted !== muted) el.muted = muted
        const volume = entry.track.duck
          ? sampleEnvelope(duckEnvelope, timeMs)
          : 1
        if (el.volume !== volume) el.volume = volume
        // Freeze the first frame during the reach-back so content is continuous
        // once real playback begins at the seam.
        const targetS = reaching
          ? clip.trimStartMs / 1000
          : (clip.trimStartMs + (timeMs - clip.startMs)) / 1000
        if ((!playing || reaching) && !el.paused) el.pause()
        seekPreviewMedia(
          el,
          targetS,
          seekMode,
          seekToleranceS,
          mediaSeekRequests
        )
        if (playing && !reaching && el.paused) {
          void el.play().catch(() => undefined)
        }
      }

      // Audio: only active clips are visited on each tick.
      for (const { clip, track } of frame.audios.values()) {
        const el = audioRefs.current.get(clip.id)
        if (!el) continue
        const muted = track.muted || !!clip.muted
        if (el.muted !== muted) el.muted = muted
        const volume = track.duck ? sampleEnvelope(duckEnvelope, timeMs) : 1
        if (el.volume !== volume) el.volume = volume
        const targetS = (clip.trimStartMs + (timeMs - clip.startMs)) / 1000
        if (!playing && !el.paused) el.pause()
        seekPreviewMedia(
          el,
          targetS,
          seekMode,
          seekToleranceS,
          mediaSeekRequests
        )
        if (playing && el.paused) void el.play().catch(() => undefined)
      }

      // Image reach-back: an incoming image drawn early over the previous clip
      // fades/slides in exactly like a video (it just holds its single frame).
      for (const entry of frame.images.values()) {
        const transition = entry.transition
        if (!transition || transition.kind === "dip") continue
        const el = imageRefs.current.get(entry.clip.id)
        if (!el) continue
        if (timeMs < entry.clip.startMs) {
          const state = transitionReachState(
            transition.kind,
            entry.clip.startMs,
            transition.durationMs,
            timeMs
          )
          el.style.opacity = String(state.opacity)
          el.style.zIndex = String(entry.zIndex + 1)
          el.style.transform = state.translateXPct
            ? `translateX(${state.translateXPct}%)`
            : ""
        } else {
          if (el.style.opacity !== "1") el.style.opacity = "1"
          const zIndex = String(entry.zIndex)
          if (el.style.zIndex !== zIndex) el.style.zIndex = zIndex
          if (el.style.transform) el.style.transform = ""
        }
      }

      // Dip-to-black: a full-frame black layer at whichever seam is nearest.
      const dipEl = dipRef.current
      if (dipEl) {
        let dipOpacity = 0
        for (const dip of dips) {
          const value = dipOpacityAt(dip.seamMs, dip.durationMs, timeMs)
          if (value > dipOpacity) dipOpacity = value
        }
        const opacity = String(dipOpacity)
        if (dipEl.style.opacity !== opacity) dipEl.style.opacity = opacity
      }

      // Karaoke: binary-search the active word and update spans imperatively.
      for (const { clip } of frame.texts.values()) {
        if (!clip.words?.length) continue
        const relativeMs = timeMs - clip.startMs
        const active = activeWordIndex(clip.words, relativeMs)
        const previous = activeWords.get(clip.id)
        const animation = resolveCaptionAnimation(clip.animation)

        if (isAnimatedCaption(animation)) {
          // The active word animates continuously through its entrance, so it
          // must be re-styled every frame (one span). When it changes, the
          // outgoing word is reset to the resting dimmed look.
          if (previous != null && previous !== active) {
            const previousEl = wordRefs.current.get(`${clip.id}:${previous}`)
            if (previousEl) {
              previousEl.style.opacity = String(KARAOKE_DIM)
              previousEl.style.transform = ""
            }
          }
          const activeEl = wordRefs.current.get(`${clip.id}:${active}`)
          if (activeEl) {
            const t = captionWordAnimation(
              animation,
              captionEntranceProgress(relativeMs, clip.words[active].startMs)
            )
            activeEl.style.opacity = String(t.opacity)
            activeEl.style.transform = captionWordTransformCss(t)
          }
          activeWords.set(clip.id, active)
          continue
        }

        // Static highlight: only the two spans that change need touching.
        if (previous === active) continue
        if (previous != null) {
          const previousEl = wordRefs.current.get(`${clip.id}:${previous}`)
          if (previousEl) previousEl.style.opacity = String(KARAOKE_DIM)
        }
        const activeEl = wordRefs.current.get(`${clip.id}:${active}`)
        if (activeEl) activeEl.style.opacity = "1"
        activeWords.set(clip.id, active)
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
  }, [clock, playbackFrames, duckEnvelope, dips])

  // --- Drag a text overlay to reposition it on the frame -------------------
  // Grab anywhere on the text; the offset between the pointer and the text's
  // center is preserved so it tracks the cursor naturally.
  function handleTextDown(e: React.PointerEvent, clip: EditorClip) {
    if (e.button !== 0) return
    // Select the clip so the right-panel inspector opens for it (same as a
    // single-click on the timeline); a plain click then just selects, while a
    // drag past the threshold repositions it.
    dispatch({ type: "SELECT_CLIP", clipId: clip.id })
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const centerX = (clip.x ?? 0.5) * rect.width
    const centerY = (clip.y ?? 0.5) * rect.height
    textDragRef.current = {
      clipId: clip.id,
      offsetX: centerX - (e.clientX - rect.left),
      offsetY: centerY - (e.clientY - rect.top),
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  // Where the text would land for this pointer position, centre snapping
  // included. Alt zeroes the threshold, which is how the bypass works: nothing
  // is ever within zero of a centre line.
  function resolveTextDrag(
    drag: { offsetX: number; offsetY: number },
    e: React.PointerEvent,
    rect: DOMRect
  ) {
    const x = clamp01((e.clientX - rect.left + drag.offsetX) / rect.width)
    const y = clamp01((e.clientY - rect.top + drag.offsetY) / rect.height)
    return snapStageCenter({
      x,
      y,
      thresholdX: e.altKey ? 0 : stageSnapThreshold(rect.width),
      thresholdY: e.altKey ? 0 : stageSnapThreshold(rect.height),
    })
  }

  function paintCenterGuides(showX: boolean, showY: boolean) {
    const { x, y } = centerGuideRefs.current
    if (x) x.style.display = showX ? "block" : "none"
    if (y) y.style.display = showY ? "block" : "none"
  }

  function handleTextMove(e: React.PointerEvent) {
    const drag = textDragRef.current
    const stage = stageRef.current
    if (!drag || !stage) return
    // Small threshold so a click (to double-click) doesn't register as a move.
    if (
      !drag.moved &&
      Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4
    ) {
      return
    }
    drag.moved = true
    const snapped = resolveTextDrag(drag, e, stage.getBoundingClientRect())
    const el = textRefs.current.get(drag.clipId)
    if (el) {
      // Imperative during the drag — avoids re-rendering the whole preview
      // (and reloading <video> elements) on every pointer move.
      el.style.left = `${snapped.x * 100}%`
      el.style.top = `${snapped.y * 100}%`
    }
    paintCenterGuides(snapped.snappedX, snapped.snappedY)
  }

  function handleTextUp(e: React.PointerEvent) {
    const drag = textDragRef.current
    textDragRef.current = null
    const stage = stageRef.current
    if (!drag) return
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    paintCenterGuides(false, false)
    if (!drag.moved || !stage) return
    // Commit the final position once, as a single undo step.
    const snapped = resolveTextDrag(drag, e, stage.getBoundingClientRect())
    dispatch({
      type: "UPDATE_CLIP",
      clipId: drag.clipId,
      patch: { x: snapped.x, y: snapped.y },
    })
  }

  const hasClips = media.length > 0 || images.length > 0 || texts.length > 0
  const textScale = stageHeight > 0 ? stageHeight / DESIGN_HEIGHT : 0
  const now = clock.getTime()

  return (
    <div ref={containerRef} className="grid h-full w-full place-items-center">
      <div
        ref={stageRef}
        className="relative overflow-hidden rounded-md bg-black"
        style={{ width: stageWidth, height: stageHeight }}
      >
        {/* One <video> per prepared source; the sync loop sets its opacity/z
            and drives it to whichever clip of that source is active. */}
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

        {/* Audio: active and near-future clips only. */}
        {[...preparedFrame.preparedAudios.values()].map(({ clip }) => (
          <audio
            key={clip.id}
            ref={registerRef(audioRefs, clip.id)}
            src={clip.url}
            preload="auto"
            onLoadedMetadata={() => syncFrameRef.current()}
          />
        ))}

        {/* Image clips: static, just toggled by the playhead window */}
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
              visibility: isActive(clip, now) ? "visible" : "hidden",
            }}
          />
        ))}

        {/* Text overlays — drag to reposition. Absolutely positioned and
            shrink-to-fit (wrapping at 90% frame width), anchored at the clip's
            center (x,y); scaled from the 1080p design space; shown/hidden by
            the sync loop. */}
        {texts.map(({ clip, zIndex }) => {
          const font = requireTextFont(clip.fontId)
          const words = clip.words
          // Active word for karaoke clips, computed once per clip (the sync
          // loop also updates these opacities imperatively during playback).
          const active = words?.length
            ? activeWordIndex(words, now - clip.startMs)
            : -1
          const animation = resolveCaptionAnimation(clip.animation)
          const animated = isAnimatedCaption(animation)
          return (
          <div
            key={clip.id}
            ref={registerRef(textRefs, clip.id)}
            onPointerDown={(e) => handleTextDown(e, clip)}
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
              // Highlight box behind the text (when set); drop the shadow then
              // so boxed text stays clean, like a caption sticker.
              backgroundColor: clip.highlightColor,
              padding: clip.highlightColor ? "0.2em 0.45em" : undefined,
              borderRadius: clip.highlightColor ? "0.14em" : undefined,
              textShadow: clip.highlightColor
                ? undefined
                : "0 2px 12px rgba(0,0,0,0.45)",
              zIndex,
              visibility: isActive(clip, now) ? "visible" : "hidden",
            }}
          >
            {words?.length
              ? words.map((word, i) => {
                  // Karaoke: each word is a span the sync loop dims/lights;
                  // initial style matches the (paused) playhead. The trailing
                  // space is a sibling text node so animated (inline-block)
                  // words still wrap. Animated clips carry the active word's
                  // entrance transform up front to avoid a first-frame flash.
                  const isActiveWord = i === active
                  const enter =
                    animated && isActiveWord
                      ? captionWordAnimation(
                          animation,
                          captionEntranceProgress(
                            now - clip.startMs,
                            word.startMs
                          )
                        )
                      : null
                  return (
                    <React.Fragment key={i}>
                      <span
                        ref={registerRef(wordRefs, `${clip.id}:${i}`)}
                        style={{
                          opacity: enter
                            ? enter.opacity
                            : isActiveWord
                              ? 1
                              : KARAOKE_DIM,
                          ...(animated
                            ? {
                                display: "inline-block",
                                transformOrigin: "center",
                                transform: enter
                                  ? captionWordTransformCss(enter)
                                  : undefined,
                              }
                            : null),
                        }}
                      >
                        {word.text}
                      </span>
                      {i < words.length - 1 ? " " : ""}
                    </React.Fragment>
                  )
                })
              : clip.text}
          </div>
          )
        })}

        {/* Centre alignment guides. Only visible while a dragged text overlay
            is locked onto that line, so they never sit over the frame during
            normal playback. */}
        <div
          ref={(el) => {
            centerGuideRefs.current.x = el
          }}
          data-snap-guide="stage-x"
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/80"
          style={{ display: "none", zIndex: 95 }}
        />
        <div
          ref={(el) => {
            centerGuideRefs.current.y = el
          }}
          data-snap-guide="stage-y"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/80"
          style={{ display: "none", zIndex: 95 }}
        />

        {/* Dip-to-black overlay: opacity driven by the sync loop, on top of
            every clip so the frame truly dips through black. */}
        <div
          ref={dipRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: 0, zIndex: 90 }}
        />

        {/* Empty-project hint */}
        {!hasClips && (
          <div className="absolute inset-0 grid place-items-center">
            <PlayIcon className="size-10 text-white/15" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  )
}
