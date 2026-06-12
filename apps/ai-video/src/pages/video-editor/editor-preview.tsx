import * as React from "react"
import { PlayIcon } from "lucide-react"

import {
  useEditor,
  type EditorClip,
  type EditorTrack,
} from "@/pages/video-editor/editor-store"
import {
  usePlaybackPlaying,
  usePlaybackTime,
} from "@/pages/video-editor/playback-clock"
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

// Registers/unregisters a clip's media element in the shared map. The ref
// object is dereferenced inside the callback (commit time), never in render.
function registerMediaRef(
  refs: { current: Map<string, HTMLMediaElement> },
  clipId: string
) {
  return (el: HTMLMediaElement | null) => {
    if (el) {
      refs.current.set(clipId, el)
    } else {
      refs.current.delete(clipId)
    }
  }
}

// Renders the composed timeline at the clock's current time. Every media
// clip keeps a persistent <video>/<audio> element (so scrubbing seeks are
// instant); a sync pass after each render plays/pauses/seeks them to match
// the clock. Text clips render as scaled overlays. Upper tracks stack on top.
export function EditorPreview() {
  const { state, clock } = useEditor()
  const timeMs = usePlaybackTime(clock)
  const playing = usePlaybackPlaying(clock)

  const containerRef = React.useRef<HTMLDivElement>(null)
  const mediaRefs = React.useRef(new Map<string, HTMLMediaElement>())
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

  // Memoized: this component re-renders per clock tick during playback, but
  // the clip lists only change on edits.
  const { media, images, texts } = React.useMemo(
    () => flattenTracks(state.tracks),
    [state.tracks]
  )

  // Sync every media element to the clock after each render/tick.
  React.useEffect(() => {
    for (const { clip, track } of media) {
      const el = mediaRefs.current.get(clip.id)
      if (!el) continue

      const active = isActive(clip, timeMs)
      const targetS = (clip.trimStartMs + (timeMs - clip.startMs)) / 1000
      el.muted = track.muted

      if (active) {
        const drift = Math.abs(el.currentTime - targetS)
        if (playing) {
          if (drift > PLAYING_DRIFT_S) el.currentTime = targetS
          if (el.paused) void el.play().catch(() => undefined)
        } else {
          if (!el.paused) el.pause()
          if (drift > PAUSED_DRIFT_S) el.currentTime = targetS
        }
      } else {
        if (!el.paused) el.pause()
        // Pre-seek upcoming clips to their in-point for a clean start.
        const inPointS = clip.trimStartMs / 1000
        if (
          timeMs < clip.startMs &&
          Math.abs(el.currentTime - inPointS) > 0.1
        ) {
          el.currentTime = inPointS
        }
      }
    }
  })

  const hasClips = media.length > 0 || images.length > 0 || texts.length > 0
  const textScale = stageHeight > 0 ? stageHeight / DESIGN_HEIGHT : 0

  return (
    <div
      ref={containerRef}
      className="grid h-full w-full place-items-center"
    >
      <div
        className="relative overflow-hidden rounded-md bg-black"
        style={{ width: stageWidth, height: stageHeight }}
      >
      {/* Persistent media elements; only the active ones are visible */}
      {media.map(({ clip, zIndex }) =>
        clip.kind === "video" ? (
          <video
            key={clip.id}
            ref={registerMediaRef(mediaRefs, clip.id)}
            src={clip.url}
            preload="auto"
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
            style={{
              zIndex,
              visibility: isActive(clip, timeMs) ? "visible" : "hidden",
            }}
          />
        ) : (
          <audio
            key={clip.id}
            ref={registerMediaRef(mediaRefs, clip.id)}
            src={clip.url}
            preload="auto"
          />
        )
      )}

      {/* Image clips: static, just toggled by the playhead window */}
      {images.map(({ clip, zIndex }) => (
        <img
          key={clip.id}
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

      {/* Active text overlays, scaled from the 1080p design space */}
      {texts
        .filter(({ clip }) => isActive(clip, timeMs))
        .map(({ clip, zIndex }) => (
          <div
            key={clip.id}
            className="pointer-events-none absolute inset-0 grid place-items-center p-[5%]"
            style={{ zIndex }}
          >
            <span
              className="text-center font-semibold whitespace-pre-wrap"
              style={{
                color: clip.color ?? "#ffffff",
                fontSize: (clip.fontSize ?? 80) * textScale,
                lineHeight: 1.15,
                textShadow: "0 2px 12px rgba(0,0,0,0.45)",
              }}
            >
              {clip.text}
            </span>
          </div>
        ))}

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

function isActive(clip: EditorClip, timeMs: number) {
  return timeMs >= clip.startMs && timeMs < clip.startMs + clip.durationMs
}
