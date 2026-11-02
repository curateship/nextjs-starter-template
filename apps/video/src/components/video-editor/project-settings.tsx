import * as React from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useEditorVideoName } from "@/components/video-editor/editor-store"
import { ProjectFormDialog } from "@/components/video-editor/project-form-dialog"
import { useProjectGuest } from "@/components/video-editor/project-guest"
import {
  ProjectSettingsContext,
  useProjectSettings,
  type ProjectSettingsValue,
} from "@/components/video-editor/project-settings-context"
import type { ProjectItem } from "@/lib/api/video/projects"
import {
  loadVideoSpend,
  type VideoDetail,
  type VideoItem,
  type VideoSpend,
} from "@/lib/api/video/project-videos"
import { formatCents } from "@/lib/video/project-spend"

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

/**
 * What this video has spent on AI, as a row of the inspector's Project card
 * beside its shape and length. Hovering lists it by tool and gives the whole
 * project's total (Tyler, 1 Nov 2026); clicking opens the settings, where the
 * video's limit is.
 */
export function ProjectSpendRow() {
  const { spend, openSettings, refreshSpend } = useProjectSettings()
  if (!spend) return null
  const label =
    spend.limit_cents === null
      ? formatCents(spend.total_cents)
      : `${formatCents(spend.total_cents)} of ${formatCents(spend.limit_cents)}`
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[15px] font-medium">AI spend</span>
      <Tooltip onOpenChange={(opening) => opening && refreshSpend()}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-[15px] text-muted-foreground tabular-nums underline-offset-4 hover:text-foreground hover:underline"
            aria-label={`This video has spent ${label} on AI. Open settings to set its limit`}
            onClick={openSettings}
          >
            {label}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="grid max-w-64 gap-1">
          {spend.by_tool.length ? (
            spend.by_tool.map((line) => (
              <span key={line.label} className="flex justify-between gap-4">
                <span>{line.label}</span>
                <span className="tabular-nums">{formatCents(line.cents)}</span>
              </span>
            ))
          ) : (
            <span>Nothing spent on AI in this video yet.</span>
          )}
          <span className="flex justify-between gap-4 border-t pt-1">
            <span>Whole project</span>
            <span className="tabular-nums">{formatCents(spend.project_total_cents)}</span>
          </span>
          <span className="opacity-80">
            Pictures, AI clips and voices made before 17 Oct 2026 named no
            project, so they are not counted. Click to set this video&apos;s limit.
          </span>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
