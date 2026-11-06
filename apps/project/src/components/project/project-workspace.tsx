import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"

import { ProjectDetailsPanel } from "@/components/project/project-details-panel"
import { PersonPages } from "@/components/project/person-pages"
import { ProjectTasksPanel } from "@/components/project/project-tasks-panel"
import { TaskSidePanel } from "@/components/project/task-side-panel"
import { ThreePanels } from "@/components/project/three-panels"
import type { ProjectPage } from "@/lib/api/project/projects"
import { useTaskAddress } from "@/lib/hooks/use-task-address"
import { PROJECT_PANEL_LAYOUT_KEY, projectOpenTaskKey } from "@/lib/project/panel-keys"
import type { TaskFilters } from "@/lib/project/task-filters"
import { useProjectLive } from "@/lib/project/use-project-live"
import { useRememberedTask } from "@/lib/project/use-remembered-task"

const PROJECT_ROUTE_ID = "/_authenticated/projects/$projectId"

/**
 * The project page: details on the left, tasks in the middle,
 * the open task on the right. Tyler asked for the four-panel dashboard
 * without its bottom panel; the layout is the CRM screen's
 * (`crm-workspace.tsx`), which already has three resizable panels and
 * nothing along the bottom. The task moved from the middle panel to the
 * right on 13 Oct 2026, from Tyler's drawing, so the Board stays in view
 * beside it.
 *
 * The open task lives in the address (`?task=<id>`), so a bell notice or a
 * pasted link opens it. So do the search and filters, including whose tasks
 * show, picked in the tasks panel's header.
 */
export function ProjectWorkspace({
  page,
  openTaskId,
  filters,
  openChat = false,
  openNoteId,
}: {
  page: ProjectPage
  openTaskId: string | undefined
  filters: TaskFilters
  /** A chat notice's link: open the Chat tab. */
  openChat?: boolean
  /** A # link to one of the project's notes: open it in the left panel. */
  openNoteId?: string
}) {
  const taskAddress = useTaskAddress()
  const navigate = useNavigate()
  const router = useRouter()
  // The right panel always holds a task: the one last open on this project in
  // this browser, or the list's first row on a first visit or once that task is
  // gone (Tyler, 6 Nov 2026: "it should always land on the first task on the
  // list"), the same rule as My dashboard.
  const [rows, setRows] = React.useState<string[] | null>(null)
  const quietTask = useRememberedTask({ storageKey: projectOpenTaskKey(page.project.id), taskId: openTaskId, ids: rows })

  // A task changed by someone else moves on the Board and List as it happens.
  // Only this page's own data reloads.
  const reloadBoard = React.useCallback(
    () => void router.invalidate({ filter: (match) => match.routeId === PROJECT_ROUTE_ID }),
    [router]
  )
  useProjectLive(page.project.id, (change) => change !== "chat", reloadBoard)

  // Opening a task reads its chat, so its card's "3 new" goes once it has loaded.
  const tasksRef = React.useRef(page.tasks)
  React.useEffect(() => {
    tasksRef.current = page.tasks
  }, [page.tasks])
  const taskLoaded = React.useCallback(
    (taskId: string) => {
      if (tasksRef.current.some((task) => task.id === taskId && task.unread > 0)) reloadBoard()
    },
    [reloadBoard]
  )

  const chatOpened = React.useCallback(
    () =>
      void navigate({
        to: ".",
        replace: true,
        search: (previous: Record<string, unknown>) => ({ ...previous, chat: undefined }),
      }),
    [navigate]
  )
  // The note opens once; the address then lets go of it, so the same link works again.
  const noteOpened = React.useCallback(
    () =>
      void navigate({
        to: ".",
        replace: true,
        search: (previous: Record<string, unknown>) => ({ ...previous, note: undefined }),
      }),
    [navigate]
  )
  const setFilters = React.useCallback(
    (patch: Partial<TaskFilters>) =>
      void navigate({
        to: ".",
        replace: true,
        search: (previous: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...previous, ...patch }
          for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
          return next
        },
      }),
    [navigate]
  )

  return (
    <PersonPages>
      <ThreePanels
        layoutKey={PROJECT_PANEL_LAYOUT_KEY}
        // A task opened on arrival leaves a narrow screen on the list.
        showRightFor={openTaskId === quietTask ? undefined : openTaskId}
        left={{
          label: "Details",
          showLabel: "Show the project details",
          content: <ProjectDetailsPanel page={page} openNoteId={openNoteId} onNoteOpened={noteOpened} />,
        }}
        middle={{
          label: "Tasks",
          content: (
            <ProjectTasksPanel
              page={page}
              filters={filters}
              onFilters={setFilters}
              onOpenTask={taskAddress.open}
              openTaskId={openTaskId}
              openChat={openChat}
              onChatOpened={chatOpened}
              onRows={setRows}
            />
          ),
        }}
        right={{
          label: "Task",
          showLabel: "Show the task",
          content: <TaskSidePanel taskId={openTaskId} onClose={taskAddress.back} onLoaded={taskLoaded} />,
        }}
      />
    </PersonPages>
  )
}
