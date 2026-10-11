import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { ProjectDetailsPanel } from "@/components/project/project-details-panel"
import { ProjectMembersPanel } from "@/components/project/project-members-panel"
import { ProjectTasksPanel } from "@/components/project/project-tasks-panel"
import { TaskInPlace } from "@/components/project/task-in-place"
import { ThreePanels } from "@/components/project/three-panels"
import type { ProjectPage } from "@/lib/api/project/projects"
import { useTaskAddress } from "@/lib/hooks/use-task-address"
import { PROJECT_PANEL_LAYOUT_KEY } from "@/lib/project/panel-keys"
import type { TaskFilters } from "@/lib/project/task-filters"

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
}: {
  page: ProjectPage
  openTaskId: string | undefined
  filters: TaskFilters
}) {
  const taskAddress = useTaskAddress()
  const navigate = useNavigate()
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
  )
}
