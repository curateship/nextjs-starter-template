import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"

import { ProjectDetailsPanel } from "@/components/project/project-details-panel"
import { PersonPages } from "@/components/project/person-pages"
import { ProjectMembersPanel } from "@/components/project/project-members-panel"
import { ProjectTasksPanel } from "@/components/project/project-tasks-panel"
import { TaskInPlace } from "@/components/project/task-in-place"
import { ThreePanels } from "@/components/project/three-panels"
import type { ProjectPage } from "@/lib/api/project/projects"
import { useTaskAddress } from "@/lib/hooks/use-task-address"
import { PROJECT_PANEL_LAYOUT_KEY } from "@/lib/project/panel-keys"
import type { TaskFilters } from "@/lib/project/task-filters"
import { useProjectLive } from "@/lib/project/use-project-live"
import { useReloadAfterReading } from "@/lib/project/use-reload-after-reading"

const PROJECT_ROUTE_ID = "/_authenticated/projects/$projectId"

/**
 * The project page: details on the left, tasks in the middle, the project's
 * members on the right. Tyler asked for the four-panel dashboard without its
 * bottom panel; the layout is the CRM screen's (`crm-workspace.tsx`), which
 * already has three resizable panels and nothing along the bottom.
 *
 * A task opens in the middle panel, in the Board or List's place, and Back
 * returns to them as they were. The open task lives in the address
 * (`?task=<id>`), so a bell notice or a pasted link opens it. So do the
 * search and filters, and clicking a member is the Person filter.
 */
export function ProjectWorkspace({
  page,
  openTaskId,
  filters,
  openChat = false,
}: {
  page: ProjectPage
  openTaskId: string | undefined
  filters: TaskFilters
  /** A chat notice's link: open the Chat tab. */
  openChat?: boolean
}) {
  const taskAddress = useTaskAddress()
  const navigate = useNavigate()
  const router = useRouter()

  // A task changed by someone else moves on the Board and List as it happens.
  // Only this page's own data reloads. While a task covers the Board, the
  // reload waits for Back, so an open chat isn't slowed by a Board nobody sees.
  const boardStale = React.useRef(false)
  const reloadBoard = React.useCallback(
    () => void router.invalidate({ filter: (match) => match.routeId === PROJECT_ROUTE_ID }),
    [router]
  )
  useProjectLive(
    page.project.id,
    (change) => change !== "chat",
    () => {
      if (openTaskId) boardStale.current = true
      else reloadBoard()
    }
  )
  React.useEffect(() => {
    if (openTaskId || !boardStale.current) return
    boardStale.current = false
    reloadBoard()
  }, [openTaskId, reloadBoard])
  useReloadAfterReading(openTaskId, page.tasks, reloadBoard)

  const chatOpened = React.useCallback(
    () =>
      void navigate({
        to: ".",
        replace: true,
        search: (previous: Record<string, unknown>) => ({ ...previous, chat: undefined }),
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
        showMiddleFor={openTaskId}
        left={{
          label: "Details",
          showLabel: "Show the project details",
          content: <ProjectDetailsPanel page={page} />,
        }}
        middle={{
          label: "Tasks",
          content: (
            <TaskInPlace taskId={openTaskId} onBack={taskAddress.back}>
              <ProjectTasksPanel
                page={page}
                filters={filters}
                onFilters={setFilters}
                onOpenTask={taskAddress.open}
                openChat={openChat}
                onChatOpened={chatOpened}
              />
            </TaskInPlace>
          ),
        }}
        right={{
          label: "Members",
          showLabel: "Show the members",
          content: (
            <ProjectMembersPanel
              page={page}
              selectedUserId={filters.person ?? null}
              onSelect={(userId) =>
                setFilters({ person: filters.person === userId ? undefined : userId })
              }
            />
          ),
        }}
      />
    </PersonPages>
  )
}
