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
  timelineDurationMs,
  useEditorRuntime,
  useEditorSelector,
  type EditorClip,
  type EditorTrack,
} from "@/pages/video-editor/editor-store"
import { DESIGN_HEIGHT } from "@/pages/video-editor/timeline-utils"

// How far media elements may drift from the clock before being re-seeked.
const PLAYING_DRIFT_S = 0.25
const PAUSED_DRIFT_S = 0.04
const MEDIA_LOOK_AHEAD_MS = 2000

// Clock-synced video/audio elements need their track (mute state)...
type MediaEntry = {
  clip: EditorClip
  track: EditorTrack
  zIndex: number
  order: number
}
// ...while images/text are static visuals that only need stacking order.
type VisualEntry = { clip: EditorClip; zIndex: number }
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

// Flatten clips with their stacking order (track 0 on top).
function flattenTracks(tracks: EditorTrack[]) {
  const media: MediaEntry[] = []
  const images: VisualEntry[] = []
  const texts: VisualEntry[] = []
  tracks.forEach((track, trackIndex) => {
    const zIndex = tracks.length - trackIndex
    for (const clip of track.clips) {
      if (clip.kind === "text") {
        texts.push({ clip, zIndex })
      } else if (clip.kind === "image" && clip.url) {
        images.push({ clip, zIndex })
      } else if (clip.url) {
        media.push({ clip, track, zIndex, order: media.length })
      }
    }
  })
  return { media, images, texts }
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
  const { media, images, texts } = React.useMemo(
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
      const start = events.get(clip.startMs) ?? empty()
      start.enter.push(item)
      events.set(clip.startMs, start)
      const endMs = clip.startMs + clip.durationMs
      const end = events.get(endMs) ?? empty()
      end.leave.push(item)
      if (item.kind === "media") {
        const prepareMs = Math.max(0, clip.startMs - MEDIA_LOOK_AHEAD_MS)
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
  // source is read even while momentarily paused — only seeked/undecodable
  // elements are skipped — so the clock HOLDS at a cut rather than running
  // ahead on wall time and snapping back.
  React.useEffect(() => {
    clock.setTimeSource(() => {
      const t = clock.getTime()
      const frame = playbackFrameAt(playbackFrames, t)
      let audioTime: number | null = null
      for (const { clip, track } of frame.audios.values()) {
        if (track.muted || clip.muted) continue
        const el = audioRefs.current.get(clip.id)
        if (el && !el.paused && !el.ended && !el.seeking && el.readyState >= 2) {
          const timelineTime =
            clip.startMs + (el.currentTime * 1000 - clip.trimStartMs)
          if (timelineTime > t) {
            audioTime = timelineTime
            break
          }
        }
      }

      let videoTime: number | null = null
      let bestVideoZ = -Infinity
      for (const [url, entry] of frame.videos) {
        const el = videoRefs.current.get(url)
        if (
          el &&
          !el.paused &&
          !el.ended &&
          !el.seeking &&
          el.readyState >= 2 &&
          entry.zIndex > bestVideoZ
        ) {
          const timelineTime =
            entry.clip.startMs + (el.currentTime * 1000 - entry.clip.trimStartMs)
          if (timelineTime > t) {
            bestVideoZ = entry.zIndex
            videoTime = timelineTime
          }
        }
      }
      return audioTime ?? videoTime
    })
    return () => clock.setTimeSource(null)
  }, [clock, playbackFrames])

  // The single per-frame loop, driven by the clock (ticks while playing, and
  // fires once per seek). All DOM updates here are imperative — no React render.
  React.useEffect(() => {
    let previousFrame: PlaybackFrame | null = null
    const activeWords = new Map<string, number>()
    // Reset imperative state once when the index changes. Per-frame work below
    // then touches only active entries and clips crossing a boundary.
    for (const el of videoRefs.current.values()) {
      if (el.style.opacity !== "0") el.style.opacity = "0"
      if (!el.paused) el.pause()
    }
    for (const el of audioRefs.current.values()) {
      if (!el.paused) el.pause()
    }
    for (const el of imageRefs.current.values()) el.style.visibility = "hidden"
    for (const el of textRefs.current.values()) el.style.visibility = "hidden"
    for (const el of wordRefs.current.values()) {
      el.style.opacity = String(KARAOKE_DIM)
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
        for (const entry of frame.preparedVideos.values()) {
          const url = entry.clip.url
          if (!url || frame.videos.has(url)) continue
          const el = videoRefs.current.get(url)
          const nextInPointS = entry.clip.trimStartMs / 1000
          if (el && Math.abs(el.currentTime - nextInPointS) > 0.1) {
            el.currentTime = nextInPointS
          }
        }
        previousFrame = frame
      }

      for (const [url, entry] of frame.videos) {
        const el = videoRefs.current.get(url)
        if (!el) continue
        if (el.style.opacity !== "1") el.style.opacity = "1"
        const zIndex = String(entry.zIndex)
        if (el.style.zIndex !== zIndex) el.style.zIndex = zIndex
        const muted = entry.track.muted || !!entry.clip.muted
        if (el.muted !== muted) el.muted = muted
        const volume = entry.track.duck
          ? sampleEnvelope(duckEnvelope, timeMs)
          : 1
        if (el.volume !== volume) el.volume = volume
        const targetS =
          (entry.clip.trimStartMs + (timeMs - entry.clip.startMs)) / 1000
        if (playing) {
          if (Math.abs(el.currentTime - targetS) > PLAYING_DRIFT_S) {
            el.currentTime = targetS
          }
          if (el.paused) void el.play().catch(() => undefined)
        } else {
          if (!el.paused) el.pause()
          if (Math.abs(el.currentTime - targetS) > PAUSED_DRIFT_S) {
            el.currentTime = targetS
          }
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
        if (playing) {
          if (Math.abs(el.currentTime - targetS) > PLAYING_DRIFT_S) {
            el.currentTime = targetS
          }
          if (el.paused) void el.play().catch(() => undefined)
        } else {
          if (!el.paused) el.pause()
          if (Math.abs(el.currentTime - targetS) > PAUSED_DRIFT_S) {
            el.currentTime = targetS
          }
        }
      }

      // Karaoke: binary-search the active word and update only the two spans
      // whose state changes, rather than rewriting every word every frame.
      for (const { clip } of frame.texts.values()) {
        if (!clip.words?.length) continue
        const active = activeWordIndex(clip.words, timeMs - clip.startMs)
        const previous = activeWords.get(clip.id)
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
  }, [clock, playbackFrames, duckEnvelope])

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
    const rect = stage.getBoundingClientRect()
    const nx = clamp01((e.clientX - rect.left + drag.offsetX) / rect.width)
    const ny = clamp01((e.clientY - rect.top + drag.offsetY) / rect.height)
    const el = textRefs.current.get(drag.clipId)
    if (el) {
      // Imperative during the drag — avoids re-rendering the whole preview
      // (and reloading <video> elements) on every pointer move.
      el.style.left = `${nx * 100}%`
      el.style.top = `${ny * 100}%`
    }
  }

  function handleTextUp(e: React.PointerEvent) {
    const drag = textDragRef.current
    textDragRef.current = null
    const stage = stageRef.current
    if (!drag) return
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    if (!drag.moved || !stage) return
    // Commit the final position once, as a single undo step.
    const rect = stage.getBoundingClientRect()
    const nx = clamp01((e.clientX - rect.left + drag.offsetX) / rect.width)
    const ny = clamp01((e.clientY - rect.top + drag.offsetY) / rect.height)
    dispatch({ type: "UPDATE_CLIP", clipId: drag.clipId, patch: { x: nx, y: ny } })
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
              ? words.map((word, i) => (
                  // Karaoke: each word is a span the sync loop dims/lights;
                  // initial opacity matches the (paused) playhead.
                  <span
                    key={i}
                    ref={registerRef(wordRefs, `${clip.id}:${i}`)}
                    style={{ opacity: i === active ? 1 : KARAOKE_DIM }}
                  >
                    {word.text}
                    {i < words.length - 1 ? " " : ""}
                  </span>
                ))
              : clip.text}
          </div>
          )
        })}

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
