import * as React from "react"
import { Link, useParams } from "@tanstack/react-router"
import { AlertCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  getTemplateForEditing,
  getTemplateErrorMessage,
  type TemplateDetail,
} from "@/lib/api/video-templates"
import { VideoEditorPage } from "@/pages/video-editor/video-editor-page"

// Fetch outcome tagged with its template id, so stale results from a previous
// template are ignored without resetting state inside the effect.
type LoadResult =
  | { templateId: string; template: TemplateDetail }
  | { templateId: string; error: string }

// Loads the template (including its saved timeline) before mounting the editor,
// so EditorProvider can initialize its store from it. Edits autosave back to
// the template (Edit Template flow), reusing the project editor unchanged.
export function TemplateEditorPage() {
  const { templateId } = useParams({
    from: "/_authenticated/admin/video-editor/template/$templateId",
  })
  const [result, setResult] = React.useState<LoadResult | null>(null)

  React.useEffect(() => {
    let active = true

    getTemplateForEditing(templateId)
      .then((data) => {
        if (active) setResult({ templateId, template: data })
      })
      .catch((loadError) => {
        if (active)
          setResult({ templateId, error: getTemplateErrorMessage(loadError) })
      })

    return () => {
      active = false
    }
  }, [templateId])

  const current = result?.templateId === templateId ? result : null

  if (current && "error" in current) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="text-center">
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{current.error}</span>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin/templates">Back to templates</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!current) {
    return null
  }

  return <VideoEditorPage document={current.template} kind="template" />
}
