import { ProjectControls } from "@/components/content-app/project-top"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { cn } from "@/lib/utils"

/**
 * What a project's page puts first in the middle's one header, before the
 * list's own controls (Tyler, 27 Nov 2026: "Lets put them all in the top
 * header so we have just one header"): the project's controls
 * (`ProjectControls`: the arrow back, Content, Research and Promote, the ⋮
 * and the tab's own dropdown). Every network's middle header, the Archive's,
 * the Videos list's and Research's draw this slot, so the page fills it once
 * rather than each header knowing the project. Nothing outside a project's
 * page.
 */
export function ProjectHeaderLead() {
  const desktop = useWideScreen()
  // From 1280px only the tab's dropdown gives way, cutting its words short. Below it, where the page shows
  // one column at a time, they scroll sideways inside the header rather than pushing the page wider.
  return (
    <span
      className={cn(
        "flex items-center gap-1 self-stretch",
        desktop ? "min-w-0 shrink" : "min-w-0 shrink-[10] overflow-x-auto [scrollbar-width:none]"
      )}
    >
      <ProjectControls />
    </span>
  )
}
