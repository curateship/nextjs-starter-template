import { createFileRoute } from "@tanstack/react-router"

import { MyWork } from "@/components/project/my-work"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadMyWorkPage } from "@/lib/api/project/tasks"
import { getProjectErrorMessage } from "@/lib/project/errors"

type MyWorkSearch = { task?: string }

/** Every task assigned to me, across every project. */
export const Route = createFileRoute("/_authenticated/my-work")({
  validateSearch: (search: Record<string, unknown>): MyWorkSearch =>
    typeof search.task === "string" && search.task.length <= 36 ? { task: search.task } : {},
  loaderDeps: () => ({}),
  loader: () => loadMyWorkPage(),
  component: MyWorkRoute,
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})

function MyWorkRoute() {
  const { onTeam, tasks, invites } = Route.useLoaderData()
  const { task } = Route.useSearch()
  return <MyWork onTeam={onTeam} tasks={tasks} invites={invites} openTaskId={task} />
}
