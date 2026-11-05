import * as React from "react"
import { useEditorVideoName } from "@/components/video-editor/editor-store"
import { ProjectFormDialog } from "@/components/video-editor/project-form-dialog"
import { useProjectGuest } from "@/components/video-editor/project-guest"
import {
  ProjectSettingsContext,
  type ProjectSettingsValue,
} from "@/components/video-editor/project-settings-context"
import type { ProjectItem } from "@/lib/api/video/projects"
import {
  loadVideoSpend,
  type VideoDetail,
  type VideoItem,
  type VideoSpend,
} from "@/lib/api/video/project-videos"

/**
 * The open project's settings and the open video's AI spending, for the whole
 * editor.
 *
 * The inspector shows what the video has spent and opens the Settings window,
 * and the AI clip panel opens the same window from a refused call's toast, so
 * the limit is raised in one place. The window holds the project's name and
 * look, and the open video's own spend limit.
 */

export function ProjectSettingsProvider({
  project: opened,
  video: openedVideo,
  children,
}: {
  project: ProjectItem
  video: VideoDetail
  children: React.ReactNode
}) {
  const name = useEditorVideoName()
  const [project, setProject] = React.useState(opened)
  const [video, setVideo] = React.useState<Pick<VideoItem, "id" | "spend_limit_cents">>(openedVideo)
  const [open, setOpen] = React.useState(false)
  const [spend, setSpend] = React.useState<VideoSpend | null>(null)
  const [reads, setReads] = React.useState(0)

  // A guest sent from Project has no AI, so there is no spending to show them.
  const guest = useProjectGuest() !== null
  React.useEffect(() => {
    if (guest) return
    let active = true
    loadVideoSpend(video.id)
      .then((loaded) => {
        if (active) setSpend(loaded)
      })
      .catch((error) => console.error("Reading the video's AI spend failed", error))
    return () => {
      active = false
    }
  }, [guest, video.id, reads])

  const openSettings = React.useCallback(() => setOpen(true), [])
  const refreshSpend = React.useCallback(
    () => setReads((count) => count + 1),
    []
  )
  const value = React.useMemo<ProjectSettingsValue>(
    () => ({ project, spend, openSettings, refreshSpend }),
    [project, spend, openSettings, refreshSpend]
  )

  return (
    <ProjectSettingsContext.Provider value={value}>
      {children}
      <ProjectFormDialog
        open={open}
        project={project}
        video={{ ...video, name }}
        folderId={null}
        onClose={() => setOpen(false)}
        onCreated={() => undefined}
        onSaved={setProject}
        onVideoSaved={(saved) => {
          setVideo(saved)
          refreshSpend()
        }}
      />
    </ProjectSettingsContext.Provider>
  )
}
