import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import { DashboardCardHeader, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { LockedPageContext } from "@/components/shared/notes/block-card"
import { PageCover } from "@/components/shared/notes/page-cover"
import { SavingDocument } from "@/components/shared/notes/saving-document"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useProject } from "@/components/viral/project-context"
import { ProjectSettingsMenu } from "@/components/viral/project-menu"
import { PROJECT_APP_BLOCKS, ProjectBlocksProvider, type ProjectBlocks } from "@/components/viral/project-page-blocks"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { lockViralProjectNotesFn, saveViralProjectNotesFn } from "@/lib/api/viral/viral-projects"
import { PANEL_GUTTER } from "@/lib/layout/panel-gutter"
import { pageWithBlockMoved, pageWithoutBlock } from "@/lib/notes/page-body"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * A project's left panel on its own dashboard, copied from Promo's project
 * page (Tyler, 21 Nov 2026: "Copy the pattern of the promo app instead";
 * `apps/promo/src/components/social/projects/project-panel.tsx`):
 *
 * - **Header:** the collapse button, the name (cut short with "…", all of it
 *   on hover), and the ⋮: General and Socials, as Promo's General and
 *   Networks. The arrow back to the Viral dashboard starts the middle's
 *   header, as Promo's does.
 * - **Cover:** the project's cover lies faintly behind the top and carries
 *   on behind the right panel.
 * - **Body:** the project's page: its notes in the shell's editor with the
 *   fixed Socials and Vault blocks at the top (`project-page-blocks.tsx`).
 *   The description is Niche, first under Search in the ⋮. It saves 700ms after the last letter. Lock
 *   blocks in the ⋮ makes it read only.
 */
export function ProjectPagePanel({ blocks }: { blocks: ProjectBlocks }) {
  const { screen, refresh } = useProject()
  const { project } = screen
  const router = useRouter()
  // What was last saved, so the page never jumps back while it is read again.
  const [notes, setNotes] = React.useState(project.notes)
  const [busy, setBusy] = React.useState(false)

  const change = async (work: () => Promise<unknown>, next: string) => {
    setBusy(true)
    try {
      await work()
      setNotes(next)
      await refresh()
    } catch (failure) {
      showErrorToast(getViralErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  // Delete block and Move up or down on a locked page: unlocked just long enough to save, as every page in the design does.
  const lockedPage = {
    locked: project.notes_locked,
    removeBlock: async (nodeName: string) => {
      const body = pageWithoutBlock(notes, nodeName)
      await change(async () => {
        await lockViralProjectNotesFn(project.id, false)
        await saveViralProjectNotesFn(project.id, body)
      }, body)
    },
    moveBlock: async (nodeName: string, direction: -1 | 1) => {
      const body = pageWithBlockMoved(notes, nodeName, direction)
      if (body === notes) return
      await change(async () => {
        await lockViralProjectNotesFn(project.id, false)
        try {
          await saveViralProjectNotesFn(project.id, body)
        } finally {
          await lockViralProjectNotesFn(project.id, true)
        }
      }, body)
    },
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <PageCover url={project.cover_url} />
      {/* Wrapped in its own div, so the shell's table line under a header never matches this side panel's header. */}
      <div className="relative shrink-0">
        <DashboardCardHeader className={cn("gap-1", project.cover_url && "border-b-transparent")}>
          <SidePanelCollapseButton side="left" label="Hide the project" />
          <Tooltip>
            <TooltipTrigger asChild>
              <h2 tabIndex={0} className={cn("min-w-0 flex-1 truncate pl-1", dashboardCardHeadingClassName)}>
                {project.name}
              </h2>
            </TooltipTrigger>
            <TooltipContent>{project.name}</TooltipContent>
          </Tooltip>
          <ProjectSettingsMenu project={project} refresh={refresh} onGone={() => router.navigate({ to: "/admin/viral" })} page />
        </DashboardCardHeader>
      </div>
      <ScrollArea className="relative min-h-0 flex-1">
        {/* A side panel's body, so its first block follows Settings → Styling → Panel cards → Opacity. */}
        <div data-side-panel-body="" className={cn(PANEL_GUTTER, "grid grid-cols-[minmax(0,1fr)] pt-0")}>
          <ProjectBlocksProvider value={blocks}>
            <LockedPageContext.Provider value={lockedPage}>
              <SavingDocument
                // A lock reads the page again from the start.
                key={`${project.id}-${project.notes_locked ? "locked" : "open"}`}
                value={notes}
                locked={project.notes_locked || busy}
                appBlocks={PROJECT_APP_BLOCKS}
                placeholder="Notes about this niche, or type / for blocks"
                onSave={async (next) => {
                  try {
                    await saveViralProjectNotesFn(project.id, next)
                    setNotes(next)
                  } catch (failure) {
                    showErrorToast(getViralErrorMessage(failure))
                  }
                }}
              />
            </LockedPageContext.Provider>
          </ProjectBlocksProvider>
        </div>
      </ScrollArea>
    </div>
  )
}
