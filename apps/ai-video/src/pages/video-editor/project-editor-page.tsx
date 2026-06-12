import * as React from "react"
import { Link, useParams } from "@tanstack/react-router"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  getProject,
  getProjectErrorMessage,
  type ProjectDetail,
} from "@/lib/api/video-projects"
import { VideoEditorPage } from "@/pages/video-editor/video-editor-page"

// Fetch outcome tagged with its project id, so stale results from a previous
// project are ignored without resetting state inside the effect.
type LoadResult =
  | { projectId: string; project: ProjectDetail }
  | { projectId: string; error: string }

// Loads the project (including its saved timeline) before mounting the
// editor, so EditorProvider can initialize its store from it.
export function ProjectEditorPage() {
  const { projectId } = useParams({
    from: "/_authenticated/admin/video-editor/$projectId",
  })
  const [result, setResult] = React.useState<LoadResult | null>(null)

  React.useEffect(() => {
    let active = true

    getProject(projectId)
      .then((data) => {
        if (active) setResult({ projectId, project: data })
      })
      .catch((loadError) => {
        if (active)
          setResult({ projectId, error: getProjectErrorMessage(loadError) })
      })

    return () => {
      active = false
    }
  }, [projectId])

  const current = result?.projectId === projectId ? result : null

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
            <Link to="/admin/video-editor">Back to projects</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return <VideoEditorPage project={current.project} />
}
