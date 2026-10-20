import * as React from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useEditorProjectName,
  useEditorRuntime,
} from "@/components/video-editor/editor-store"
import { ProjectFormDialog } from "@/components/video-editor/project-form-dialog"
import { useProjectGuest } from "@/components/video-editor/project-guest"
import {
  ProjectSettingsContext,
  useProjectSettings,
  type ProjectSettingsValue,
} from "@/components/video-editor/project-settings-context"
import {
  loadProjectSpend,
  type ProjectItem,
  type ProjectSpend,
} from "@/lib/api/video/projects"
import { formatCents } from "@/lib/video/project-spend"

/**
 * The open project's settings and its AI spending, for the whole editor.
 *
 * The top bar shows what the project has spent and opens its Settings window,
 * and the AI clip panel opens the same window from a refused call's toast, so
 * the limit is raised in one place. The window saves the name the editor shows
 * now, not the one it opened with, so a rename in the top bar is never undone.
 */

export function ProjectSettingsProvider({
  project: opened,
  children,
}: {
  project: ProjectItem
  children: React.ReactNode
}) {
  const { setProjectName } = useEditorRuntime()
  const name = useEditorProjectName()
  const [project, setProject] = React.useState(opened)
  const [open, setOpen] = React.useState(false)
  const [spend, setSpend] = React.useState<ProjectSpend | null>(null)
  const [reads, setReads] = React.useState(0)

  // A guest sent from Project has no AI, so there is no spending to show them.
  const guest = useProjectGuest() !== null
  React.useEffect(() => {
    if (guest) return
    let active = true
    loadProjectSpend(project.id)
      .then((loaded) => {
        if (active) setSpend(loaded)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [guest, project.id, reads])

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
        project={{ ...project, name }}
        folderId={null}
        onClose={() => setOpen(false)}
        onCreated={() => undefined}
        onSaved={(saved) => {
          setProject(saved)
          setProjectName(saved.name)
          refreshSpend()
        }}
      />
    </ProjectSettingsContext.Provider>
  )
}

/**
 * What this project has spent on AI, as a row of the inspector's Project card
 * beside its shape and length. Hovering lists it by tool; clicking opens the
 * project's settings, where the limit is.
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
            aria-label={`This project has spent ${label} on AI. Open project settings to set a limit`}
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
            <span>Nothing spent on AI in this project yet.</span>
          )}
          <span className="opacity-80">
            Pictures, AI clips and voices made before 17 Oct 2026 named no
            project, so they are not counted. Click to set a limit.
          </span>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
