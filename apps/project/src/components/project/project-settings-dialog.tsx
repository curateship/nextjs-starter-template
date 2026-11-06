import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react"

import { ProjectMembersCard } from "@/components/project/project-members-card"
import {
  ProjectBannerField,
  ProjectCategoryField,
  ProjectClientField,
  ProjectColorField,
  ProjectDoingLimitField,
  ProjectDueField,
  ProjectNameField,
  ProjectPaceFields,
  ProjectWholeTeamField,
} from "@/components/project/project-settings-fields"
import { useArchiveProject } from "@/components/project/use-save-project"
import { ProjectTaskTypesCard } from "@/components/project/project-task-types-card"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ProjectPage } from "@/lib/api/project/projects"

/**
 * The project's settings in a window, opened from a project's row on the
 * Projects table. The project page has the same fields as folding rows behind
 * its ⋮ (`project-menu.tsx`). Each field saves when it is left or Enter is
 * pressed, and the colour, due date and pictures the moment they are picked,
 * so the window ends with Done. Each card folds shut from its heading and
 * stays as it was left in this browser (Tyler, 19 Oct 2026).
 */
export function ProjectSettingsDialog({
  page,
  open,
  onClose,
}: {
  page: ProjectPage
  open: boolean
  onClose: () => void
}) {
  const { project } = page
  // Fields save when they are left, so the one being typed in is left first:
  // Escape or a click outside would otherwise close the window over it.
  function close() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Project settings</DialogTitle>
          <DialogDescription>
            {project.archived
              ? "This project is archived, so nothing in it can change. Bring it back to work on it."
              : "Changes save as you make them."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ProjectCard page={page} />
          <CollapsibleSettingsCard storageId="project-settings-status" title="Status" size="sm" contentClassName="grid gap-4">
            <ProjectPaceFields project={project} />
          </CollapsibleSettingsCard>
          <CollapsibleSettingsCard storageId="project-settings-pictures" title="Banner" size="sm">
            <ProjectBannerField project={project} />
          </CollapsibleSettingsCard>
          <ProjectMembersCard page={page} />
          <ProjectTaskTypesCard page={page} />
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={close}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProjectCard({ page }: { page: ProjectPage }) {
  const { project } = page
  const archive = useArchiveProject(project)
  return (
    <CollapsibleSettingsCard storageId="project-settings-project" title="Project" size="sm" contentClassName="grid gap-4">
      <ProjectNameField project={project} />
      <ProjectColorField project={project} />
      <ProjectClientField project={project} names={page.teamClients} />
      <ProjectCategoryField project={project} names={page.siteCategories} />
      <ProjectDueField project={project} />
      <ProjectDoingLimitField project={project} />
      <ProjectWholeTeamField project={project} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={archive.busy} onClick={() => void archive.toggle()}>
          {project.archived ? <ArchiveRestoreIcon className="size-4" /> : <ArchiveIcon className="size-4" />}
          {project.archived ? "Bring back" : "Archive project"}
        </Button>
      </div>
    </CollapsibleSettingsCard>
  )
}
