import * as React from "react"
import { PlayIcon } from "lucide-react"

import {
  useEditor,
  type EditorClip,
  type EditorTrack,
} from "@/pages/video-editor/editor-store"
import { DESIGN_HEIGHT } from "@/pages/video-editor/timeline-utils"

// How far media elements may drift from the clock before being re-seeked.
const PLAYING_DRIFT_S = 0.25
const PAUSED_DRIFT_S = 0.04

// Clock-synced video/audio elements need their track (mute state)...
type MediaEntry = { clip: EditorClip; track: EditorTrack; zIndex: number }
// ...while images/text are static visuals that only need stacking order.
type VisualEntry = { clip: EditorClip; zIndex: number }

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
        media.push({ clip, track, zIndex })
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
  let active = 0
  for (let i = 0; i < words.length; i++) {
    if (words[i].startMs <= relativeMs) active = i
    else break
  }
  return active
}

// Topmost active video clip per source URL at the given time. Clips of the same
// source share one <video>, so this picks which clip each shared element shows.
function activeVideoBySource(media: MediaEntry[], timeMs: number) {
  const map = new Map<string, MediaEntry>()
  for (const entry of media) {
    if (entry.clip.kind !== "video" || !entry.clip.url) continue
    if (!isActive(entry.clip, timeMs)) continue
    const current = map.get(entry.clip.url)
    if (!current || entry.zIndex > current.zIndex) map.set(entry.clip.url, entry)
  }
  return map
}

// In-point (seconds) of the next clip of `url` starting after `timeMs` — used to
// pre-seek a source's element when none of its clips is currently on screen.
function nextInPointForSource(
  media: MediaEntry[],
  url: string,
  timeMs: number
): number | null {
  let bestStart = Infinity
  let inPoint: number | null = null
  for (const { clip } of media) {
    if (clip.kind !== "video" || clip.url !== url) continue
    if (clip.startMs > timeMs && clip.startMs < bestStart) {
      bestStart = clip.startMs
      inPoint = clip.trimStartMs / 1000
    }
  }
  return inPoint
}

// Renders the composed timeline. ONE <video> per source URL (clips of the same
// source share it, driven to whichever clip is active) — so contiguous splits
// play straight through with no element handoff. Audio/image/text stay one
// element per clip. The element tree only re-renders on edits; a single
// clock-subscribed loop drives all per-frame work imperatively.
export function EditorPreview() {
  const { state, clock, dispatch } = useEditor()

  const containerRef = React.useRef<HTMLDivElement>(null)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const videoRefs = React.useRef(new Map<string, HTMLVideoElement>())
  const audioRefs = React.useRef(new Map<string, HTMLAudioElement>())
  const imageRefs = React.useRef(new Map<string, HTMLImageElement>())
  const textRefs = React.useRef(new Map<string, HTMLDivElement>())
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
    const [w, h] = state.aspect.split(":").map(Number)
    return w / h
  }, [state.aspect])
  let stageWidth = containerBox.w
  let stageHeight = stageWidth / ratio
  if (stageHeight > containerBox.h) {
    stageHeight = containerBox.h
    stageWidth = stageHeight * ratio
  }

  // The clip lists only change on edits.
  const { media, images, texts } = React.useMemo(
    () => flattenTracks(state.tracks),
    [state.tracks]
  )
  // Unique video source URLs (one <video> each) and the per-clip audio list.
  const videoSources = React.useMemo(() => {
    const seen = new Set<string>()
    const urls: string[] = []
    for (const { clip } of media) {
      if (clip.kind === "video" && clip.url && !seen.has(clip.url)) {
        seen.add(clip.url)
        urls.push(clip.url)
      }
    }
    return urls
  }, [media])
  const audioClips = React.useMemo(
    () => media.filter((m) => m.clip.kind === "audio"),
    [media]
  )

  // Drive the clock from the element carrying the SOUND (an unmuted audio track
  // wins, since captions are timed to it; else the topmost active video). The
  // source is read even while momentarily paused — only seeked/undecodable
  // elements are skipped — so the clock HOLDS at a cut rather than running
  // ahead on wall time and snapping back.
  React.useEffect(() => {
    clock.setTimeSource(() => {
      const t = clock.getTime()
      let audioTime: number | null = null
      for (const { clip, track } of audioClips) {
        if (track.muted || !isActive(clip, t)) continue
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
      for (const [url, entry] of activeVideoBySource(media, t)) {
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
  }, [clock, media, audioClips])

  // The single per-frame loop, driven by the clock (ticks while playing, and
  // fires once per seek). All DOM updates here are imperative — no React render.
  React.useEffect(() => {
    function syncFrame() {
      const timeMs = clock.getTime()
      const playing = clock.playing

      // One <video> per source, driven to its active clip. Contiguous clips of
      // the same source keep the same target position across the cut, so the
      // element plays straight through with no seek.
      const activeVid = activeVideoBySource(media, timeMs)
      for (const url of videoSources) {
        const el = videoRefs.current.get(url)
        if (!el) continue
        const entry = activeVid.get(url)
        if (entry) {
          el.style.opacity = "1"
          el.style.zIndex = String(entry.zIndex)
          el.muted = entry.track.muted
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
        } else {
          el.style.opacity = "0"
          if (!el.paused) el.pause()
          // Pre-seek to the next clip of this source for a clean entry.
          const nextInPointS = nextInPointForSource(media, url, timeMs)
          if (
            nextInPointS != null &&
            Math.abs(el.currentTime - nextInPointS) > 0.1
          ) {
            el.currentTime = nextInPointS
          }
        }
      }

      // Audio: one element per clip, kept in sync with the clock.
      for (const { clip, track } of audioClips) {
        const el = audioRefs.current.get(clip.id)
        if (!el) continue
        el.muted = track.muted
        const targetS = (clip.trimStartMs + (timeMs - clip.startMs)) / 1000
        if (isActive(clip, timeMs)) {
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
        } else if (!el.paused) {
          el.pause()
        }
      }

      // Static visuals just toggle visibility with the playhead window.
      for (const { clip } of images) {
        const el = imageRefs.current.get(clip.id)
        if (el) el.style.visibility = isActive(clip, timeMs) ? "visible" : "hidden"
      }
      for (const { clip } of texts) {
        const el = textRefs.current.get(clip.id)
        if (el) el.style.visibility = isActive(clip, timeMs) ? "visible" : "hidden"
        // Karaoke: light the word the audio has reached, dim the rest.
        if (clip.words?.length) {
          const active = activeWordIndex(clip.words, timeMs - clip.startMs)
          for (let i = 0; i < clip.words.length; i++) {
            const wordEl = wordRefs.current.get(`${clip.id}:${i}`)
            if (wordEl) {
              wordEl.style.opacity = i === active ? "1" : String(KARAOKE_DIM)
            }
          }
        }
      }
    }

    syncFrame()
    return clock.subscribe(syncFrame)
  }, [clock, media, videoSources, audioClips, images, texts])

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
        {/* One <video> per source; the sync loop sets its opacity/z and drives
            it to whichever clip of that source is active. */}
        {videoSources.map((url) => (
          <video
            key={url}
            ref={registerRef(videoRefs, url)}
            src={url}
            preload="auto"
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
            style={{ opacity: 0 }}
          />
        ))}

        {/* Audio: one element per clip (no visual; the soundtrack plays
            continuously). */}
        {audioClips.map(({ clip }) => (
          <audio
            key={clip.id}
            ref={registerRef(audioRefs, clip.id)}
            src={clip.url}
            preload="auto"
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
