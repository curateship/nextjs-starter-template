import * as React from "react"
import { FolderKanbanIcon, SettingsIcon } from "lucide-react"

import { ProjectSettingsDialog } from "@/components/project/project-settings-dialog"
import { StarButton } from "@/components/project/star-button"
import { ProjectDot } from "@/components/project/task-bits"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { ProjectPage } from "@/lib/api/project/projects"

/**
 * The project's details, read only. The cog in the header opens Project
 * settings, which holds the name, colour, description, due date and Archive
 * (Tyler, 10 Oct 2026: "add a cog icon here and put all the project settings
 * there"). The bin sits beside New task on the tasks panel.
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
          project.personal ? null : (
            <div className="flex items-center gap-1">
              <StarButton project={project} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Project settings"
                onClick={() => setSettingsOpen(true)}
              >
                <SettingsIcon className="size-4" />
              </Button>
            </div>
          )
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid gap-5 p-4">
          {project.archived ? (
            <p className="text-sm text-muted-foreground">
              This project is archived, so nothing in it can change. Bring it back from
              Project settings to work on it.
            </p>
          ) : null}
          <div className="grid gap-1">
            <h3 className="text-sm font-medium">Description</h3>
            <p className="text-sm break-words whitespace-pre-wrap text-muted-foreground">
              {project.personal
                ? "Your own tasks, which only you can see. They show on My dashboard and in your check-in."
                : project.description || "No description yet."}
            </p>
          </div>
        </div>
      </ScrollArea>
      <ProjectSettingsDialog
        page={page}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  )
}
