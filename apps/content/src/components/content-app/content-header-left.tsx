import { useRouterState } from "@tanstack/react-router"

import { useShellRuntime } from "@/components/shell/shell-layout"
import { StickyHeaderLeftNav } from "@/components/shell/sticky-header/sticky-header-left-nav"
import type { AppHeaderLeftContentProps } from "@/lib/app-options"
import { canSeeShellEntry, isActiveShellHref, isShellEntryNamed, isShellItem, renderShellIcon } from "@/lib/custom-shell"

const EDITOR = "/admin/video-editor"
const ACTORS = "/admin/video-editor/actors"
const PROJECTS = "/admin/projects"

/**
 * Content's top left (`header.leftContent` in `src/app/options.ts`). The
 * shell's own everywhere but the video editor, which is no link of the left
 * menu, so the shell drew nothing there (Tyler, 27 Nov 2026: "why doesnt the
 * editor have the top nav"). A video is a project's, so the editor shows the
 * Projects item, as a project's own page does.
 *
 * Only for "Sidebar links", the default of Settings → Top left shows; a
 * breadcrumb or shortcuts stay the shell's.
 */
export default function ContentHeaderLeft({ role, fallback }: AppHeaderLeftContentProps) {
  const path = useRouterState({ select: (state) => state.location.pathname })
  const { config } = useShellRuntime()
  const mode = role === "admin" ? config.topLeftMode : config.memberTopLeftMode
  // Actors is under the editor's address but is a left menu link of its own, so the shell names it.
  if (mode !== "sidebar" || !isActiveShellHref(EDITOR, path) || isActiveShellHref(ACTORS, path)) return <>{fallback}</>
  const projects = config.sections
    .flatMap((section) => section.entries.filter(isShellItem))
    .find((item) => canSeeShellEntry(item, role) && isShellEntryNamed(item) && isActiveShellHref(item.href, PROJECTS))
  if (!projects) return <>{fallback}</>
  return (
    <StickyHeaderLeftNav
      navLinks={[{ label: projects.label, href: projects.href, icon: renderShellIcon(projects.icon, "h-3.5 w-3.5"), active: true }]}
      limit={config.topLeftNavLimit}
    />
  )
}
