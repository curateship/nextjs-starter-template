import * as React from "react"
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react"

import { EditorPreview } from "@/pages/video-editor/editor-preview"
import {
  useEditorDurationMs,
  useEditorRuntime,
  useEditorSelector,
  type EditorTrack,
} from "@/pages/video-editor/editor-store"
import {
  usePlaybackPlaying,
  type PlaybackClock,
} from "@/pages/video-editor/playback-clock"
import { formatClock } from "@/pages/video-editor/timeline-utils"

const FRAME_MS = 1000 / 30
const RATES = [1, 1.5, 2, 0.5]

// Center stage: the composed preview with a scene chip, a big play button when
// paused, and the floating transport pill. Time-driven bits subscribe to the
// clock individually so only they re-render per frame.
export function StudioStage() {
  const tracks = useEditorSelector((state) => state.tracks)
  const { clock } = useEditorRuntime()
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
      <SceneChip tracks={tracks} clock={clock} />

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
  clock: PlaybackClock
}) {
  const scenes = React.useMemo(() => {
    type Scene = { id: string; index: number; z: number; name: string }
    const events = new Map<number, { enter: Scene[]; leave: Scene[] }>()
    tracks.forEach((track, trackIndex) => {
      const z = tracks.length - trackIndex
      track.clips.forEach((clip, index) => {
        if (clip.kind !== "video") return
        const scene = { id: clip.id, index, z, name: clip.name }
        const start = events.get(clip.startMs) ?? { enter: [], leave: [] }
        start.enter.push(scene)
        events.set(clip.startMs, start)
        const endMs = clip.startMs + clip.durationMs
        const end = events.get(endMs) ?? { enter: [], leave: [] }
        end.leave.push(scene)
        events.set(endMs, end)
      })
    })
    if (!events.has(0)) events.set(0, { enter: [], leave: [] })

    const active = new Map<string, Scene>()
    const index: { startMs: number; snapshot: string }[] = []
    for (const startMs of [...events.keys()].sort((a, b) => a - b)) {
      const event = events.get(startMs)!
      for (const scene of event.leave) active.delete(scene.id)
      for (const scene of event.enter) active.set(scene.id, scene)
      let top: Scene | null = null
      for (const scene of active.values()) {
        if (!top || scene.z > top.z) top = scene
      }
      const snapshot = top ? `${top.index} ${top.name}` : ""
      if (index.at(-1)?.snapshot !== snapshot) index.push({ startMs, snapshot })
    }
    return index
  }, [tracks])

  // Binary-search stable boundary snapshots; React bails between scene changes.
  const snapshot = React.useSyncExternalStore(clock.subscribe, () => {
    const timeMs = clock.getTime()
    let low = 0
    let high = scenes.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (scenes[middle].startMs <= timeMs) low = middle + 1
      else high = middle
    }
    return scenes[Math.max(0, low - 1)]?.snapshot ?? ""
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
  clock: PlaybackClock
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
  clock: PlaybackClock
}) {
  const durationMs = useEditorDurationMs()
  const timeRef = React.useRef<HTMLSpanElement>(null)
  React.useEffect(() => {
    let previous = ""
    const paint = () => {
      const next = formatClock(clock.getTime())
      if (next === previous) return
      previous = next
      if (timeRef.current) timeRef.current.textContent = next
    }
    paint()
    return clock.subscribe(paint)
  }, [clock])
  return (
    <span
      style={{
        fontSize: 12.5,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      <span ref={timeRef}>{formatClock(clock.getTime())}</span>
      <span style={{ color: "var(--mut)", fontWeight: 500 }}>
        {" "}
        / {formatClock(durationMs)}
      </span>
    </span>
  )
}
