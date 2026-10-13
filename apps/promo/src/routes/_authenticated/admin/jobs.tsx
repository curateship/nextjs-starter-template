import { createFileRoute } from "@tanstack/react-router"

import { JobsDashboard } from "@/components/social/jobs/jobs-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getJobsErrorMessage, loadJobs } from "@/lib/api/social/jobs"

/**
 * Jobs: whether the browser program is running, and every search, read,
 * comment and check it is running, waiting to run, or did lately. Last under
 * Projects in the left menu.
 */
export const Route = createFileRoute("/_authenticated/admin/jobs")({
  loader: () => loadJobs(),
  component: JobsRoute,
  errorComponent: routeErrorComponent(getJobsErrorMessage),
})

function JobsRoute() {
  return <JobsDashboard initial={Route.useLoaderData()} />
}
