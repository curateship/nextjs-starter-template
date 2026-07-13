import * as React from "react"
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react"

import { EditorPreview } from "@/pages/video-editor/editor-preview"
import {
  useEditor,
  type EditorTrack,
} from "@/pages/video-editor/editor-store"
import { usePlaybackPlaying } from "@/pages/video-editor/playback-clock"
import { formatClock } from "@/pages/video-editor/timeline-utils"

const FRAME_MS = 1000 / 30
const RATES = [1, 1.5, 2, 0.5]

// The topmost active video clip at `timeMs` (track 0 renders on top), used for
// the "SCENE" chip. Returns null in gaps / before the first video.
function activeVideoAt(
  tracks: EditorTrack[],
  timeMs: number
): { index: number; z: number; name: string } | null {
  let best: { index: number; z: number; name: string } | null = null
  tracks.forEach((track, trackIndex) => {
    const z = tracks.length - trackIndex
    track.clips.forEach((clip, clipIndex) => {
      if (clip.kind !== "video") return
      if (timeMs < clip.startMs || timeMs >= clip.startMs + clip.durationMs) {
        return
      }
      if (!best || z > best.z) {
        best = { index: clipIndex, z, name: clip.name }
      }
    })
  })
  return best
}

// Center stage: the composed preview with a scene chip, a big play button when
// paused, and the floating transport pill. Time-driven bits subscribe to the
// clock individually so only they re-render per frame.
export function StudioStage() {
  const { state, clock } = useEditor()
  const playing = usePlaybackPlaying(clock)

  return (
    <main
      data-screen-label="Preview stage"
      style={{
        position: "relative",
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        background:
          "radial-gradient(130% 110% at 50% -5%,var(--panel),var(--paper) 70%)",
      }}
    >
      <SceneChip tracks={state.tracks} clock={clock} />

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {/* EditorPreview self-measures its container to fit the frame at the
            project aspect; keep it filling this padded box directly (any
            intermediate shrink-to-fit wrapper breaks that measurement). */}
        <div
          className="studio-stage-preview"
          style={{ position: "absolute", top: 18, right: 26, bottom: 8, left: 26 }}
        >
          <EditorPreview />
          {!playing ? (
            <button
              type="button"
              onClick={() => clock.play()}
              aria-label="Play"
              style={{
                position: "absolute",
                inset: 0,
                margin: "auto",
                height: 60,
                width: 60,
                borderRadius: "50%",
                background: "rgba(255,255,255,.16)",
                backdropFilter: "blur(7px)",
                border: "1px solid rgba(255,255,255,.4)",
                color: "#fff",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                zIndex: 6,
              }}
            >
              <Play size={20} fill="currentColor" />
            </button>
          ) : null}
        </div>
      </div>

      <TransportBar clock={clock} playing={playing} />
    </main>
  )
}

function SceneChip({
  tracks,
  clock,
}: {
  tracks: EditorTrack[]
  clock: ReturnType<typeof useEditor>["clock"]
}) {
  // Re-derive only when the active scene actually changes (stable snapshot
  // string → React bails between frames within the same clip).
  const snapshot = React.useSyncExternalStore(clock.subscribe, () => {
    const active = activeVideoAt(tracks, clock.getTime())
    return active ? `${active.index} ${active.name}` : ""
  })
  if (!snapshot) return null
  const [indexStr, name] = snapshot.split(" ")
  const sceneIndex = String(Number(indexStr) + 1).padStart(2, "0")
  const sceneName = name.replace(/^.*—\s*/, "").replace(/"/g, "")

  return (
    <div
      style={{
        position: "absolute",
        left: 20,
        top: 16,
        zIndex: 5,
        display: "flex",
        alignItems: "center",
        gap: 9,
      }}
    >
      <span
        style={{
          fontFamily: "'Bebas Neue'",
          fontSize: 15,
          letterSpacing: ".04em",
          color: "var(--mut)",
        }}
      >
        SCENE {sceneIndex}
      </span>
      <span
        style={{
          height: 4,
          width: 4,
          borderRadius: "50%",
          background: "var(--line2)",
        }}
      />
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink2)" }}>
        {sceneName}
      </span>
    </div>
  )
}

const transportBtn: React.CSSProperties = {
  height: 34,
  width: 34,
  display: "grid",
  placeItems: "center",
  background: "transparent",
  border: "none",
  borderRadius: 10,
  color: "var(--ink2)",
  cursor: "pointer",
}

function TransportBar({
  clock,
  playing,
}: {
  clock: ReturnType<typeof useEditor>["clock"]
  playing: boolean
}) {
  const [rate, setRate] = React.useState(1)

  function cycleRate() {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length]
    setRate(next)
    clock.setRate(next)
  }

  return (
    <div
      style={{
        alignSelf: "center",
        width: "fit-content",
        maxWidth: "calc(100% - 20px)",
        flex: "none",
        marginBottom: 16,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        gap: 3,
        padding: "6px 9px",
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 15,
        boxShadow: "var(--sh)",
      }}
    >
      <button
        type="button"
        className="st-hovbg"
        style={transportBtn}
        title="Previous frame"
        onClick={() => clock.seek(clock.getTime() - FRAME_MS)}
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        className="st-hovbright"
        onClick={() => clock.toggle()}
        style={{
          height: 38,
          width: 38,
          display: "grid",
          placeItems: "center",
          background: "var(--ink)",
          color: "var(--paper)",
          border: "none",
          borderRadius: "50%",
          cursor: "pointer",
          margin: "0 2px",
        }}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <Pause size={15} fill="currentColor" />
        ) : (
          <Play size={15} fill="currentColor" />
        )}
      </button>
      <button
        type="button"
        className="st-hovbg"
        style={transportBtn}
        title="Next frame"
        onClick={() => clock.seek(clock.getTime() + FRAME_MS)}
      >
        <ChevronRight size={16} />
      </button>
      <div
        style={{
          width: 1,
          height: 20,
          background: "var(--line)",
          margin: "0 5px",
        }}
      />
      <Timecode clock={clock} />
      <button
        type="button"
        className="st-hovbg"
        onClick={cycleRate}
        style={{
          height: 32,
          padding: "0 8px",
          background: "transparent",
          border: "none",
          borderRadius: 8,
          color: "var(--ink2)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontVariantNumeric: "tabular-nums",
          marginLeft: 2,
        }}
        title="Playback speed"
      >
        {rate}×
      </button>
    </div>
  )
}

function Timecode({
  clock,
}: {
  clock: ReturnType<typeof useEditor>["clock"]
}) {
  const { durationMs } = useEditor()
  const timeMs = React.useSyncExternalStore(clock.subscribe, () =>
    clock.getTime()
  )
  return (
    <span
      style={{
        fontSize: 12.5,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {formatClock(timeMs)}
      <span style={{ color: "var(--mut)", fontWeight: 500 }}>
        {" "}
        / {formatClock(durationMs)}
      </span>
    </span>
  )
}
