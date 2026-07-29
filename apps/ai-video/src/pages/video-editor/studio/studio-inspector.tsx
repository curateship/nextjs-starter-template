import * as React from "react"
import { Pause, Play, Replace, Film, Trash2 } from "lucide-react"

import { requireTextFont, type TextFontId } from "@/lib/text-fonts"
import {
  CAPTION_ANIMATIONS,
  resolveCaptionAnimation,
} from "@/lib/caption-animations"
import {
  clampTransitionMs,
  DEFAULT_TRANSITION_MS,
  isTransitionableKind,
  MAX_TRANSITION_MS,
  MIN_TRANSITION_MS,
  precedingClipOnTrack,
  TRANSITION_ADJACENCY_EPS_MS,
  TRANSITION_OPTIONS,
  type TransitionKind,
} from "@/lib/clip-transitions"
import {
  findClip,
  useEditorDurationMs,
  useEditorRuntime,
  useEditorSelector,
  type AspectRatio,
  type EditorClip,
} from "@/pages/video-editor/editor-store"
import { formatClock } from "@/pages/video-editor/timeline-utils"
import {
  ReplaceMediaDialog,
  type ReplacementMedia,
} from "@/pages/video-editor/replace-media-dialog"
import { useAudioPreview } from "@/pages/video-editor/use-audio-preview"

const RESOLUTION: Record<AspectRatio, string> = {
  "9:16": "1080 × 1920",
  "16:9": "1920 × 1080",
  "1:1": "1080 × 1080",
  "4:3": "1440 × 1080",
}

const card: React.CSSProperties = {
  background: "var(--panel2)",
  border: "1px solid var(--line)",
  borderRadius: 11,
}

export function StudioInspector() {
  const clip = useEditorSelector((state) =>
    state.selectedClipId
      ? (findClip(state.tracks, state.selectedClipId)?.clip ?? null)
      : null
  )
  const { mode } = useEditorRuntime()
  const isTemplateMode = mode !== "regular"

  const title = !clip
    ? "Inspector"
    : isTemplateMode
      ? "Slot"
      : clip.kind === "text"
        ? "Text"
        : clip.kind === "audio"
          ? "Audio"
          : "Clip"
  const badge =
    clip?.kind === "text"
      ? "TEXT"
      : clip?.kind === "audio"
        ? "AUDIO"
        : clip?.kind === "image"
          ? "IMAGE"
          : clip
            ? "VIDEO"
            : ""

  return (
    <aside
      data-screen-label="Inspector"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--panel)",
        borderLeft: "1px solid var(--line)",
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 16px 12px",
          borderBottom: "1px solid var(--line)",
          flex: "none",
        }}
      >
        <div
          style={{
            fontFamily: "'Bebas Neue'",
            fontSize: 22,
            letterSpacing: ".02em",
            lineHeight: 1,
          }}
        >
          {title}
        </div>
        {clip ? (
          <span
            style={{
              padding: "3px 9px",
              borderRadius: 7,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".05em",
              background: "var(--acc-soft)",
              color: "var(--acc2)",
            }}
          >
            {badge}
          </span>
        ) : null}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
        {clip && isTemplateMode ? <SlotSection clip={clip} /> : null}
        {!clip ? (
          <ProjectProps />
        ) : clip.kind === "text" ? (
          <TextInspector clip={clip} />
        ) : (
          <MediaInspector clip={clip} />
        )}
      </div>
    </aside>
  )
}

// Template-only controls: define/replace this clip as a template slot.
function SlotSection({ clip }: { clip: EditorClip }) {
  const { mode, dispatch } = useEditorRuntime()
  const { previewingId, togglePreview, stopPreview } = useAudioPreview()
  const isBuilder = mode === "template-builder"

  function patch(p: Partial<EditorClip>) {
    dispatch({ type: "UPDATE_CLIP", clipId: clip.id, patch: p, transient: true })
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <Label>Slot</Label>
      <div style={{ ...card, padding: "11px 12px", marginBottom: 9 }}>
        <div style={{ fontSize: 10, color: "var(--mut)", marginBottom: 5 }}>Label</div>
        <input
          value={clip.segmentLabel ?? clip.name}
          onChange={(e) =>
            patch({ segmentLabel: e.target.value, name: e.target.value || clip.name })
          }
          style={slotInput}
        />
      </div>

      {isBuilder ? (
        <div
          style={{
            ...card,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 13px",
            marginBottom: 9,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 12.5 }}>Replaceable</div>
            <div style={{ fontSize: 10.5, color: "var(--mut)", marginTop: 1 }}>
              Show this clip as a template slot
            </div>
          </div>
          <Toggle
            on={!!clip.replaceable}
            onToggle={() => patch({ replaceable: !clip.replaceable })}
          />
        </div>
      ) : null}

      {isBuilder ? (
        <div style={{ ...card, padding: "11px 12px", marginBottom: 9 }}>
          <div style={{ fontSize: 10, color: "var(--mut)", marginBottom: 5 }}>
            Duration (seconds)
          </div>
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={Math.round(clip.durationMs / 100) / 10}
            onChange={(e) => {
              const seconds = Number(e.target.value)
              if (Number.isFinite(seconds) && seconds > 0) {
                patch({ durationMs: seconds * 1000 })
              }
            }}
            style={slotInput}
          />
        </div>
      ) : null}

      {clip.soundEffectId && clip.url ? (
        <button
          type="button"
          className="st-hovbg"
          onClick={() => togglePreview(clip.id, clip.url!)}
          style={{ ...slotBtn, marginBottom: 9 }}
        >
          {previewingId === clip.id ? <Pause size={14} /> : <Play size={14} />}
          {previewingId === clip.id ? "Stop" : "Preview"} sound
        </button>
      ) : null}

      {clip.soundEffectId ? (
        <button
          type="button"
          onClick={() => {
            stopPreview()
            dispatch({ type: "DELETE_CLIP", clipId: clip.id })
          }}
          style={{
            ...slotBtn,
            color: "var(--coral)",
            borderColor: "color-mix(in oklch, var(--coral), transparent 60%)",
          }}
        >
          <Trash2 size={14} />
          Remove sound effect
        </button>
      ) : null}
    </div>
  )
}

const slotInput: React.CSSProperties = {
  width: "100%",
  height: 32,
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: 9,
  padding: "0 10px",
  color: "var(--ink)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
}

const slotBtn: React.CSSProperties = {
  width: "100%",
  height: 34,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  background: "var(--panel2)",
  border: "1px solid var(--line2)",
  borderRadius: 10,
  color: "var(--ink)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="st-lbl" style={{ marginBottom: 10, ...style }}>
      {children}
    </div>
  )
}

function ProjectProps() {
  const aspect = useEditorSelector((state) => state.aspect)
  const durationMs = useEditorDurationMs()
  const rows: [string, string][] = [
    ["Aspect", aspect],
    ["Resolution", RESOLUTION[aspect]],
    ["Frame rate", "30 fps"],
    ["Duration", formatClock(durationMs)],
  ]
  return (
    <div>
      <div style={{ textAlign: "center", padding: "18px 8px 22px", color: "var(--mut)" }}>
        <div style={{ display: "grid", placeItems: "center", marginBottom: 10, color: "var(--line2)" }}>
          <Film size={28} />
        </div>
        <div style={{ fontSize: 12, color: "var(--ink2)", lineHeight: 1.5 }}>
          Select a clip on the timeline
          <br />
          to edit it.
        </div>
      </div>
      <Label>Project</Label>
      <div style={{ display: "grid", gap: 9 }}>
        {rows.map(([k, v]) => (
          <div
            key={k}
            style={{
              ...card,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 13px",
            }}
          >
            <span style={{ color: "var(--ink2)" }}>{k}</span>
            <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const FONT_CHOICES: { id: TextFontId; label: string }[] = [
  { id: "anton", label: "Anton" },
  { id: "bebas-neue", label: "Bebas" },
  { id: "inter", label: "Inter" },
  { id: "playfair-display", label: "Playfair" },
]
const SWATCHES = ["#ffffff", "#ffe27a", "#1c1c1c", "var(--acc)", "#ff5a5a", "#5ad18a"]

function TextInspector({ clip }: { clip: EditorClip }) {
  const { dispatch } = useEditorRuntime()
  const font = requireTextFont(clip.fontId ?? "inter")
  const size = clip.fontSize ?? 78
  const value = clip.text ?? clip.words?.map((w) => w.text).join(" ") ?? ""

  function patch(p: Partial<EditorClip>) {
    dispatch({ type: "UPDATE_CLIP", clipId: clip.id, patch: p, transient: true })
  }
  function onText(next: string) {
    if (clip.words?.length) {
      const parts = next.split(/\s+/).filter(Boolean)
      const step = clip.durationMs / Math.max(1, parts.length)
      patch({
        words: parts.map((text, i) => ({
          text,
          startMs: Math.round(i * step),
          endMs: Math.round((i + 1) * step),
        })),
      })
    } else {
      patch({ text: next })
    }
  }

  const boxed = !!clip.highlightColor

  return (
    <div>
      <Label style={{ marginBottom: 9 }}>Content</Label>
      <textarea
        value={value}
        onChange={(e) => onText(e.target.value)}
        style={{
          width: "100%",
          minHeight: 66,
          resize: "vertical",
          background: "var(--panel2)",
          border: "1px solid var(--line)",
          borderRadius: 11,
          padding: 11,
          color: "var(--ink)",
          fontSize: 13.5,
          fontFamily: "inherit",
          lineHeight: 1.45,
          marginBottom: 18,
        }}
      />

      <Label style={{ marginBottom: 9 }}>Font</Label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
        {FONT_CHOICES.map((f) => {
          const on = font.id === f.id
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => patch({ fontId: f.id })}
              style={{
                padding: 10,
                borderRadius: 10,
                fontSize: 12,
                cursor: "pointer",
                border: `1px solid ${on ? "var(--acc)" : "var(--line)"}`,
                background: on ? "var(--acc-soft)" : "var(--panel2)",
                color: "var(--ink)",
                fontFamily: requireTextFont(f.id).family,
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
        <span className="st-lbl">Size</span>
        <span style={{ fontSize: 11.5, color: "var(--ink2)", fontVariantNumeric: "tabular-nums" }}>
          {size}px
        </span>
      </div>
      <input
        type="range"
        min={40}
        max={140}
        step={1}
        value={size}
        onChange={(e) => patch({ fontSize: Number(e.target.value) })}
        style={{ width: "100%", background: fillTrack(size, 40, 140) }}
      />

      <Label style={{ margin: "18px 0 9px" }}>Color</Label>
      <div style={{ display: "flex", gap: 9, marginBottom: 18 }}>
        {SWATCHES.map((c) => {
          const on = clip.color === c
          return (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              onClick={() => patch({ color: c })}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                cursor: "pointer",
                background: c,
                border: `2px solid ${on ? "var(--acc2)" : "var(--line2)"}`,
                boxShadow: on ? "0 0 0 2px var(--acc-soft)" : "none",
              }}
            />
          )
        })}
      </div>

      <div
        style={{
          ...card,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 13px",
          marginBottom: 18,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 12.5 }}>Highlight box</div>
          <div style={{ fontSize: 10.5, color: "var(--mut)", marginTop: 1 }}>
            Draw a colour block behind the text
          </div>
        </div>
        <Toggle
          on={boxed}
          onToggle={() => patch({ highlightColor: boxed ? undefined : "#ffffff" })}
        />
      </div>

      {/* Word-level entrance animation — only meaningful for karaoke captions
          (clips with per-word timings). */}
      {clip.words?.length ? (
        <>
          <Label style={{ margin: "0 0 9px" }}>Animation</Label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginBottom: 18,
            }}
          >
            {CAPTION_ANIMATIONS.map((option) => {
              const on = resolveCaptionAnimation(clip.animation) === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  title={option.description}
                  onClick={() => patch({ animation: option.id })}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    fontSize: 12,
                    cursor: "pointer",
                    border: `1px solid ${on ? "var(--acc)" : "var(--line)"}`,
                    background: on ? "var(--acc-soft)" : "var(--panel2)",
                    color: "var(--ink)",
                  }}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </>
      ) : null}

      <Timing clip={clip} />
    </div>
  )
}

function MediaInspector({ clip }: { clip: EditorClip }) {
  const track = useEditorSelector(
    (state) => findClip(state.tracks, clip.id)?.track
  )
  const { dispatch } = useEditorRuntime()
  const [replaceOpen, setReplaceOpen] = React.useState(false)
  // Ducking is a track-level flag; surface it on the audio clip's inspector.

  function handleReplace(media: ReplacementMedia) {
    dispatch({ type: "REPLACE_CLIP_MEDIA", clipId: clip.id, media })
    setReplaceOpen(false)
  }

  return (
    <div>
      <div
        style={{
          height: 158,
          borderRadius: 13,
          marginBottom: 15,
          position: "relative",
          overflow: "hidden",
          boxShadow: "var(--sh-sm)",
          background:
            clip.kind === "image" && clip.url
              ? `center/cover no-repeat url("${clip.url}")`
              : "linear-gradient(135deg,#2a2a30,#4a4a55)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 10,
            bottom: 10,
            padding: "4px 9px",
            background: "rgba(0,0,0,.55)",
            borderRadius: 7,
            fontSize: 10.5,
            fontWeight: 600,
            color: "#fff",
          }}
        >
          {clip.name}
        </div>
      </div>

      <button
        type="button"
        className="st-hovbg"
        onClick={() => setReplaceOpen(true)}
        style={{
          width: "100%",
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          background: "var(--panel2)",
          border: "1px solid var(--line2)",
          borderRadius: 10,
          color: "var(--ink)",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          marginBottom: 18,
        }}
      >
        <Replace size={15} />
        Replace media
      </button>

      <div
        style={{
          ...card,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 13px",
          marginBottom: 18,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 12.5 }}>Mute clip</div>
          <div style={{ fontSize: 10.5, color: "var(--mut)", marginTop: 1 }}>
            Silence this clip's audio
          </div>
        </div>
        <Toggle
          on={!!clip.muted}
          onToggle={() =>
            dispatch({
              type: "UPDATE_CLIP",
              clipId: clip.id,
              patch: { muted: !clip.muted },
            })
          }
        />
      </div>

      {clip.kind === "audio" && track ? (
        <div
          style={{
            ...card,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 13px",
            marginBottom: 18,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 12.5 }}>Duck under voice</div>
            <div style={{ fontSize: 10.5, color: "var(--mut)", marginTop: 1 }}>
              Lower this track under other clips' audio
            </div>
          </div>
          <Toggle
            on={!!track.duck}
            onToggle={() =>
              dispatch({ type: "TOGGLE_TRACK_DUCK", trackId: track.id })
            }
          />
        </div>
      ) : null}

      <TransitionSection clip={clip} />

      <Timing clip={clip} />

      {clip.kind !== "text" ? (
        <ReplaceMediaDialog
          clipKind={clip.kind}
          open={replaceOpen}
          onOpenChange={setReplaceOpen}
          onReplace={handleReplace}
        />
      ) : null}
    </div>
  )
}

// The blend entering this clip from the previous one. Only shown when the clip
// is visual and butts directly against a preceding visual clip — the same
// gate the preview and renderer apply — so a transition can never be set where
// nothing would render.
function TransitionSection({ clip }: { clip: EditorClip }) {
  const { dispatch } = useEditorRuntime()
  const prevClip = useEditorSelector((state) => {
    const found = findClip(state.tracks, clip.id)
    return found ? precedingClipOnTrack(found.track.clips, clip) : null
  })

  const eligible =
    isTransitionableKind(clip.kind) &&
    !!prevClip &&
    isTransitionableKind(prevClip.kind) &&
    Math.abs(clip.startMs - (prevClip.startMs + prevClip.durationMs)) <=
      TRANSITION_ADJACENCY_EPS_MS
  if (!eligible || !prevClip) return null

  const active = clip.transition ?? null
  const currentId: TransitionKind | "none" = active?.kind ?? "none"
  const maxMs = Math.max(
    MIN_TRANSITION_MS,
    Math.min(MAX_TRANSITION_MS, prevClip.durationMs, clip.durationMs)
  )
  const durationMs = clampTransitionMs(
    active?.durationMs ?? DEFAULT_TRANSITION_MS,
    prevClip.durationMs,
    clip.durationMs
  )

  function setKind(kind: TransitionKind | "none") {
    dispatch({
      type: "UPDATE_CLIP",
      clipId: clip.id,
      patch: {
        transition:
          kind === "none" ? undefined : { kind, durationMs: durationMs },
      },
    })
  }
  function setDuration(ms: number) {
    if (!active) return
    dispatch({
      type: "UPDATE_CLIP",
      clipId: clip.id,
      patch: {
        transition: {
          kind: active.kind,
          durationMs: clampTransitionMs(
            ms,
            prevClip!.durationMs,
            clip.durationMs
          ),
        },
      },
      transient: true,
    })
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <Label style={{ marginBottom: 9 }}>Transition in</Label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: active ? 14 : 0,
        }}
      >
        {TRANSITION_OPTIONS.map((option) => {
          const on = currentId === option.id
          return (
            <button
              key={option.id}
              type="button"
              title={option.description}
              onClick={() => setKind(option.id)}
              style={{
                padding: 10,
                borderRadius: 10,
                fontSize: 12,
                cursor: "pointer",
                border: `1px solid ${on ? "var(--acc)" : "var(--line)"}`,
                background: on ? "var(--acc-soft)" : "var(--panel2)",
                color: "var(--ink)",
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {active ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 9,
            }}
          >
            <span className="st-lbl">Duration</span>
            <span
              style={{
                fontSize: 11.5,
                color: "var(--ink2)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {(durationMs / 1000).toFixed(1)}s
            </span>
          </div>
          <input
            type="range"
            min={MIN_TRANSITION_MS}
            max={maxMs}
            step={50}
            value={durationMs}
            onChange={(e) => setDuration(Number(e.target.value))}
            style={{
              width: "100%",
              background: fillTrack(durationMs, MIN_TRANSITION_MS, maxMs),
            }}
          />
        </>
      ) : null}
    </div>
  )
}

function Timing({ clip }: { clip: EditorClip }) {
  return (
    <>
      <Label style={{ marginBottom: 9 }}>Timing</Label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
        <div style={{ ...card, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, color: "var(--mut)", marginBottom: 3 }}>Start</div>
          <div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {formatClock(clip.startMs)}
          </div>
        </div>
        <div style={{ ...card, padding: "10px 12px" }}>
          <div style={{ fontSize: 10, color: "var(--mut)", marginBottom: 3 }}>Duration</div>
          <div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {(clip.durationMs / 1000).toFixed(1)}s
          </div>
        </div>
      </div>
    </>
  )
}

export function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean
  onToggle: () => void
  // Names the switch for screen readers; the visible text sits in a sibling.
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      style={{
        width: 40,
        height: 23,
        borderRadius: 999,
        padding: 3,
        cursor: "pointer",
        background: on ? "var(--acc)" : "var(--elev2)",
        transition: "background .15s",
        flex: "none",
        border: "none",
        display: "block",
      }}
    >
      <span
        style={{
          display: "block",
          height: 16,
          width: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "transform .15s",
          boxShadow: "0 1px 2px rgba(0,0,0,.3)",
          transform: `translateX(${on ? 17 : 0}px)`,
        }}
      />
    </button>
  )
}

function fillTrack(val: number, min: number, max: number) {
  const p = Math.round(((val - min) / (max - min)) * 100)
  return `linear-gradient(90deg,var(--acc) ${p}%,var(--line2) ${p}%)`
}
