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

// Only video clips within this window of the playhead keep a live <video>
// element. Mounting a decoder per clip (the timeline can hold dozens, often of
// the same source) wastes memory; this caps the live decoders to the few
// around the playhead. The lookahead gives the next clip time to load (media
// streams from remote storage) before it plays.
const MOUNT_LOOKAHEAD_MS = 2500
const MOUNT_LOOKBEHIND_MS = 500

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

// Registers/unregisters a clip's element in a shared map. The ref object is
// dereferenced inside the callback (commit time), never in render.
function registerRef<T extends HTMLElement>(
  refs: { current: Map<string, T> },
  clipId: string
) {
  return (el: T | null) => {
    if (el) refs.current.set(clipId, el)
    else refs.current.delete(clipId)
  }
}

// A video clip needs a live <video> only while it's near the playhead — active
// now, about to start, or just ended.
function shouldMountVideo(clip: EditorClip, timeMs: number) {
  return (
    timeMs >= clip.startMs - MOUNT_LOOKAHEAD_MS &&
    timeMs < clip.startMs + clip.durationMs + MOUNT_LOOKBEHIND_MS
  )
}

function isActive(clip: EditorClip, timeMs: number) {
  return timeMs >= clip.startMs && timeMs < clip.startMs + clip.durationMs
}

// Renders the composed timeline. The element tree is built from the clip lists
// and only re-rendered on edits (or when the set of near-playhead videos
// changes) — NOT every clock tick. A single clock-subscribed loop drives all
// per-frame work imperatively: it plays/pauses/seeks the media elements and
// toggles each clip's visibility. Re-rendering the whole tree per frame is what
// dropped playback well below the display rate.
export function EditorPreview() {
  const { state, clock } = useEditor()

  const containerRef = React.useRef<HTMLDivElement>(null)
  const mediaRefs = React.useRef(new Map<string, HTMLMediaElement>())
  const imageRefs = React.useRef(new Map<string, HTMLImageElement>())
  const textRefs = React.useRef(new Map<string, HTMLDivElement>())
  const [containerBox, setContainerBox] = React.useState({ w: 0, h: 0 })
  // Which video clips currently have a live element. Updated by the sync loop,
  // but only when the set actually changes (at clip boundaries) so playback
  // doesn't re-render every frame.
  const [mountedVideoIds, setMountedVideoIds] = React.useState<Set<string>>(
    () => new Set()
  )

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

  // Drive the clock from the element that carries the SOUND, so playback (and
  // therefore the caption text, which is timed to that audio) follows the
  // actual heard audio rather than seeking it to a wall clock. Preference:
  // an unmuted audio track (a reel's soundtrack) wins, since captions are
  // transcribed from it; otherwise the topmost video (its own audio, or just
  // its frames when silent). The chosen element is never seeked to catch up —
  // seeking the sound/video mid-play is what desynced and stuttered playback.
  React.useEffect(() => {
    clock.setTimeSource(() => {
      const t = clock.getTime()
      // An element is a usable clock only while it's smoothly playing.
      const timelineTimeIfPlaying = (clip: EditorClip) => {
        const el = mediaRefs.current.get(clip.id)
        if (!el || el.paused || el.seeking || el.readyState < 2) return null
        return clip.startMs + (el.currentTime * 1000 - clip.trimStartMs)
      }

      let audioTime: number | null = null
      let videoTime: number | null = null
      let bestVideoZ = -Infinity
      for (const { clip, track, zIndex } of media) {
        if (!isActive(clip, t)) continue
        if (clip.kind === "audio") {
          // Only an audible (unmuted) audio track is the sound source.
          if (!track.muted && audioTime == null) audioTime = timelineTimeIfPlaying(clip)
        } else if (clip.kind === "video" && zIndex > bestVideoZ) {
          const time = timelineTimeIfPlaying(clip)
          if (time != null) {
            bestVideoZ = zIndex
            videoTime = time
          }
        }
      }
      return audioTime ?? videoTime
    })
    return () => clock.setTimeSource(null)
  }, [clock, media])

  // The single per-frame loop, driven by the clock (ticks while playing, and
  // fires once per seek). All DOM updates here are imperative — no React render.
  React.useEffect(() => {
    let lastMountKey = ""

    function syncFrame() {
      const timeMs = clock.getTime()
      const playing = clock.playing

      // Mount only the videos near the playhead; re-render solely when that
      // set changes (compared as a stable key).
      const mountIds: string[] = []
      for (const { clip } of media) {
        if (clip.kind !== "video" || shouldMountVideo(clip, timeMs)) {
          mountIds.push(clip.id)
        }
      }
      const mountKey = mountIds.join(",")
      if (mountKey !== lastMountKey) {
        lastMountKey = mountKey
        setMountedVideoIds(new Set(mountIds))
      }

      // Sync each live media element to the clock and toggle video visibility.
      for (const { clip, track } of media) {
        const el = mediaRefs.current.get(clip.id)
        if (!el) continue

        const active = isActive(clip, timeMs)
        if (clip.kind === "video") {
          el.style.visibility = active ? "visible" : "hidden"
        }
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
          if (timeMs < clip.startMs && Math.abs(el.currentTime - inPointS) > 0.1) {
            el.currentTime = inPointS
          }
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
      }
    }

    syncFrame()
    return clock.subscribe(syncFrame)
  }, [clock, media, images, texts])

  const hasClips = media.length > 0 || images.length > 0 || texts.length > 0
  const textScale = stageHeight > 0 ? stageHeight / DESIGN_HEIGHT : 0
  // Current time for the initial visibility of freshly rendered elements; the
  // sync loop keeps them correct afterwards.
  const now = clock.getTime()

  return (
    <div ref={containerRef} className="grid h-full w-full place-items-center">
      <div
        className="relative overflow-hidden rounded-md bg-black"
        style={{ width: stageWidth, height: stageHeight }}
      >
        {/* Media elements. Videos mount only near the playhead (one decoder per
            clip otherwise wastes memory); audio stays mounted so the soundtrack
            plays continuously. */}
        {media.map(({ clip, zIndex }) => {
          if (clip.kind === "video") {
            if (!mountedVideoIds.has(clip.id)) return null
            return (
              <video
                key={clip.id}
                ref={registerRef(mediaRefs, clip.id)}
                src={clip.url}
                preload="auto"
                playsInline
                className="absolute inset-0 h-full w-full object-contain"
                style={{
                  zIndex,
                  visibility: isActive(clip, now) ? "visible" : "hidden",
                }}
              />
            )
          }
          return (
            <audio
              key={clip.id}
              ref={registerRef(mediaRefs, clip.id)}
              src={clip.url}
              preload="auto"
            />
          )
        })}

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

        {/* Text overlays, scaled from the 1080p design space; shown/hidden by
            the sync loop rather than mounted per frame. */}
        {texts.map(({ clip, zIndex }) => (
          <div
            key={clip.id}
            ref={registerRef(textRefs, clip.id)}
            className="pointer-events-none absolute inset-0 grid place-items-center p-[5%]"
            style={{
              zIndex,
              visibility: isActive(clip, now) ? "visible" : "hidden",
            }}
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
