import type { Exercise } from "@/lib/api/fitness/exercises"
import type { Equipment, Movement, Muscle } from "@/lib/fitness/exercise-catalog"
import type { RoutineTypeId } from "@/lib/fitness/routine-types"

/** A lift of the person's own as it is being typed, before it is saved. */
export type ExerciseDraft = {
  name: string
  routineType: RoutineTypeId
  muscles: Muscle[]
  equipment: Equipment[]
  movement: Movement
  isBodyweight: boolean
  pictureUrl: string
}

/** The draft for an existing lift, or a blank one of `routineType` for a new lift. */
export function draftOf(exercise: Exercise | null, routineType: RoutineTypeId = "strength"): ExerciseDraft {
  return {
    name: exercise?.name ?? "",
    routineType: (exercise?.routineType as RoutineTypeId | undefined) ?? routineType,
    muscles: exercise?.muscles ?? [],
    equipment: exercise?.equipment ?? [],
    movement: exercise?.movement ?? "push",
    isBodyweight: exercise?.isBodyweight ?? false,
    pictureUrl: exercise?.pictureUrl ?? "",
  }
}
