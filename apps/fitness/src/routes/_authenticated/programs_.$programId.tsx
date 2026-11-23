import { createFileRoute } from "@tanstack/react-router"

import { ProgramDashboard } from "@/components/fitness/dashboard/program-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getFitnessErrorMessage } from "@/lib/fitness/errors"
import { pageTitleHead } from "@/lib/fitness/page-title"
import { loadProgramPage } from "@/lib/fitness/program-page"
import { readProgramSearch } from "@/lib/fitness/program-search"

/**
 * One program's three-panel dashboard. Picking a weekday or an item doesn't
 * reload the page under it; another view or a workout being opened does.
 */
export const Route = createFileRoute("/_authenticated/programs_/$programId")({
  validateSearch: readProgramSearch,
  loaderDeps: ({ search }) => ({ view: search.view ?? "day", workout: search.workout }),
  loader: ({ params, deps }) => loadProgramPage({ programId: params.programId, ...deps }),
  head: ({ loaderData, matches }) => pageTitleHead(loaderData?.program.name ?? "Program", matches),
  component: ProgramRoute,
  errorComponent: routeErrorComponent(getFitnessErrorMessage),
})

function ProgramRoute() {
  return <ProgramDashboard page={Route.useLoaderData()} search={Route.useSearch()} />
}
