import * as React from "react"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { CopyIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  copyIntoProject,
  getSavedVideoErrorMessage,
} from "@/lib/api/video/viral-videos"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  editorViewStorageKey,
  updateEditorView,
} from "@/lib/video/editor-view-memory"

const authenticatedRoute = getRouteApi("/_authenticated")

/**
 * Copy this: makes a new project that copies this video and opens it in the
 * editor with the Copy panel showing. The video is saved and broken down on the way, which spends from
 * the AI allowance unless it was saved before. Pressed under the player on a
 * Viral project or a favourites collection.
 */
export function CopyThisButton({
  url,
  title,
  viralProjectId,
  className,
}: {
  url: string
  title: string | null
  /** The Viral project it was pressed in, which the new project remembers. */
  viralProjectId: string | null
  className?: string
}) {
  const navigate = useNavigate()
  const { user } = authenticatedRoute.useLoaderData()
  const [busy, setBusy] = React.useState(false)

  async function copy() {
    setBusy(true)
    try {
      const project = await copyIntoProject(url, title, viralProjectId)
      // The editor opens on the panel it remembers for a project, so the new
      // project remembers Copy before it is opened.
      updateEditorView(editorViewStorageKey(user.id, project.id), {
        panel: "copy",
      })
      await navigate({
        to: "/admin/video-editor/$projectId",
        params: { projectId: project.id },
      })
    } catch (error) {
      showErrorToast(getSavedVideoErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      disabled={busy}
      onClick={() => void copy()}
    >
      {busy ? <Loader2Icon className="animate-spin" /> : <CopyIcon />}
      Copy this
    </Button>
  )
}
