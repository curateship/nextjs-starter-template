import * as React from "react"
import { FolderKanbanIcon, SettingsIcon } from "lucide-react"

import { ProjectSettingsDialog } from "@/components/project/project-settings-dialog"
import { ProjectDot } from "@/components/project/task-bits"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import type { ProjectPage } from "@/lib/api/project/projects"
import { TASK_STATUS_LABEL, TASK_STATUSES } from "@/lib/project/rules"

/**
 * The project's details, read only. The cog in the header opens Project
 * settings, which holds the name, colour, description and Archive (Tyler,
 * 10 Oct 2026: "add a cog icon here and put all the project settings there").
 */
export function ProjectDetailsPanel({ page }: { page: ProjectPage }) {
  const { project } = page
  const [settingsOpen, setSettingsOpen] = React.useState(false)

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
        action={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Project settings"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon className="size-4" />
          </Button>
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid gap-5 p-4">
          {project.archived ? (
            <p className="text-sm text-muted-foreground">
              This project is archived, so nothing in it can change. Bring it back from the
              cog to work on it.
            </p>
          ) : null}
          <div className="grid gap-1">
            <h3 className="text-sm font-medium">Description</h3>
            <p className="text-sm break-words whitespace-pre-wrap text-muted-foreground">
              {project.description || "No description yet."}
            </p>
          </div>
          <Separator />
          <section className="grid gap-2" aria-labelledby="project-tasks-heading">
            <h3 id="project-tasks-heading" className="text-sm font-medium">
              Tasks
            </h3>
            <ul className="grid gap-1.5 text-sm">
              {TASK_STATUSES.map((status) => (
                <li key={status} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{TASK_STATUS_LABEL[status]}</span>
                  <span className="tabular-nums">
                    {page.tasks.filter((task) => task.status === status).length}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </ScrollArea>
      <ProjectSettingsDialog
        project={project}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  )
}
