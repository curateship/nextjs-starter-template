import { createFileRoute } from "@tanstack/react-router"

import { ProgramsDashboard } from "@/components/fitness/programs/programs-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadClientName } from "@/lib/api/fitness/coaching"
import { loadProgramsPage } from "@/lib/api/fitness/programs"
import { getFitnessErrorMessage } from "@/lib/fitness/errors"
import { pageTitleHead } from "@/lib/fitness/page-title"

const ID = /^[\w-]{1,36}$/

type ProgramsSearch = {
  /** A client's id, when their coach is looking at their programs. */
  person?: string
}

function readSearch(search: Record<string, unknown>): ProgramsSearch {
  return typeof search.person === "string" && ID.test(search.person) ? { person: search.person } : {}
}

/**
 * The Programs dashboard: every program, the New program window, coach
 * requests and, for a coach, their clients. Opening a program goes to its own
 * three-panel dashboard at `/programs/<id>`.
 */
export const Route = createFileRoute("/_authenticated/programs")({
  validateSearch: readSearch,
  loaderDeps: ({ search }) => ({ person: search.person }),
  loader: async ({ deps }) => {
    const [page, clientName] = await Promise.all([
      loadProgramsPage(deps.person),
      deps.person ? loadClientName(deps.person) : null,
    ])
    return { page, clientName }
  },
  head: ({ matches }) => pageTitleHead("Programs", matches),
  component: ProgramsRoute,
  errorComponent: routeErrorComponent(getFitnessErrorMessage),
})

function ProgramsRoute() {
  const { page, clientName } = Route.useLoaderData()
  return <ProgramsDashboard page={page} clientName={clientName} />
}
