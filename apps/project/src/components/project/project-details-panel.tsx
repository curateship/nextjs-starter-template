import * as React from "react"
import { FolderKanbanIcon, SettingsIcon } from "lucide-react"

import { PanelCard } from "@/components/project/panel-card"
import { CardDropdown } from "@/components/project/card-dropdown"
import { HealthForm, HealthMark, HealthSetBy } from "@/components/project/project-health"
import { ProjectMilestones } from "@/components/project/project-milestones"
import { ProjectSettingsDialog } from "@/components/project/project-settings-dialog"
import { StarButton } from "@/components/project/star-button"
import { PersonAvatar, ProjectDot } from "@/components/project/task-bits"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { ProjectPage } from "@/lib/api/project/projects"
import { runsTheTeam } from "@/lib/project/rules"

/**
 * The project's description, lead and client, then its status and milestones
 * as folding cards at the bottom (Tyler, 15 Oct 2026). The cog in
 * the header opens Project settings, which holds the name, colour,
 * description, due date, client, members and Archive (Tyler, 10 Oct 2026: "add
 * a cog icon here and put all the project settings there"). The members list
 * left this panel on 14 Oct 2026: whose tasks show is a dropdown in the tasks
 * panel's header, and adding or removing someone, or naming the lead, is in
 * Project settings. The bin is in the tasks panel's More menu.
 *
 * Only the site admin sees the cog and Project settings (Tyler, 16 Oct 2026:
 * "Employees dont even see the settings cog or page. Only admin see it").
 */
export function ProjectDetailsPanel({ page }: { page: ProjectPage }) {
  const { project } = page
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const lead = page.members.find((member) => member.userId === project.leadUserId) ?? null
  const shared = !project.personal
  const siteAdmin = runsTheTeam(page.myRole)

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
          shared ? (
            <div className="flex items-center gap-1">
              <StarButton project={project} />
              {siteAdmin ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Project settings"
                  onClick={() => setSettingsOpen(true)}
                >
                  <SettingsIcon className="size-4" />
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid gap-5 p-4">
          {project.archived ? (
            <p className="text-sm text-muted-foreground">
              {siteAdmin
                ? "This project is archived, so nothing in it can change. Bring it back from Project settings to work on it."
                : "This project is archived, so nothing in it can change. The site admin can bring it back."}
            </p>
          ) : null}
          <div className="grid gap-2">
            <Heading>Description</Heading>
            <p className="text-sm break-words whitespace-pre-wrap">
              {project.personal
                ? siteAdmin
                  ? "Their own tasks, which only they and you see. They show on their My dashboard and in their check-in."
                  : "Your own tasks, which only you and the site admin see. They show on My dashboard and in your check-in."
                : project.description || <span className="text-muted-foreground">No description yet.</span>}
            </p>
          </div>
          {shared ? (
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Heading>Lead</Heading>
                {lead ? (
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <PersonAvatar name={lead.name} avatarUrl={lead.avatarUrl} />
                    <span className="truncate">{lead.name}</span>
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Nobody yet</span>
                )}
              </div>
              {project.client ? (
                <div className="grid content-start gap-2">
                  <Heading>Client</Heading>
                  <span className="truncate text-sm">{project.client}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          {shared ? <HealthCard page={page} /> : null}
          {shared ? (
            <ProjectMilestones
              projectId={project.id}
              milestones={page.milestones}
              tasks={page.tasks}
              readOnly={project.archived}
            />
          ) : null}
        </div>
      </ScrollArea>
      {siteAdmin ? (
        <ProjectSettingsDialog page={page} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      ) : null}
    </>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</h3>
}

/**
 * The status as a folding card at the bottom of the panel, with Milestones
 * (Tyler, 15 Oct 2026). Its cog shows on hover and opens a dropdown. It shows
 * nothing to someone who can't set a status while there is none, and "No
 * status yet" to someone who can.
 */
function HealthCard({ page }: { page: ProjectPage }) {
  const { project } = page
  const [open, setOpen] = React.useState(false)
  const canChange = project.canSetHealth && !project.archived
  if (!project.health && !canChange) return null
  return (
    <PanelCard
      storageId="project-details-status"
      title="Status"
      // The status in the heading, so a folded card still says it (Tyler, 15 Oct 2026).
      after={project.health ? <HealthMark health={project.health.value} /> : null}
      quiet
      actionOpen={open}
      action={
        canChange ? (
          <CardDropdown
            label="Change the status"
            icon={<SettingsIcon className="size-4" />}
            open={open}
            onOpenChange={setOpen}
          >
            <HealthForm projectId={project.id} health={project.health} onDone={() => setOpen(false)} />
          </CardDropdown>
        ) : null
      }
    >
      {project.health ? (
        <div className="grid gap-1">
          {project.health.note ? <p className="text-sm break-words">{project.health.note}</p> : null}
          <HealthSetBy health={project.health} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No status yet. Use the cog to set one.</p>
      )}
    </PanelCard>
  )
}
