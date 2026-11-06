import * as React from "react"
import { FolderKanbanIcon } from "lucide-react"

import { ProjectMilestones } from "@/components/project/project-milestones"
import { ProjectPageNotes } from "@/components/project/project-page-notes"
import { ProjectPaceDot } from "@/components/project/project-pace"
import { ProjectMenu } from "@/components/project/project-menu"
import { PinButton } from "@/components/project/pin-button"
import { PersonAvatar } from "@/components/project/task-bits"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { ProjectPage } from "@/lib/api/project/projects"
import { clockTotal, timeOnTasks } from "@/lib/project/clock"
import { countLate, projectPace } from "@/lib/project/project-pace"
import { runsTheTeam } from "@/lib/project/rules"
import { cn } from "@/lib/utils"

/**
 * The project's lead, client and time, then its milestones as a folding card
 * at the bottom (Tyler, 15 Oct 2026). The status is worked out from the late
 * tasks by the rule in Project settings (Tyler, 19 Oct 2026), and shows as its
 * dot alone, right after the name in the header (Tyler, 5 Nov 2026: "Remove
 * the status and just place the dot indicator here"). The same day the colour
 * dot before the name, the avatar with the name beside it, the description and
 * the links left the panel, and the project's own page of notes and "/" blocks
 * took the avatar's place at the top (`project-page-notes.tsx`). The ⋮ in
 * the header opens Project settings as a dropdown (Tyler, 5 Nov 2026), which holds the name, colour,
 * due date, client, members and Archive (Tyler, 10 Oct 2026: "add
 * a cog icon here and put all the project settings there"). The members list
 * left this panel on 14 Oct 2026: whose tasks show is a dropdown in the tasks
 * panel's header, and adding or removing someone, or naming the lead, is in
 * Project settings. The bin is in the tasks panel's More menu.
 *
 * Only the site admin sees the ⋮ and Project settings (Tyler, 16 Oct 2026:
 * "Employees dont even see the settings cog or page. Only admin see it").
 *
 * The project's banner, set in Project settings, lies faintly behind the
 * header and the top of the panel, so the header still reads over it (Tyler,
 * 19 Oct 2026). Over a banner the header has no line under it, so the
 * picture runs on unbroken (Tyler, 20 Oct 2026).
 */
export function ProjectDetailsPanel({ page }: { page: ProjectPage }) {
  const { project } = page
  const lead = page.members.find((member) => member.userId === project.leadUserId) ?? null
  const shared = !project.personal
  const siteAdmin = runsTheTeam(page.myRole)
  // A picture whose address no longer loads is left out rather than drawn broken.
  const [broken, setBroken] = React.useState<string[]>([])
  const lose = (url: string) => setBroken((was) => [...was, url])
  const banner = shared && project.bannerUrl && !broken.includes(project.bannerUrl) ? project.bannerUrl : null
  const late = countLate(page.tasks)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {banner ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-36 overflow-hidden">
          <img src={banner} alt="" className="size-full object-cover opacity-30" onError={() => lose(banner)} />
          {/* Fading into the panel at the foot, as on the Team dashboard. */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-card/40 to-card" />
        </div>
      ) : null}
      <DashboardCardTitleHeader
        // The line goes see-through rather than away, so the header keeps its height.
        className={cn("relative", banner && "border-b-transparent")}
        icon={<FolderKanbanIcon className="size-4" />}
        back={{ label: "Back to projects", to: "/projects" }}
        title={
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{project.name}</span>
            {/* A "Just me" list has no late-task rule, so no status. */}
            {shared ? <ProjectPaceDot pace={projectPace(late, project)} late={late} /> : null}
          </span>
        }
        action={
          shared ? (
            <div className="flex items-center gap-1">
              <PinButton project={project} />
              {siteAdmin ? <ProjectMenu page={page} /> : null}
            </div>
          ) : null
        }
      />
      <ScrollArea className="relative min-h-0 flex-1" viewportClassName="h-full">
        <div className={cn("grid gap-5 p-4", banner && "pt-6")}>
          {/* Where the avatar was: the project's own page of notes and blocks (Tyler, 5 Nov 2026).
              Locking or unlocking it draws it again from what was saved. */}
          {shared ? (
            <ProjectPageNotes
              key={`${project.id}:${project.notesLocked}`}
              projectId={project.id}
              notes={project.notes}
              canWrite={siteAdmin && !project.archived && !project.notesLocked}
            />
          ) : null}
          {project.archived ? (
            <p className="text-sm text-muted-foreground">
              {siteAdmin
                ? "This project is archived, so nothing in it can change. Bring it back from Project settings to work on it."
                : "This project is archived, so nothing in it can change. The site admin can bring it back."}
            </p>
          ) : null}
          {project.personal ? (
            <p className="text-sm text-muted-foreground">
              {siteAdmin
                ? "Their own tasks, which only they and you see. They show on their My dashboard and in their check-in."
                : "Your own tasks, which only you and the site admin see. They show on My dashboard and in your check-in."}
            </p>
          ) : null}
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
              {/* Beside the lead, avatar or not (Tyler, 19 Oct 2026). */}
              {project.client ? (
                <div className="grid content-start gap-2">
                  <Heading>Client</Heading>
                  <span className="truncate text-sm">{project.client}</span>
                </div>
              ) : null}
              <ProjectTime tasks={page.tasks} />
            </div>
          ) : null}
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
    </div>
  )
}


/**
 * The project's time on the clock (Seven features, part 4). Nothing shows
 * until someone has clocked a minute.
 */
function ProjectTime({ tasks }: { tasks: ProjectPage["tasks"] }) {
  // Read once as the panel draws; a running clock is counted up to then.
  const [nowMs] = React.useState(() => Date.now())
  const seconds = timeOnTasks(tasks, nowMs)
  if (seconds < 60) return null
  return (
    <div className="grid content-start gap-2">
      <Heading>Time</Heading>
      <span className="text-sm">
        <span className="font-medium tabular-nums">{clockTotal(seconds)}</span> clocked
      </span>
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</h3>
}
