import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ArchiveIcon, ArchiveRestoreIcon, FolderKanbanIcon } from "lucide-react"

import { ProjectColorSelect } from "@/components/project/project-form-fields"
import { ProjectDot } from "@/components/project/task-bits"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { archiveProject, saveProject, type ProjectPage } from "@/lib/api/project/projects"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS, type ProjectColor } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The project's name, colour and description, edited where they sit. Each
 * field saves when it is left or Enter is pressed, and the colour the moment
 * it is picked. There is no Save button.
 */
export function ProjectDetailsPanel({ page }: { page: ProjectPage }) {
  const router = useRouter()
  const { project } = page
  const [name, setName] = useSyncedDraft(project.name)
  const [description, setDescription] = useSyncedDraft(project.description)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const readOnly = project.archived

  async function save(fields: { name?: string; color?: ProjectColor; description?: string }) {
    const ok = await run(() => saveProject({ projectId: project.id, ...fields }), "Saved.")
    if (ok) await router.invalidate()
  }

  function commitName() {
    const next = name.trim()
    if (next === project.name) return
    if (!next) {
      setNameInvalid(true)
      showErrorToast("The project name can't be empty.")
      return
    }
    void save({ name: next })
  }

  function commitDescription() {
    if (description.trim() === project.description) return
    void save({ description: description.trim() })
  }

  async function toggleArchived() {
    const ok = await run(
      () => archiveProject(project.id, !project.archived),
      project.archived ? "Project brought back." : "Project archived."
    )
    if (ok) await router.invalidate()
  }

  return (
    <>
      <DashboardCardTitleHeader
        icon={<FolderKanbanIcon className="size-4" />}
        back={{ label: "Back to projects", to: "/projects" }}
        title={
          <span className="flex min-w-0 items-center gap-2">
            <ProjectDot color={project.color} />
            <span className="truncate">{project.name}</span>
          </span>
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid gap-4 p-4">
          {readOnly ? (
            <p className="text-sm text-muted-foreground">
              This project is archived, so nothing in it can change. Bring it back to work on it.
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              maxLength={LIMITS.projectName}
              disabled={readOnly}
              aria-invalid={nameInvalid || undefined}
              onChange={(event) => {
                setName(event.target.value)
                setNameInvalid(false)
              }}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-color">Colour</Label>
            <ProjectColorSelect
              id="project-color"
              value={project.color}
              disabled={readOnly}
              onChange={(color) => void save({ color })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              maxLength={LIMITS.projectDescription}
              disabled={readOnly}
              placeholder="What this project is for"
              onChange={(event) => setDescription(event.target.value)}
              onBlur={commitDescription}
            />
          </div>
          <div>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void toggleArchived()}>
              {project.archived ? (
                <ArchiveRestoreIcon className="size-4" />
              ) : (
                <ArchiveIcon className="size-4" />
              )}
              {project.archived ? "Bring back" : "Archive project"}
            </Button>
          </div>
        </div>
      </ScrollArea>
    </>
  )
}
