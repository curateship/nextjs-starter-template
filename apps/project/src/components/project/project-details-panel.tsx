import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"

import { NotesMorphIcon } from "@/components/project/notes-morph-icon"
import { ProjectPageBlocksProvider } from "@/components/project/notes/project-page-blocks"
import { ProjectNotes } from "@/components/project/project-notes-panel"
import { ProjectPageNotes } from "@/components/project/project-page-notes"
import { ProjectPaceDot } from "@/components/project/project-pace"
import { ProjectMenu } from "@/components/project/project-menu"
import { PinButton } from "@/components/project/pin-button"
import { DashboardCardHeader, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ProjectPage } from "@/lib/api/project/projects"
import { countLate, projectPace } from "@/lib/project/project-pace"
import { runsTheTeam } from "@/lib/project/rules"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { cn } from "@/lib/utils"
import { PageCover } from "@/components/shared/notes/page-cover"

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
 * The note icon between the pin and the ⋮ shows the project's notes in the
 * panel's place and turns into an × that closes them, as a trip's notes do in
 * Travel (task "Project notes"; Tyler, 6 Nov 2026: "Add a note feature here
 * ... like in travel app"). A "Just me" list has the note icon alone. A # link
 * to a note (`openNoteId`) opens the notes with it.
 */
export function ProjectDetailsPanel({
  page,
  openNoteId,
  onNoteOpened,
}: {
  page: ProjectPage
  /** A note to open, from a # link's `?note=`. */
  openNoteId?: string
  /** Told once that note is open, so the address can let it go. */
  onNoteOpened?: () => void
}) {
  const { project } = page
  const [notesOpen, setNotesOpen] = React.useState(Boolean(openNoteId))
  // Each # link opens its note afresh, even with the notes already showing.
  const [request, setRequest] = React.useState(openNoteId ? { noteId: openNoteId, at: 0 } : null)
  const [seenNoteId, setSeenNoteId] = React.useState(openNoteId)
  if (openNoteId !== seenNoteId) {
    setSeenNoteId(openNoteId)
    if (openNoteId) {
      setRequest({ noteId: openNoteId, at: (request?.at ?? 0) + 1 })
      setNotesOpen(true)
    }
  }
  React.useEffect(() => {
    if (openNoteId) onNoteOpened?.()
  }, [openNoteId, onNoteOpened])
  const notesLabel = notesOpen ? "Close the notes" : "Notes"
  const shared = !project.personal
  const siteAdmin = runsTheTeam(page.myRole)
  // A "Just me" list has no cover. `PageCover` leaves out a picture that no longer loads.
  const banner = shared ? project.bannerUrl : null
  const late = countLate(page.tasks)

  // What the page's Milestones block draws.
  const blocks = React.useMemo(
    () => ({ projectId: project.id, milestones: page.milestones, tasks: page.tasks, readOnly: project.archived }),
    [project.id, page.milestones, page.tasks, project.archived]
  )

  return (
    <ProjectPageBlocksProvider value={blocks}>
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* The project's cover, a picture or the sky, faintly behind the header and the top of
          its page, as every page in the shell's design draws it. */}
      <PageCover url={banner} />
      {/* Wrapped in its own div, so the shell's table line under a header never
          matches it. The collapse button first, as on every side panel in the
          shell's design, then the way back to Projects. */}
      <div className="relative shrink-0">
        <DashboardCardHeader className={cn("gap-1", banner && "border-b-transparent")}>
          <SidePanelCollapseButton side="left" label="Hide the project page" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon" className="shrink-0 rounded-lg">
                <Link to="/projects" aria-label="Back to projects">
                  <ArrowLeftIcon className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to projects</TooltipContent>
          </Tooltip>
          <h2 className={cn("min-w-0 flex-1 truncate pl-1", dashboardCardHeadingClassName)}>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{project.name}</span>
              {/* A "Just me" list has no late-task rule, so no status. */}
              {shared ? <ProjectPaceDot pace={projectPace(late, project)} late={late} /> : null}
            </span>
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            {shared ? <PinButton project={project} /> : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={notesLabel}
                  aria-pressed={notesOpen}
                  onClick={() => {
                    setNotesOpen((was) => !was)
                    setRequest(null)
                  }}
                >
                  <NotesMorphIcon open={notesOpen} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{notesLabel}</TooltipContent>
            </Tooltip>
            {shared && siteAdmin ? <ProjectMenu page={page} /> : null}
          </div>
        </DashboardCardHeader>
      </div>
      {/* The page, or its notes, fill the rest of the panel. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {notesOpen ? (
          <ProjectNotes
            key={`${project.id}:${request?.at ?? "notes"}`}
            projectId={project.id}
            startOpen={request?.noteId ?? null}
          />
        ) : (
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
        )}
      </div>
    </div>
    </ProjectPageBlocksProvider>
  )
}
