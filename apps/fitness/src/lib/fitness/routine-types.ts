/**
 * The routine types a program can be.
 *
 * A program is only the container. Its routine type decides which fields and
 * dashboards apply, so a new type adds its own tables beside
 * `fitness_strength_settings` and its own screens, and never changes the
 * program itself. Only Strength training works today; the others show as
 * "coming soon" and cannot be picked.
 */
export const ROUTINE_TYPES = [
  {
    id: "strength",
    label: "Strength training",
    description: "Barbell, dumbbell and machine lifts with sets, reps and weights.",
    live: true,
  },
  {
    id: "calisthenics",
    label: "Calisthenics",
    description: "Bodyweight skills and progressions.",
    live: false,
  },
  {
    id: "running",
    label: "Running",
    description: "Distance, pace and interval plans.",
    live: false,
  },
  {
    id: "mobility",
    label: "Mobility",
    description: "Stretching and joint routines.",
    live: false,
  },
] as const

export type RoutineTypeId = (typeof ROUTINE_TYPES)[number]["id"]

export const ROUTINE_TYPE_IDS = ROUTINE_TYPES.map((type) => type.id) as [
  RoutineTypeId,
  ...RoutineTypeId[],
]

export function routineTypeLabel(id: string) {
  return ROUTINE_TYPES.find((type) => type.id === id)?.label ?? id
}

export function isLiveRoutineType(id: string) {
  return ROUTINE_TYPES.some((type) => type.id === id && type.live)
}
