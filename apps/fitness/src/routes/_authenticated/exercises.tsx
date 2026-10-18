import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { ExercisesDashboard } from "@/components/fitness/exercises/exercises-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadExercises } from "@/lib/api/fitness/exercises"
import { getFitnessErrorMessage } from "@/lib/fitness/errors"
import { pageTitleHead } from "@/lib/fitness/page-title"
import { ROUTINE_TYPE_IDS, type RoutineTypeId } from "@/lib/fitness/routine-types"

type ExercisesSearch = {
  /** The lift open in its window, so a pasted link opens it. */
  open?: string
  /** The routine type the list is filtered to. Unset means Strength training. */
  type?: RoutineTypeId
}

function readSearch(search: Record<string, unknown>): ExercisesSearch {
  const result: ExercisesSearch = {}
  if (typeof search.open === "string" && /^[\w-]{1,36}$/.test(search.open)) result.open = search.open
  if ((ROUTINE_TYPE_IDS as readonly unknown[]).includes(search.type)) result.type = search.type as RoutineTypeId
  return result
}

/** The Exercises dashboard: the library, filtered by routine type. */
export const Route = createFileRoute("/_authenticated/exercises")({
  validateSearch: readSearch,
  // Opening a lift or changing the filter doesn't reload the list.
  loaderDeps: () => ({}),
  loader: () => loadExercises(),
  head: ({ matches }) => pageTitleHead("Exercises", matches),
  component: ExercisesRoute,
  errorComponent: routeErrorComponent(getFitnessErrorMessage),
})

function ExercisesRoute() {
  const exercises = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <ExercisesDashboard
      exercises={exercises}
      routineType={search.type ?? "strength"}
      openId={search.open}
      onRoutineType={(type) =>
        void navigate({ search: (current) => ({ ...current, type: type === "strength" ? undefined : type }), replace: true })
      }
      // Opening a lift adds to history so Back closes it; closing replaces.
      onOpen={(open) => void navigate({ search: (current) => ({ ...current, open }), replace: !open })}
    />
  )
}
