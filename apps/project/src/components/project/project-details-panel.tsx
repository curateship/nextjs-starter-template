import * as React from "react"
import { useRouter } from "@tanstack/react-router"


import { ProjectPageBlocksProvider, type ProjectPageBlocks } from "@/components/project/notes/project-page-blocks"
import { ProjectPageNotes } from "@/components/project/project-page-notes"
import { ProjectPaceDot } from "@/components/project/project-pace"
import { ProjectMenu } from "@/components/project/project-menu"
import { DashboardCardHeader, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { ProjectPage } from "@/lib/api/project/projects"
import { countLate, projectPace } from "@/lib/project/project-pace"
import { runsTheTeam } from "@/lib/project/rules"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { cn } from "@/lib/utils"
import { saveProject } from "@/lib/api/project/projects"
import { getProjectErrorMessage } from "@/lib/project/errors"
import type { NoteNode } from "@/lib/project/note-blocks"
import { readTaskNotes } from "@/lib/project/notes"
import { showErrorToast } from "@/lib/toast/error-toast"
import { PageCover } from "@/components/shared/notes/page-cover"
import { ProjectAvatar } from "@/components/project/project-avatar"

/**
 * The project's page, with its milestones as a "/" block on it (Tyler, 9 Nov
 * 2026: "remove the details card and make milestone a block"). Until then the
 * panel's foot held a Details card with the lead and the client, and a
 * Milestones card; the lead and the client are still set in Project settings.
 * The status is worked out from the late
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
 *
 * The header is the button that hides the panel, the name with its status
 * dot, and the ⋮ (task "Misc/writing-canvas", Tyler, 15 Nov 2026: "Remove
 * arrow back", "Move pin into the buttons here"). The pin is a row in the ⋮
 * above Archive project.
 *
 * The page always holds the fixed Dashboards block, the way to the project's
 * Tasks, Notes and Milestones (Tyler, 16 Nov 2026). `blocks` is what it draws.
 * A "Just me" list has no page, so it has only its tasks.
 */
export function ProjectDetailsPanel({ page, blocks }: { page: ProjectPage; blocks: ProjectPageBlocks }) {
  const { project } = page
  const router = useRouter()
  const shared = !project.personal
  const siteAdmin = runsTheTeam(page.myRole)
  // On a locked page the site admin still hides, shows and orders the Dashboards block's rows
  // and moves the block: one save unlocks the page, writes it and locks it again, as the
  // shell's locked pages move their blocks.
  const locked = shared && siteAdmin && !project.archived && project.notesLocked
  const lockedPage = React.useMemo(() => {
    if (!locked) return undefined
    const read = readTaskNotes(project.notes, { projectPage: true })
    if (read.kind !== "doc") return undefined
    return {
      body: read.body,
      change: (next: NoteNode) =>
        void (async () => {
          try {
            await saveProject({ projectId: project.id, notes: next, notesLocked: false })
            await saveProject({ projectId: project.id, notesLocked: true })
          } catch (error) {
            showErrorToast(getProjectErrorMessage(error))
          }
          await router.invalidate()
        })(),
    }
  }, [locked, project.notes, project.id, router])
  const pageBlocks = React.useMemo(() => ({ ...blocks, lockedPage }), [blocks, lockedPage])
  // A "Just me" list has no cover. `PageCover` leaves out a picture that no longer loads.
  const banner = shared ? project.bannerUrl : null
  const late = countLate(page.tasks)

  return (
    <ProjectPageBlocksProvider value={pageBlocks}>
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* The project's cover, a picture or the sky, faintly behind the header and the top of
          its page, as every page in the shell's design draws it. */}
      <PageCover url={banner} />
      {/* Wrapped in its own div, so the shell's table line under a header never
          matches it. The collapse button first, as on every side panel in the
          shell's design. */}
      <div className="relative shrink-0">
        <DashboardCardHeader className={cn("gap-1", banner && "border-b-transparent")}>
          <SidePanelCollapseButton side="left" label="Hide the project page" />
          <h2 className={cn("min-w-0 flex-1 truncate pl-1", dashboardCardHeadingClassName)}>
            <span className="flex min-w-0 items-center gap-1.5">
              {/* The optional avatar, a picture, SVG or looping MP4, set in the ⋮ under Page. */}
              {project.avatarUrl ? (
                <span className="mr-0.5 flex size-7 shrink-0 overflow-hidden rounded-md empty:hidden">
                  <ProjectAvatar url={project.avatarUrl} />
                </span>
              ) : null}
              <span className="truncate">{project.name}</span>
              {/* A "Just me" list has no late-task rule, so no status. */}
              {shared ? <ProjectPaceDot pace={projectPace(late, project)} late={late} /> : null}
            </span>
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            {shared && siteAdmin ? <ProjectMenu page={page} /> : null}
          </div>
        </DashboardCardHeader>
      </div>
      {/* The page fills the rest of the panel. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ScrollArea className="relative min-h-0 flex-1" viewportClassName="h-full">
            {/* The panel's 15px gutter round the page and between its blocks, as on My dashboard. */}
            <div data-side-panel-body="" className={cn("grid grid-cols-[minmax(0,1fr)]", PANEL_GUTTER)}>
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
            </div>
          </ScrollArea>
      </div>
    </div>
    </ProjectPageBlocksProvider>
  )
}
