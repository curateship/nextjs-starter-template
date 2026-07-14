import * as React from "react"
import { X } from "lucide-react"

import { ProjectExportPreviewDialog } from "@/components/export-dashboard"
import { useShellRuntime } from "@/components/shell-runtime"
import { brandKitExportFilename } from "@/lib/ai-video"
import {
  getExport,
  getExportErrorMessage,
  updateExport,
  type ExportItem,
} from "@/lib/api/exports"
import {
  cancelProjectRender,
  getProjectErrorMessage,
  getProjectRender,
  RENDER_QUALITY_OPTIONS,
  startProjectRender,
  type ProjectRenderInfo,
  type RenderQuality,
} from "@/lib/api/video-projects"
import { EXPORT_TITLE_MAX_LENGTH } from "@/lib/export-constraints"
import {
  useEditorDocumentName,
  useEditorDocumentThumbnailUrl,
  useEditorDurationMs,
  useEditorRuntime,
  useEditorSelector,
} from "@/pages/video-editor/editor-store"
import { formatClock } from "@/pages/video-editor/timeline-utils"
import { Toggle } from "@/pages/video-editor/studio/studio-inspector"

const RENDER_POLL_MS = 2000
const RENDER_POLL_GIVE_UP_MS = 12 * 60 * 1000

// The design's export dialog, wired to the real render lifecycle (mirrors
// ExportControls): flushSave → startProjectRender → poll getProjectRender →
// getExport → reuse the polished ProjectExportPreviewDialog on completion.
// Stays mounted so the poll survives closing the modal.
export function StudioExportModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const projectName = useEditorDocumentName()
  const documentThumbnailUrl = useEditorDocumentThumbnailUrl()
  const durationMs = useEditorDurationMs()
  const aspect = useEditorSelector((state) => state.aspect)
  const { documentId: projectId, flushSave } = useEditorRuntime()
  const { config } = useShellRuntime()
  const defaultFilename = brandKitExportFilename(
    config.brandKit.exportNamingPattern,
    projectName,
    config.workspaceName
  )

  const [quality, setQuality] = React.useState<RenderQuality>("high")
  const [includeEndCard, setIncludeEndCard] = React.useState(
    config.brandKit.endCard.enabled
  )
  const [filename, setFilename] = React.useState(defaultFilename)
  const [status, setStatus] = React.useState<
    "idle" | "queued" | "rendering" | "ready" | "error"
  >("idle")
  const [queuePosition, setQueuePosition] = React.useState<number | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [starting, setStarting] = React.useState(false)
  const [completedExport, setCompletedExport] =
    React.useState<ExportItem | null>(null)
  const previewPendingRef = React.useRef(false)
  const filenameRef = React.useRef(filename)
  React.useEffect(() => {
    filenameRef.current = filename
  }, [filename])

  // Reset the form defaults whenever the modal is (re)opened.
  React.useEffect(() => {
    if (!open) return
    setFilename(defaultFilename)
    setIncludeEndCard(config.brandKit.endCard.enabled)
  }, [open, defaultFilename, config.brandKit.endCard.enabled])

  const applyRenderInfo = React.useCallback((info: ProjectRenderInfo) => {
    setStatus(info.status)
    setQueuePosition(info.queue_position)
    setError(info.error)
  }, [])

  const openCompletedExport = React.useCallback(async () => {
    try {
      const exportItem = await getExport(projectId)
      const title = (filenameRef.current.trim() || exportItem.name || projectName)
        .slice(0, EXPORT_TITLE_MAX_LENGTH)
      const item =
        title !== exportItem.name
          ? await updateExport(projectId, { title, caption: exportItem.caption })
          : exportItem
      setCompletedExport(item)
      onOpenChange(false)
    } catch (exportError) {
      setStatus("error")
      setError(getExportErrorMessage(exportError))
    }
  }, [projectId, projectName, onOpenChange])

  // Pick up a render already running on mount (e.g. a refresh mid-render).
  React.useEffect(() => {
    let active = true
    getProjectRender(projectId)
      .then((info) => active && applyRenderInfo(info))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [applyRenderInfo, projectId])

  // Poll while queued/rendering; give up past the server render timeout.
  React.useEffect(() => {
    if (status !== "rendering" && status !== "queued") return
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (status === "rendering" && Date.now() - startedAt > RENDER_POLL_GIVE_UP_MS) {
        setStatus("error")
        setError("Export timed out")
        return
      }
      getProjectRender(projectId)
        .then((info) => {
          applyRenderInfo(info)
          if (info.status === "ready" && previewPendingRef.current) {
            previewPendingRef.current = false
            void openCompletedExport()
          }
        })
        .catch(() => undefined)
    }, RENDER_POLL_MS)
    return () => clearInterval(timer)
  }, [applyRenderInfo, openCompletedExport, projectId, status])

  async function handleStartExport() {
    setStarting(true)
    setError(null)
    setCompletedExport(null)
    try {
      await flushSave()
      const info = await startProjectRender(projectId, quality, includeEndCard)
      previewPendingRef.current = true
      applyRenderInfo(info)
      if (info.status === "ready") {
        previewPendingRef.current = false
        await openCompletedExport()
      }
    } catch (exportError) {
      setStatus("error")
      setError(getProjectErrorMessage(exportError))
    } finally {
      setStarting(false)
    }
  }

  async function handleCancelExport() {
    try {
      const info = await cancelProjectRender(projectId)
      previewPendingRef.current = false
      applyRenderInfo(info)
    } catch (cancelError) {
      setError(getProjectErrorMessage(cancelError))
    }
  }

  const queued = status === "queued"
  const rendering = starting || status === "rendering" || queued
  const queuedLabel =
    queuePosition && queuePosition > 0
      ? `Queued (#${queuePosition})…`
      : "Queued…"

  return (
    <>
      {open ? (
        <div
          onClick={() => onOpenChange(false)}
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
              width: 460,
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
                Export
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

            <div style={{ padding: 20, display: "grid", gap: 17 }}>
              {rendering ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {queued ? queuedLabel : "Exporting your video…"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--mut)", lineHeight: 1.5 }}>
                    You can close this window — the export keeps running and the
                    preview opens when it&apos;s ready.
                  </div>
                </div>
              ) : (
                <>
                  {error ? (
                    <div style={{ fontSize: 12.5, color: "var(--coral)" }} role="alert">
                      {error}
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      gap: 13,
                      alignItems: "center",
                      padding: 13,
                      background: "var(--panel2)",
                      border: "1px solid var(--line)",
                      borderRadius: 13,
                    }}
                  >
                    <div
                      style={{
                        width: 54,
                        height: 68,
                        borderRadius: 9,
                        flex: "none",
                        boxShadow: "var(--sh-sm)",
                        background: documentThumbnailUrl
                          ? `center/cover no-repeat url("${documentThumbnailUrl}")`
                          : "linear-gradient(135deg,#6b3b2e,#caa24a)",
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{projectName}</div>
                      <div style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 3 }}>
                        {formatClock(durationMs)} · {aspect}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="st-lbl" style={{ marginBottom: 8 }}>
                      File name
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        value={filename}
                        maxLength={EXPORT_TITLE_MAX_LENGTH}
                        onChange={(e) => setFilename(e.target.value)}
                        placeholder="my-video"
                        style={{
                          flex: 1,
                          height: 38,
                          padding: "0 12px",
                          background: "var(--panel2)",
                          border: "1px solid var(--line)",
                          borderRadius: 10,
                          fontSize: 13,
                          color: "var(--ink)",
                          outline: "none",
                          fontFamily: "inherit",
                        }}
                      />
                      <span style={{ color: "var(--mut)", fontSize: 13 }}>.mp4</span>
                    </div>
                  </div>

                  <div>
                    <div className="st-lbl" style={{ marginBottom: 8 }}>
                      Quality
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {RENDER_QUALITY_OPTIONS.map((q) => {
                        const on = quality === q.value
                        return (
                          <button
                            key={q.value}
                            type="button"
                            onClick={() => setQuality(q.value)}
                            style={{
                              flex: 1,
                              padding: "12px 8px",
                              borderRadius: 11,
                              textAlign: "center",
                              cursor: "pointer",
                              border: `1px solid ${on ? "var(--acc)" : "var(--line)"}`,
                              background: on ? "var(--acc-soft)" : "var(--panel2)",
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: 12.5 }}>{q.label}</div>
                            <div style={{ fontSize: 10.5, color: "var(--mut)", marginTop: 2 }}>
                              {q.hint}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      padding: "12px 13px",
                      background: "var(--panel2)",
                      border: "1px solid var(--line)",
                      borderRadius: 11,
                    }}
                  >
                    <Toggle on={includeEndCard} onToggle={() => setIncludeEndCard((v) => !v)} />
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>Include brand end card</span>
                  </div>
                </>
              )}
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
              {rendering ? (
                <>
                  {queued ? (
                    <button type="button" onClick={handleCancelExport} style={secondaryBtn}>
                      Cancel export
                    </button>
                  ) : null}
                  <button type="button" onClick={() => onOpenChange(false)} style={secondaryBtn}>
                    Close
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => onOpenChange(false)} style={secondaryBtn}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="st-hovbright"
                    disabled={starting}
                    onClick={handleStartExport}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      height: 32,
                      padding: "0 20px",
                      background: "var(--ink)",
                      border: "none",
                      borderRadius: 10,
                      color: "var(--paper)",
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Export file
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <ProjectExportPreviewDialog
        item={completedExport}
        onSaved={setCompletedExport}
        onOpenChange={(isOpen) => !isOpen && setCompletedExport(null)}
      />
    </>
  )
}

const secondaryBtn: React.CSSProperties = {
  height: 32,
  padding: "0 16px",
  background: "transparent",
  border: "1px solid var(--line2)",
  borderRadius: 10,
  color: "var(--ink)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
}
