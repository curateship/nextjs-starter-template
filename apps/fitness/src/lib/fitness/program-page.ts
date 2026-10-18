import { loadPhotoSessions } from "@/lib/api/fitness/photos"
import { loadProgram } from "@/lib/api/fitness/programs"
import { loadProgressPage } from "@/lib/api/fitness/progress"
import { loadWorkoutHistory, loadWorkoutPage } from "@/lib/api/fitness/workouts"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import type { ProgramView } from "@/lib/fitness/program-search"

/**
 * Everything one program's dashboard draws, gathered by its route's loader.
 *
 * The program itself (its week, rules, starting data and its routine type's
 * lifts) always loads. History, Progress and Photos load their own data only
 * while they are open, and a workout being logged loads while it is open.
 * Picking an exercise or a weekday never reloads the page.
 */
export async function loadProgramPage(input: { programId: string; view: ProgramView; workout?: string }) {
  const program = await loadProgram(input.programId)
  const person = program.program.mine ? undefined : program.program.userId
  const [viewData, workout] = await Promise.all([
    loadViewData(input.view, person),
    input.workout ? loadWorkoutPage(input.workout).catch(missingWorkout) : null,
  ])
  return { ...program, viewData, workout }
}

async function loadViewData(view: ProgramView, person: string | undefined) {
  switch (view) {
    case "history":
      return { view, history: await loadWorkoutHistory(person) } as const
    case "progress":
      return { view, progress: await loadProgressPage(person) } as const
    case "photos":
      return { view, photos: await loadPhotoSessions(person) } as const
    default:
      return { view } as const
  }
}

/**
 * A workout address that no longer opens, such as one thrown away after
 * nothing was ticked, shows the program as usual rather than an error page.
 * Any other failure still reaches the error page.
 */
function missingWorkout(error: unknown): null {
  if (error instanceof Error && error.message === FITNESS_ERRORS.workoutNotFound) return null
  throw error
}

export type ProgramPage = Awaited<ReturnType<typeof loadProgramPage>>
