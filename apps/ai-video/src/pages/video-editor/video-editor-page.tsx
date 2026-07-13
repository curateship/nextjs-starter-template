import * as React from "react"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  getProjectErrorMessage,
  saveProjectTimeline,
} from "@/lib/api/video-projects"
import {
  getTemplateErrorMessage,
  saveTemplateTimeline,
} from "@/lib/api/video-templates"
import { createTimelineSnapshot } from "@/lib/timeline-schema"
import {
  EditorProvider,
  type EditorDocument,
} from "@/pages/video-editor/editor-provider"
import { StudioEditor } from "@/pages/video-editor/studio/studio-editor"
import {
  useEditor,
  type EditorDocumentKind,
  type EditorMode,
} from "@/pages/video-editor/editor-store"

// Every video document — regular projects, template-fill projects, and
// templates — opens in the full-screen Studio editor (top bar, tool rail,
// context panel, stage, inspector, timeline). Template modes get an extra
// Slots panel and template CTAs; the mode is read from the store. All editor
// state lives in EditorProvider; the shell strips this route's content padding
// so the editor owns the full area under the sticky header.
export function VideoEditorPage({
  document,
  kind,
}: {
  document: EditorDocument
  kind: EditorDocumentKind
}) {
  const [timelineError, setTimelineError] = React.useState(
    document.timeline_error ?? null
  )
  const mode: EditorMode =
    kind === "template"
      ? "template-builder"
      : document.template_id
        ? "fill-template"
        : "regular"

  React.useEffect(() => {
    setTimelineError(document.timeline_error ?? null)
  }, [document.id, document.timeline_error])

  return (
    <EditorProvider document={document} kind={kind} mode={mode}>
      <div className="flex h-full min-h-0 flex-col">
        {timelineError ? (
          <TimelineResetBanner
            message={timelineError}
            onResetSaved={() => setTimelineError(null)}
          />
        ) : null}
        <div className="min-h-0 flex-1">
          <StudioEditor document={document} />
        </div>
      </div>
    </EditorProvider>
  )
}

// Shown when the saved timeline failed to load and the editor booted a blank
// one; lets the user overwrite the corrupt saved snapshot with the blank state.
function TimelineResetBanner({
  message,
  onResetSaved,
}: {
  message: string
  onResetSaved: () => void
}) {
  const { state, kind, documentId } = useEditor()
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)

  async function handleSaveReset() {
    setSaving(true)
    setSaveError(null)

    try {
      const snapshot = createTimelineSnapshot({
        tracks: state.tracks,
        aspect: state.aspect,
      })
      if (kind === "template") {
        await saveTemplateTimeline(documentId, snapshot)
      } else {
        await saveProjectTimeline(documentId, snapshot)
      }
      onResetSaved()
    } catch (error) {
      setSaveError(
        kind === "template"
          ? getTemplateErrorMessage(error)
          : getProjectErrorMessage(error)
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-b bg-destructive/5 px-3 py-2 sm:px-4 md:px-6">
      <div
        role="alert"
        className="flex flex-col gap-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
      >
        <span className="flex min-w-0 items-start gap-2">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            {message} The editor is showing a blank current timeline.
            {saveError ? (
              <span className="ml-1 font-medium">{saveError}</span>
            ) : null}
          </span>
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => void handleSaveReset()}
          className="w-full shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 sm:w-auto"
        >
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {saving ? "Saving reset" : "Save reset timeline"}
        </Button>
      </div>
    </div>
  )
}
