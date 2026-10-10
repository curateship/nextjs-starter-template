import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { TaskDialog } from "@/components/project/task-dialog"
import { TaskList } from "@/components/project/task-list"
import { TeamStart } from "@/components/project/team-start"
import { DashboardCardTabsHeader } from "@/components/shared/dashboard-card-header"
import { FeedCard } from "@/components/shared/feed-card"
import { Tabs, TabsCount, TabsTrigger } from "@/components/ui/tabs"
import type { TaskCard } from "@/lib/api/project/tasks"
import type { InviteForMe } from "@/lib/api/project/teams"

type Group = "open" | "done"

/**
 * Every task assigned to me, across every project, sorted by due date, with
 * tasks Waiting for my answer at the top. Done tasks sit under their own tab.
 */
export function MyWork({
  onTeam,
  tasks,
  invites,
  openTaskId,
}: {
  onTeam: boolean
  tasks: TaskCard[]
  invites: InviteForMe[]
  openTaskId: string | undefined
}) {
  const navigate = useNavigate()
  const [group, setGroup] = React.useState<Group>("open")

  if (!onTeam) return <TeamStart invites={invites} />

  const open = tasks.filter((task) => task.status !== "done")
  const done = tasks.filter((task) => task.status === "done")
  // The server already put Waiting first; keep that order ahead of the sort.
  const waiting = open.filter((task) => task.waiting)
  const rows = group === "open" ? open : done

  const setOpenTask = (taskId: string | null) =>
    void navigate({
      to: ".",
      search: (previous: Record<string, unknown>) => {
        const next = { ...previous }
        if (taskId) next.task = taskId
        else delete next.task
        return next
      },
    })

  return (
    <FeedCard className="shrink-0">
      <Tabs value={group} onValueChange={(value) => setGroup(value as Group)}>
        <DashboardCardTabsHeader>
          <TabsTrigger value="open">
            Open <TabsCount>{open.length}</TabsCount>
          </TabsTrigger>
          <TabsTrigger value="done">
            Done <TabsCount>{done.length}</TabsCount>
          </TabsTrigger>
        </DashboardCardTabsHeader>
      </Tabs>
      {group === "open" && waiting.length ? (
        <p className="border-b px-4 py-2 text-sm">
          {waiting.length === 1
            ? "1 task is waiting for you to accept it or hand it back."
            : `${waiting.length} tasks are waiting for you to accept them or hand them back.`}
        </p>
      ) : null}
      <TaskList
        tasks={rows}
        readOnly={false}
        showProject
        onOpenTask={(task) => setOpenTask(task.id)}
        emptyText={group === "open" ? "Nothing assigned to you right now." : "No finished tasks yet."}
      />
      <TaskDialog taskId={openTaskId ?? null} onClose={() => setOpenTask(null)} />
    </FeedCard>
  )
}
