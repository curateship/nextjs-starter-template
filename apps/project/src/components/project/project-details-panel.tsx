import * as React from "react"
import { XIcon } from "lucide-react"

import { ProjectPageBlocksProvider } from "@/components/project/notes/project-page-blocks"
import { ProjectNotes } from "@/components/project/project-notes-panel"
import { ProjectPageNotes } from "@/components/project/project-page-notes"
import { ProjectPaceDot } from "@/components/project/project-pace"
import { ProjectMenu } from "@/components/project/project-menu"
import { DashboardCardHeader, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ProjectPage } from "@/lib/api/project/projects"
import { storedPageHolds } from "@/lib/project/note-blocks"
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
 * The header is the button that hides the panel, the name with its status
 * dot, and the ⋮ (task "Misc/writing-canvas", Tyler, 15 Nov 2026: "Remove
 * arrow back", "Move pin into the buttons here"). The pin is a row in the ⋮
 * above Archive project, and the project's notes are a Notes block on the
 * page ("Turn notes into block"), so there is no note icon. A # link to a
 * note (`openNoteId`) opens it in the page's Notes block. A page with no
 * Notes block, and a "Just me" list, which has no page, shows the notes in
 * the page's place instead, with an × in the header that puts the page back.
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
  // Each # link opens its note afresh, even with that note already showing.
  const [request, setRequest] = React.useState(openNoteId ? { noteId: openNoteId, at: 0 } : null)
  const [seenNoteId, setSeenNoteId] = React.useState(openNoteId)
  if (openNoteId !== seenNoteId) {
    setSeenNoteId(openNoteId)
    if (openNoteId) setRequest({ noteId: openNoteId, at: (request?.at ?? 0) + 1 })
  }
  React.useEffect(() => {
    if (openNoteId) onNoteOpened?.()
  }, [openNoteId, onNoteOpened])
  // How many Notes blocks are drawn on the page right now: one added since the page
  // loaded counts as soon as it shows, before the page is saved.
  const [notesBlocks, setNotesBlocks] = React.useState(0)
  const notesBlockShown = React.useCallback((shown: boolean) => setNotesBlocks((n) => n + (shown ? 1 : -1)), [])
  const shared = !project.personal
  const pageHasNotes = shared && (notesBlocks > 0 || storedPageHolds(project.notes, "noteProjectNotes"))
  // A # link with no Notes block to open in shows the notes in the page's place.
  const notesInstead = request !== null && !pageHasNotes
  const siteAdmin = runsTheTeam(page.myRole)
  // A "Just me" list has no cover. `PageCover` leaves out a picture that no longer loads.
  const banner = shared ? project.bannerUrl : null
  const late = countLate(page.tasks)

  // What the page's Milestones and Notes blocks draw.
  const blocks = React.useMemo(
    () => ({
      projectId: project.id,
      milestones: page.milestones,
      tasks: page.tasks,
      readOnly: project.archived,
      noteLink: request,
      notesBlockShown,
    }),
    [project.id, page.milestones, page.tasks, project.archived, request, notesBlockShown]
  )

  return (
    <ProjectPageBlocksProvider value={blocks}>
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
              <span className="truncate">{project.name}</span>
              {/* A "Just me" list has no late-task rule, so no status. */}
              {shared ? <ProjectPaceDot pace={projectPace(late, project)} late={late} /> : null}
            </span>
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            {notesInstead ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Close the notes" onClick={() => setRequest(null)}>
                    <XIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close the notes</TooltipContent>
              </Tooltip>
            ) : null}
            {shared && siteAdmin ? <ProjectMenu page={page} /> : null}
          </div>
        </DashboardCardHeader>
      </div>
      {/* The page, or its notes, fill the rest of the panel. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {notesInstead ? (
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
