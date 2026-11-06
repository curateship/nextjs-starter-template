import * as React from "react"
import { FolderKanbanIcon, InfoIcon } from "lucide-react"

import { FoldHeading } from "@/components/project/fold-heading"
import { NotesMorphIcon } from "@/components/project/inbox-morph-icon"
import { PanelFooter } from "@/components/project/panel-footer"
import { ProjectMilestones } from "@/components/project/project-milestones"
import { ProjectNotes } from "@/components/project/project-notes-panel"
import { ProjectPageNotes } from "@/components/project/project-page-notes"
import { ProjectPaceDot } from "@/components/project/project-pace"
import { ProjectMenu } from "@/components/project/project-menu"
import { PinButton } from "@/components/project/pin-button"
import { PersonAvatar } from "@/components/project/task-bits"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ProjectPage } from "@/lib/api/project/projects"
import { countLate, projectPace } from "@/lib/project/project-pace"
import { runsTheTeam } from "@/lib/project/rules"
import { FOOTER_CARD_BODY, PANEL_BODY_ABOVE_FOOTER, PANEL_BODY_ABOVE_FOOTER_WIDE } from "@/lib/project/panel-gutter"
import { collapseStorageKey, useRememberedCollapse } from "@/lib/remembered-choice"
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
          <div className="flex items-center gap-1">
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
        }
      />
      {/* The page and its notes above, the footer of folding cards below (Tyler, 6 Nov
          2026, the Admin 3 panel design): the footer takes what its cards need, and the
          body keeps at least 6rem, or half the panel with the notes open. */}
      <div className={cn("relative flex min-h-0 flex-col", notesOpen ? PANEL_BODY_ABOVE_FOOTER_WIDE : PANEL_BODY_ABOVE_FOOTER)}>
        {notesOpen ? (
          <ProjectNotes
            key={`${project.id}:${request?.at ?? "notes"}`}
            projectId={project.id}
            startOpen={request?.noteId ?? null}
          />
        ) : (
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
            </div>
          </ScrollArea>
        )}
      </div>
      {shared ? (
        <PanelFooter>
          <ProjectDetailsCard lead={lead} client={project.client} />
          <ProjectMilestones
            projectId={project.id}
            milestones={page.milestones}
            tasks={page.tasks}
            readOnly={project.archived}
          />
        </PanelFooter>
      ) : null}
    </div>
  )
}


/**
 * The Details footer card: the lead and the client, each a name on the left
 * and its value on the right. It folds like the other footer cards and
 * remembers it in this browser.
 */
function ProjectDetailsCard({
  lead,
  client,
}: {
  lead: ProjectPage["members"][number] | null
  client: string | null
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(collapseStorageKey.settingsCard("project-footer-details"))
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="grid grid-cols-[minmax(0,1fr)]">
      <FoldHeading band icon={<InfoIcon />} title="Details" open={open} />
      <CollapsibleContent data-collapse-key={noFlashKey} className={cn("grid grid-cols-[minmax(0,1fr)] gap-2.5 text-sm", FOOTER_CARD_BODY)}>
        <DetailRow label="Lead">
          {lead ? (
            <>
              <PersonAvatar name={lead.name} avatarUrl={lead.avatarUrl} size="sm" />
              <span className="truncate">{lead.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Nobody yet</span>
          )}
        </DetailRow>
        <DetailRow label="Client">{client ? <span className="truncate">{client}</span> : <span className="text-muted-foreground">None</span>}</DetailRow>
      </CollapsibleContent>
    </Collapsible>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-2">{children}</span>
    </div>
  )
}
