import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { CopyIcon, FolderKanbanIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import { BinDialog } from "@/components/project/bin-dialog"
import { CopyProjectDialog } from "@/components/project/copy-project-dialog"
import { ProjectProgress } from "@/components/project/project-progress"
import { ProjectSettingsDialog } from "@/components/project/project-settings-dialog"
import { StarButton } from "@/components/project/star-button"
import { ProjectDot } from "@/components/project/task-bits"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { saveProject, type ProjectPage } from "@/lib/api/project/projects"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { dateFromKey, keyFromDate } from "@/lib/project/dates"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { TASK_STATUS_LABEL, TASK_STATUSES, type TaskStatus } from "@/lib/project/rules"

/**
 * The project's details, read only. The cog in the header opens Project
 * settings, which holds the name, colour, description and Archive (Tyler,
 * 10 Oct 2026: "add a cog icon here and put all the project settings there").
 */
export function ProjectDetailsPanel({ page }: { page: ProjectPage }) {
  const { project } = page
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [binOpen, setBinOpen] = React.useState(false)
  const [copying, setCopying] = React.useState(false)
  const counts = Object.fromEntries(
    TASK_STATUSES.map((status) => [status, page.tasks.filter((task) => task.status === status).length])
  ) as Record<TaskStatus, number>

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
          {project.personal ? null : <ProjectDueField page={page} />}
          <Separator />
          <section className="grid gap-2" aria-labelledby="project-tasks-heading">
            <h3 id="project-tasks-heading" className="text-sm font-medium">
              Tasks
            </h3>
            <ProjectProgress counts={counts} dueDate={project.dueDate} />
            <ul className="grid gap-1.5 text-sm">
              {TASK_STATUSES.map((status) => (
                <li key={status} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{TASK_STATUS_LABEL[status]}</span>
                  <span className="tabular-nums">{counts[status]}</span>
                </li>
              ))}
            </ul>
          </section>
          <div className="flex flex-wrap gap-2">
            {project.personal ? null : (
              <Button type="button" variant="outline" onClick={() => setCopying(true)}>
                <CopyIcon className="size-4" />
                Copy project
              </Button>
            )}
            {project.archived ? null : (
              <Button type="button" variant="outline" onClick={() => setBinOpen(true)}>
                <Trash2Icon className="size-4" />
                Bin
              </Button>
            )}
          </div>
        </div>
      </ScrollArea>
      <BinDialog projectId={project.id} open={binOpen} onClose={() => setBinOpen(false)} />
      <CopyProjectDialog project={project} open={copying} onClose={() => setCopying(false)} />
      <ProjectSettingsDialog
        project={project}
        sections={page.sections}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  )
}

/** The project's own due date, saved the moment one is picked. */
function ProjectDueField({ page }: { page: ProjectPage }) {
  const router = useRouter()
  const { project } = page
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  async function save(dueDate: string | null) {
    if (await run(() => saveProject({ projectId: project.id, dueDate }))) await router.invalidate()
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="project-due">Due date</Label>
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          id="project-due"
          value={dateFromKey(project.dueDate)}
          placeholder="No due date"
          disabled={project.archived || busy}
          onChange={(date) => void save(keyFromDate(date))}
        />
        {project.dueDate && !project.archived ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void save(null)}>
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  )
}
