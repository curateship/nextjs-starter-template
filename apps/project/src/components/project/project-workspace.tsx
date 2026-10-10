import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { ProjectDetailsPanel } from "@/components/project/project-details-panel"
import { ProjectMembersPanel } from "@/components/project/project-members-panel"
import { ProjectTasksPanel } from "@/components/project/project-tasks-panel"
import { TaskDialog } from "@/components/project/task-dialog"
import { ThreePanels } from "@/components/project/three-panels"
import type { ProjectPage } from "@/lib/api/project/projects"
import { PROJECT_PANEL_LAYOUT_KEY } from "@/lib/project/panel-keys"

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
  const [memberFilter, setMemberFilter] = React.useState<string | null>(null)

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

  return (
    <ThreePanels
      layoutKey={PROJECT_PANEL_LAYOUT_KEY}
      left={{
        label: "Details",
        showLabel: "Show the project details",
        content: <ProjectDetailsPanel page={page} />,
      }}
      middle={{
        label: "Tasks",
        content: (
          <ProjectTasksPanel
            page={page}
            memberFilter={filter}
            onClearFilter={() => setMemberFilter(null)}
            onOpenTask={openTask}
          />
        ),
      }}
      right={{
        label: "Members",
        showLabel: "Show the members",
        content: (
          <ProjectMembersPanel
            page={page}
            selectedUserId={filter}
            onSelect={(userId) =>
              setMemberFilter((current) => (current === userId ? null : userId))
            }
          />
        ),
      }}
    >
      <TaskDialog taskId={openTaskId ?? null} onClose={() => openTask(null)} />
    </ThreePanels>
  )
}
