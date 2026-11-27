import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"

import { ProjectTabs } from "@/components/content-app/project-tabs"
import type { MySettingsTab } from "@/components/shared/notes/tabbed-menu"
import { ViewMenu, type ViewChoice } from "@/components/shared/view-menu"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useWideScreen } from "@/lib/layout/wide-screen"

/**
 * A project's controls, at the start of the one header its middle panel has
 * (`workspace/docs/content-app.md`, "A project's own page"; Tyler, 27 Nov
 * 2026: "The middle panel header would have these tabs [Content] [Research]
 * [Promote]", then "I dont like the 2 extra subheader. Lets put them all in
 * the top header so we have just one header. The tabs can now be either
 * dropdowns or filter"):
 *
 * - the arrow back to the Projects list, with this project's row open;
 * - Content, Research and Promote as tabs.
 *
 * The tab's own choice is a dropdown on the right, first after the search
 * icon (`ProjectSubChoice`): Promote's network with its Posts or Commenting
 * ("Reddit · Commenting"). Content has none: its one dropdown is in its
 * lists' own headers (`content-kind-menu.tsx`).
 *
 * The project's ⋮ is the last thing in the same header, after the list's own
 * New button (`ProjectMenuButton`; Tyler, 27 Nov 2026, pointing past Add:
 * "the 3 dot ... should be here").
 *
 * Below a 1500px window the three tabs are a dropdown too, so the header has
 * room for the list's own buttons. The project's name is not shown (Tyler: "remove the name"). Every list a
 * project's page shows draws these first in its own header, through
 * `ProjectHeaderLead`, so there is one header and no row above it.
 */

export type ProjectTab = "content" | "research" | "promote"

/** The tab's own choice, a dropdown after the tabs. */
export type ProjectSubChoice = { label: string; value: string; choices: ViewChoice[]; onChange: (value: string) => void }

export type ProjectTopValue = {
  projectId: string
  /** A guest sent from Project: no arrow back, and no Research, which is the owner's. */
  guest: boolean
  tab: ProjectTab
  onTab: (tab: ProjectTab) => void
  sub: ProjectSubChoice | null
  /** The project's ⋮ (`project-menu.tsx`), with what the list showing adds after the project's own tabs. */
  menu: (more: ProjectMenuMore) => React.ReactNode
}

/**
 * What a list adds to the project's ⋮: Research's settings as tabs, and a
 * list's own actions (Reddit Commenting's Jobs, Ideas and Self-promotion
 * threads) as one more tab, so a header has one ⋮.
 */
export type ProjectMenuMore = {
  extraTabs?: MySettingsTab[]
  actions?: { title: string; items: { label: string; icon: React.ReactNode; onClick: () => void }[] }
  /** The list's Select, first of General's actions ("Move all the mass select button to here"). */
  select?: ListSelect
  /** The network's Jobs window, with how many run or wait, after Select (Tyler, 27 Nov 2026: "Move jobs button here"). */
  jobs?: { waiting: number; onOpen: () => void } | null
}

const ProjectTopContext = React.createContext<ProjectTopValue | null>(null)

export const ProjectTopProvider = ProjectTopContext.Provider

const TAB_LABELS: Record<ProjectTab, string> = { content: "Content", research: "Research", promote: "Promote" }

/** The project's controls; nothing outside a project's page. */
export function ProjectControls() {
  const top = React.useContext(ProjectTopContext)
  const desktop = useWideScreen()
  if (!top) return null
  const tabs = (["content", "research", "promote"] as const).filter((tab) => !top.guest || tab !== "research")
  const choices = tabs.map((tab) => ({ value: tab, label: TAB_LABELS[tab] }))
  return (
    <>
      {top.guest ? null : <BackToProjects projectId={top.projectId} />}
      {/* Tabs from 1500px; a dropdown below it, where the list's own buttons need the room. */}
      {desktop ? (
        <span className="hidden shrink-0 items-center min-[1500px]:flex">
          <ProjectTabs value={top.tab} onValueChange={(next) => top.onTab(next as ProjectTab)} choices={choices} />
        </span>
      ) : null}
      <span className={desktop ? "flex shrink-0 min-[1500px]:hidden" : "flex shrink-0"}>
        <ViewMenu label="Which part of the project" value={top.tab} onValueChange={(next) => top.onTab(next as ProjectTab)} choices={choices} />
      </span>
    </>
  )
}

/**
 * The class that lets a header dropdown give way when the header is full,
 * cutting its words short: to 56px in a header narrower than 768px, as on a
 * phone, and 96px otherwise.
 */
export const SHRINKING_MENU =
  "flex min-w-14 shrink @3xl:min-w-24 [&_button]:max-w-none [&_button]:min-w-0 [&_button]:shrink [&_button]:overflow-hidden [&_button>span:first-child]:min-w-0"

/**
 * The tab's own dropdown, the first thing after the search icon on the right
 * of every list's header (`list-header.tsx`; Tyler, 27 Nov 2026, of "All items
 * 0 ⌄ Every kind ⌄": "This should be on the right side after search icon (same
 * goes for other tabs too)"). Nothing outside a project's page, or on a tab
 * with no choice of its own.
 */
export function ProjectSubChoice() {
  const top = React.useContext(ProjectTopContext)
  if (!top?.sub) return null
  return (
    <span className={SHRINKING_MENU}>
      <ViewMenu label={top.sub.label} value={top.sub.value} choices={top.sub.choices} onValueChange={top.sub.onChange} />
    </span>
  )
}

/** Whether this is a project's page, where Select goes into the project's ⋮. */
export function useInProject() {
  return React.useContext(ProjectTopContext) !== null
}

/** The list's Select, handed from its header to the project's ⋮ in the same header. */
type ListSelect = { on: boolean; onToggle: () => void } | null
const ListSelectContext = React.createContext<ListSelect>(null)
export const ListSelectProvider = ListSelectContext.Provider

/**
 * The project's ⋮, last in the middle's one header. Research hands it its own
 * settings as two more tabs, so there is one ⋮ (Tyler, 27 Nov 2026: "should
 * be merged"). Nothing outside a project's page.
 */
export function ProjectMenuButton(more: ProjectMenuMore) {
  const top = React.useContext(ProjectTopContext)
  // The Select of the list whose header this ⋮ ends (`ListHeader`), unless one is handed in.
  const select = React.useContext(ListSelectContext)
  return top ? <>{top.menu({ select, ...more })}</> : null
}

/** The arrow back to the Projects list, with this project's row open (Tyler, 12 Nov 2026: "put the arrow back again"). */
function BackToProjects({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-ml-1 shrink-0"
          aria-label="Back to the Projects list"
          onClick={() => void navigate({ to: "/admin/projects", search: { open: projectId } })}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Back to the Projects list</TooltipContent>
    </Tooltip>
  )
}
