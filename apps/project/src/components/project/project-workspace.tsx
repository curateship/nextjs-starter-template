import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { ProjectDetailsPanel } from "@/components/project/project-details-panel"
import { ProjectMembersPanel } from "@/components/project/project-members-panel"
import { ProjectTasksPanel } from "@/components/project/project-tasks-panel"
import { TaskDialog } from "@/components/project/task-dialog"
import {
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ProjectPage } from "@/lib/api/project/projects"
import {
  useBlankSpaceDoubleClick,
  usePanelCollapsed,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { PROJECT_PANEL_LAYOUT_KEY } from "@/lib/project/panel-keys"

type NarrowView = "tasks" | "details" | "members"

/**
 * The project page: details on the left, tasks in the middle, the project's
 * members on the right. Tyler asked for the four-panel dashboard without its
 * bottom panel; the layout is the CRM screen's (`crm-workspace.tsx`), which
 * already has three resizable panels and nothing along the bottom.
 *
 * The open task lives in the address (`?task=<id>`), so a bell notice can open
 * it and Back closes it.
 */
export function ProjectWorkspace({
  page,
  openTaskId,
}: {
  page: ProjectPage
  openTaskId: string | undefined
}) {
  const navigate = useNavigate()
  const wide = useWideScreen()
  const [memberFilter, setMemberFilter] = React.useState<string | null>(null)
  const [narrowView, setNarrowView] = React.useState<NarrowView>("tasks")

  const detailsRef = React.useRef<PanelImperativeHandle | null>(null)
  const membersRef = React.useRef<PanelImperativeHandle | null>(null)
  const layout = useRememberedPanelLayout(PROJECT_PANEL_LAYOUT_KEY)
  const details = usePanelCollapsed(detailsRef)
  const members = usePanelCollapsed(membersRef)
  const toggleDetails = usePanelToggle(detailsRef)
  const toggleMembers = usePanelToggle(membersRef)
  const detailsDoubleClick = useBlankSpaceDoubleClick(toggleDetails)
  const membersDoubleClick = useBlankSpaceDoubleClick(toggleMembers)

  // A member who leaves the project takes the filter with them.
  const filter =
    memberFilter && page.members.some((m) => m.userId === memberFilter) ? memberFilter : null

  const openTask = React.useCallback(
    (taskId: string | null) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next = { ...previous }
          if (taskId) next.task = taskId
          else delete next.task
          return next
        },
      })
    },
    [navigate]
  )

  const left = <ProjectDetailsPanel page={page} />
  const middle = (
    <ProjectTasksPanel
      page={page}
      memberFilter={filter}
      onClearFilter={() => setMemberFilter(null)}
      onOpenTask={openTask}
    />
  )
  const right = (
    <ProjectMembersPanel
      page={page}
      selectedUserId={filter}
      onSelect={(userId) => setMemberFilter((current) => (current === userId ? null : userId))}
    />
  )

  const dialog = (
    <TaskDialog taskId={openTaskId ?? null} onClose={() => openTask(null)} />
  )

  if (!wide) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <Tabs value={narrowView} onValueChange={(value) => setNarrowView(value as NarrowView)}>
          <TabsList>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
          </TabsList>
        </Tabs>
        <WorkspacePanel className="flex min-w-0 flex-1 flex-col">
          {narrowView === "tasks" ? middle : narrowView === "details" ? left : right}
        </WorkspacePanel>
        {dialog}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ResizablePanelGroup
        key={layout.layoutKey}
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <ResizablePanel
          id="details"
          panelRef={detailsRef}
          collapsible
          collapsedSize="0%"
          defaultSize="22%"
          minSize="16%"
          maxSize="36%"
          onResize={details.onResize}
        >
          <WorkspacePanel
            collapsed={details.collapsed}
            onDoubleClick={detailsDoubleClick}
            className="flex flex-col"
          >
            {left}
          </WorkspacePanel>
        </ResizablePanel>
        <ResizableHandle gap collapsed={details.collapsed} />
        <ResizablePanel id="tasks" defaultSize="54%" minSize="32%">
          <WorkspacePanel className="relative flex flex-col">
            {middle}
            {details.collapsed ? (
              <PanelReopenTab side="left" label="Show the project details" onClick={toggleDetails} />
            ) : null}
            {members.collapsed ? (
              <PanelReopenTab side="right" label="Show the members" onClick={toggleMembers} />
            ) : null}
          </WorkspacePanel>
        </ResizablePanel>
        <ResizableHandle gap collapsed={members.collapsed} />
        <ResizablePanel
          id="members"
          panelRef={membersRef}
          collapsible
          collapsedSize="0%"
          defaultSize="24%"
          minSize="16%"
          maxSize="36%"
          onResize={members.onResize}
        >
          <WorkspacePanel
            collapsed={members.collapsed}
            onDoubleClick={membersDoubleClick}
            className="flex flex-col"
          >
            {right}
          </WorkspacePanel>
        </ResizablePanel>
      </ResizablePanelGroup>
      {dialog}
    </div>
  )
}
