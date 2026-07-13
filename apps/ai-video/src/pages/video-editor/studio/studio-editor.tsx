import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ArrowLeft,
  Captions,
  Check,
  Film,
  Layers,
  LayoutGrid,
  Loader2,
  Music2,
  Pencil,
  Play,
  Settings2,
  Share2,
  Sparkles,
  Type,
  Upload,
  X,
} from "lucide-react"

import { ViralVideoModal } from "@/components/viral-video-modal"
import { renameProject } from "@/lib/api/video-projects"
import {
  createProjectFromTemplate,
  getTemplateErrorMessage,
  renameTemplate,
} from "@/lib/api/video-templates"
import { useEditor } from "@/pages/video-editor/editor-store"
import type { EditorDocument } from "@/pages/video-editor/editor-provider"
import { EditorSettingsDialog } from "@/pages/video-editor/editor-settings-dialog"
import { formatClock } from "@/pages/video-editor/timeline-utils"
import {
  StudioContextPanel,
  type StudioPanel,
} from "@/pages/video-editor/studio/studio-panels"
import { StudioExportModal } from "@/pages/video-editor/studio/studio-export-modal"
import { StudioInspector } from "@/pages/video-editor/studio/studio-inspector"
import { StudioStage } from "@/pages/video-editor/studio/studio-stage"
import {
  ROW_H,
  RULER_H,
  StudioTimeline,
  TOOLBAR_H,
} from "@/pages/video-editor/studio/studio-timeline"
import "@/pages/video-editor/studio/studio.css"

type ResizeKey = "panelW" | "inspectorW" | "timelineH"
const LIMITS: Record<ResizeKey, [number, number]> = {
  panelW: [210, 440],
  inspectorW: [240, 460],
  timelineH: [150, 560],
}

// Height that shows every track row (toolbar + ruler + rows + a little slack)
// without the timeline scrolling, clamped to the panel's drag range. Empty
// projects keep the compact default.
const DEFAULT_TIMELINE_H = 216
function fitTimelineH(trackCount: number) {
  if (trackCount === 0) return DEFAULT_TIMELINE_H
  const [min, max] = LIMITS.timelineH
  const needed = TOOLBAR_H + RULER_H + trackCount * ROW_H + 14
  return Math.round(Math.max(min, Math.min(max, needed)))
}

type RailItem = { id: StudioPanel; label: string; Icon: typeof Film }
const SLOTS_RAIL: RailItem = { id: "slots", label: "Slots", Icon: Layers }
const TRANSCRIPT_RAIL: RailItem = { id: "transcript", label: "Transcript", Icon: Captions }
const RAIL: RailItem[] = [
  { id: "media", label: "Media", Icon: Film },
  { id: "text", label: "Text", Icon: Type },
  { id: "ai", label: "AI", Icon: Sparkles },
  { id: "audio", label: "Audio", Icon: Music2 },
  { id: "brand", label: "Brand", Icon: LayoutGrid },
]

// Full-screen Studio editor. Regular projects open on Media; template-builder
// and fill-template documents get a leading Slots panel and template CTAs, all
// wired to the shared editor store via useEditor().
export function StudioEditor({ document }: { document: EditorDocument }) {
  const { state, dispatch, clock, mode, kind } = useEditor()
  const isTemplateMode = mode !== "regular"
  // Transcript editing needs the caption backend, which is project-only.
  const railItems = [
    ...(isTemplateMode ? [SLOTS_RAIL] : []),
    ...RAIL,
    ...(kind === "project" ? [TRANSCRIPT_RAIL] : []),
  ]
  const [panel, setPanel] = React.useState<StudioPanel>(
    isTemplateMode ? "slots" : "media"
  )
  const [panelW, setPanelW] = React.useState(268)
  const [inspectorW, setInspectorW] = React.useState(292)
  // Open with the timeline tall enough to show every track. Tracks may load
  // after mount, so also fit once on their first appearance (a single time,
  // so later manual resizes stick).
  const [timelineH, setTimelineH] = React.useState(() => fitTimelineH(state.tracks.length))
  const timelineFitRef = React.useRef(state.tracks.length > 0)
  React.useEffect(() => {
    if (timelineFitRef.current || state.tracks.length === 0) return
    timelineFitRef.current = true
    setTimelineH(fitTimelineH(state.tracks.length))
  }, [state.tracks.length])
  const [exportOpen, setExportOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)

  const sizeSetters: Record<ResizeKey, (v: number) => void> = {
    panelW: setPanelW,
    inspectorW: setInspectorW,
    timelineH: setTimelineH,
  }
  const sizeValues: Record<ResizeKey, number> = {
    panelW,
    inspectorW,
    timelineH,
  }

  function startResize(key: ResizeKey, dir: "x" | "y") {
    return (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const startPos = dir === "x" ? e.clientX : e.clientY
      const startVal = sizeValues[key]
      const [min, max] = LIMITS[key]
      // Inspector/timeline grow as their leading edge is dragged toward the
      // content, i.e. opposite the pointer delta.
      const sign = key === "inspectorW" || key === "timelineH" ? -1 : 1
      const onMove = (ev: PointerEvent) => {
        const delta = ((dir === "x" ? ev.clientX : ev.clientY) - startPos) * sign
        sizeSetters[key](Math.max(min, Math.min(max, startVal + delta)))
      }
      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.document.body.style.cursor = ""
        window.document.body.style.userSelect = ""
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
      window.document.body.style.cursor = dir === "x" ? "col-resize" : "row-resize"
      window.document.body.style.userSelect = "none"
    }
  }

  // Editor-wide keyboard shortcuts (space / delete / escape).
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return
      }
      if (e.code === "Space") {
        e.preventDefault()
        clock.toggle()
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        state.selectedClipId
      ) {
        e.preventDefault()
        dispatch({ type: "DELETE_CLIP", clipId: state.selectedClipId })
      } else if (e.key === "Escape") {
        dispatch({ type: "SELECT_CLIP", clipId: null })
        dispatch({ type: "SET_CUT_MODE", on: false })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [clock, dispatch, state.selectedClipId])

  return (
    <div
      className="studio-root"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflow: "hidden",
      }}
    >
      <TopBar document={document} onExport={() => setExportOpen(true)} />

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <nav
          data-screen-label="Tool rail"
          style={{
            width: 72,
            flex: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            padding: "12px 0",
            background: "var(--panel)",
            borderRight: "1px solid var(--line)",
            zIndex: 20,
          }}
        >
          {railItems.map(({ id, label, Icon }) => {
            const on = panel === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPanel(id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 5,
                  width: 56,
                  padding: "9px 0",
                  border: "none",
                  borderRadius: 13,
                  cursor: "pointer",
                  background: on ? "var(--elev2)" : "transparent",
                  color: on ? "var(--ink)" : "var(--ink2)",
                }}
              >
                <Icon size={20} />
                <span style={{ fontSize: 9.5, fontWeight: 600 }}>{label}</span>
              </button>
            )
          })}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="st-hovbg"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            style={{
              height: 44,
              width: 44,
              display: "grid",
              placeItems: "center",
              border: "none",
              borderRadius: 11,
              background: "transparent",
              color: "var(--mut)",
              cursor: "pointer",
            }}
          >
            <Settings2 size={18} />
          </button>
        </nav>

        <aside
          data-screen-label="Panel"
          style={{
            width: panelW,
            flex: "none",
            position: "relative",
            background: "var(--panel)",
            borderRight: "1px solid var(--line)",
            minHeight: 0,
          }}
        >
          <StudioContextPanel panel={panel} />
          <ResizeHandle dir="x" side="right" onPointerDown={startResize("panelW", "x")} />
        </aside>

        <StudioStage />

        <aside
          data-screen-label="Inspector"
          style={{ width: inspectorW, flex: "none", position: "relative", minHeight: 0 }}
        >
          <ResizeHandle dir="x" side="left" onPointerDown={startResize("inspectorW", "x")} />
          <StudioInspector />
        </aside>
      </div>

      <section
        style={{
          height: timelineH,
          flex: "none",
          position: "relative",
          borderTop: "1px solid var(--line)",
          background: "var(--panel)",
          zIndex: 15,
        }}
      >
        <ResizeHandle dir="y" side="top" onPointerDown={startResize("timelineH", "y")} />
        <StudioTimeline />
      </section>

      <StatusBar />

      <StudioExportModal open={exportOpen} onOpenChange={setExportOpen} />
      <EditorSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

function ResizeHandle({
  dir,
  side,
  onPointerDown,
}: {
  dir: "x" | "y"
  side: "left" | "right" | "top"
  onPointerDown: (e: React.PointerEvent) => void
}) {
  const base: React.CSSProperties =
    dir === "x"
      ? {
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 9,
          zIndex: 25,
          cursor: "col-resize",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          [side]: -4,
        }
      : {
          position: "absolute",
          left: 0,
          right: 0,
          height: 9,
          top: -4,
          zIndex: 25,
          cursor: "row-resize",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }
  const grip: React.CSSProperties =
    dir === "x"
      ? { width: 3, height: 34, borderRadius: 3, background: "var(--line2)", transition: "background .13s" }
      : { height: 3, width: 34, borderRadius: 3, background: "var(--line2)", transition: "background .13s" }
  return (
    <div className="st-resize" onPointerDown={onPointerDown} style={base} title="Drag to resize">
      <span className="st-grip" style={grip} />
    </div>
  )
}

function TopBar({
  document,
  onExport,
}: {
  document: EditorDocument
  onExport: () => void
}) {
  const { documentName, setDocumentName, documentId, kind, mode } = useEditor()
  const navigate = useNavigate()
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(documentName)
  const [shared, setShared] = React.useState(false)
  const [analysisOpen, setAnalysisOpen] = React.useState(false)
  const [useOpen, setUseOpen] = React.useState(false)
  const [projectName, setProjectName] = React.useState(documentName)
  const [usingTemplate, setUsingTemplate] = React.useState(false)
  const [useError, setUseError] = React.useState<string | null>(null)
  const isBuilder = mode === "template-builder"

  async function commitRename() {
    setEditing(false)
    const next = draft.trim()
    if (!next || next === documentName) {
      setDraft(documentName)
      return
    }
    setDocumentName(next)
    try {
      // Autosave/settings own the source of truth; a failed rename just keeps
      // the in-editor label rather than interrupting editing.
      if (kind === "template") await renameTemplate(documentId, next)
      else await renameProject(documentId, next)
    } catch {
      /* keep the in-editor label */
    }
  }

  function shareLink() {
    void navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => {
        setShared(true)
        setTimeout(() => setShared(false), 1600)
      })
      .catch(() => undefined)
  }

  async function handleUseTemplate() {
    setUsingTemplate(true)
    setUseError(null)
    try {
      const { projectId } = await createProjectFromTemplate(document.id, projectName)
      void navigate({
        to: "/admin/video-editor/$projectId",
        params: { projectId },
      })
    } catch (error) {
      setUseError(getTemplateErrorMessage(error))
      setUsingTemplate(false)
    }
  }

  return (
    <header
      data-screen-label="Topbar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        height: 56,
        padding: "0 16px",
        background: "var(--panel)",
        borderBottom: "1px solid var(--line)",
        flex: "none",
        zIndex: 40,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
        <button
          type="button"
          className="st-hovbright"
          onClick={() =>
            navigate({
              to: kind === "template" ? "/admin/templates" : "/admin/video-editor",
            })
          }
          title={kind === "template" ? "Back to templates" : "Back to projects"}
          aria-label="Back"
          style={{
            display: "grid",
            placeItems: "center",
            height: 30,
            width: 30,
            borderRadius: 9,
            background: "var(--ink)",
            color: "var(--paper)",
            border: "none",
            cursor: "pointer",
            flex: "none",
          }}
        >
          <ArrowLeft size={17} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename()
                if (e.key === "Escape") {
                  setDraft(documentName)
                  setEditing(false)
                }
              }}
              style={{
                fontWeight: 600,
                fontSize: 14,
                background: "var(--panel2)",
                border: "1px solid var(--line2)",
                borderRadius: 7,
                padding: "3px 8px",
                color: "var(--ink)",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          ) : (
            <>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 260,
                }}
                title={documentName}
              >
                {documentName}
              </span>
              <button
                type="button"
                onClick={() => {
                  setDraft(documentName)
                  setEditing(true)
                }}
                aria-label="Rename"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--mut)",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  padding: 0,
                }}
              >
                <Pencil size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {isBuilder ? (
        <>
          {document.source_viral_video_id ? (
            <button type="button" className="st-hovbg" onClick={() => setAnalysisOpen(true)} style={secondaryTopBtn}>
              <Sparkles size={15} />
              Source analysis
            </button>
          ) : null}
          <button
            type="button"
            className="st-hovbright"
            onClick={() => {
              setProjectName(documentName)
              setUseOpen(true)
            }}
            style={primaryTopBtn}
          >
            <Play size={15} fill="currentColor" />
            Use template
          </button>
        </>
      ) : (
        <>
          <button type="button" className="st-hovbg" onClick={shareLink} style={secondaryTopBtn}>
            {shared ? <Check size={15} /> : <Share2 size={15} />}
            {shared ? "Copied" : "Share"}
          </button>
          <button type="button" className="st-hovbright" onClick={onExport} style={primaryTopBtn}>
            <Upload size={15} />
            Export
          </button>
        </>
      )}

      <ViralVideoModal
        videoId={analysisOpen ? (document.source_viral_video_id ?? null) : null}
        templateId={analysisOpen ? document.id : null}
        onOpenChange={(open) => !open && setAnalysisOpen(false)}
      />
      <UseTemplateDialog
        open={useOpen}
        onOpenChange={setUseOpen}
        value={projectName}
        onChange={setProjectName}
        onSubmit={handleUseTemplate}
        busy={usingTemplate}
        error={useError}
      />
    </header>
  )
}

const secondaryTopBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  height: 32,
  padding: "0 13px",
  background: "transparent",
  border: "1px solid var(--line2)",
  borderRadius: 9,
  color: "var(--ink)",
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
}

const primaryTopBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  height: 32,
  padding: "0 17px",
  background: "var(--ink)",
  border: "none",
  borderRadius: 9,
  color: "var(--paper)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "var(--sh-sm)",
}

// Thin status bar pinned to the bottom of the editor: aspect + duration on the
// left, save state on the right (moved out of the top bar). Values are labelled
// plain text (no pills) so their meaning is obvious.
function StatusBar() {
  const { state, durationMs, saveStatus } = useEditor()
  const saveDot =
    saveStatus === "error"
      ? "var(--coral)"
      : saveStatus === "saving"
        ? "var(--warn)"
        : "var(--good)"
  const saveLabel =
    saveStatus === "error"
      ? "Save failed"
      : saveStatus === "saving"
        ? "Saving…"
        : "Saved"

  return (
    <footer
      style={{
        height: 28,
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "0 14px",
        background: "var(--panel)",
        borderTop: "1px solid var(--line)",
        fontSize: 11,
        color: "var(--ink2)",
        zIndex: 16,
      }}
    >
      <StatItem label="Aspect ratio" value={state.aspect} />
      <StatItem
        label="Duration"
        value={formatClock(durationMs)}
      />
      <div style={{ flex: 1 }} />
      <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span
          style={{ height: 6, width: 6, borderRadius: "50%", background: saveDot }}
        />
        {saveLabel}
      </span>
    </footer>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
      <span style={{ color: "var(--mut)" }}>{label}</span>
      <span
        style={{
          fontWeight: 600,
          color: "var(--ink)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </span>
  )
}

// Names and creates a project from the current template (Studio-styled modal).
function UseTemplateDialog({
  open,
  onOpenChange,
  value,
  onChange,
  onSubmit,
  busy,
  error,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  busy: boolean
  error: string | null
}) {
  if (!open) return null
  return (
    <div
      onClick={() => !busy && onOpenChange(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,15,20,.4)",
        backdropFilter: "blur(4px)",
        display: "grid",
        placeItems: "center",
        zIndex: 80,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="studio-root"
        style={{
          width: 420,
          maxWidth: "92vw",
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 18,
          boxShadow: "var(--sh-lg)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 20px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div style={{ fontFamily: "'Bebas Neue'", fontSize: 24, letterSpacing: ".02em" }}>
            Use template
          </div>
          <button
            type="button"
            className="st-hovbg"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            style={{
              height: 30,
              width: 30,
              borderRadius: 8,
              background: "transparent",
              border: "none",
              color: "var(--mut)",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 12 }}>
          {error ? (
            <div style={{ fontSize: 12.5, color: "var(--coral)" }} role="alert">
              {error}
            </div>
          ) : null}
          <div className="st-lbl" style={{ marginBottom: 2 }}>
            Project name
          </div>
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim() && !busy) onSubmit()
            }}
            placeholder="My project"
            style={{
              width: "100%",
              height: 40,
              padding: "0 12px",
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              fontSize: 13.5,
              color: "var(--ink)",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 9,
            padding: "16px 20px",
            borderTop: "1px solid var(--line)",
          }}
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            style={{
              height: 32,
              padding: "0 16px",
              background: "transparent",
              border: "1px solid var(--line2)",
              borderRadius: 10,
              color: "var(--ink)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="st-hovbright"
            disabled={busy || !value.trim()}
            onClick={onSubmit}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              height: 32,
              padding: "0 18px",
              background: "var(--ink)",
              border: "none",
              borderRadius: 10,
              color: "var(--paper)",
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
              opacity: busy || !value.trim() ? 0.6 : 1,
            }}
          >
            {busy ? <Loader2 size={14} className="st-spin" /> : null}
            {busy ? "Creating" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  )
}
