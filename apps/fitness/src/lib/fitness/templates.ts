/**
 * Starter weeks a program can copy in one click, and the words used on the
 * starting-data form. Each template names the weekday every workout falls on;
 * the other weekdays are rest days.
 *
 * A template only names built-in lifts by slug. Copying one fills each lift's
 * weight from the lifter's starting data where it can: 75 out of 100 of their
 * estimated one-rep max, rounded to their plates.
 */

type TemplateExercise = {
  slug: string
  sets: number
  reps: number
  restSeconds: number
  /** Exercises that share a group are a superset. */
  group?: string
}

type PlanTemplate = {
  id: string
  label: string
  description: string
  /** One entry per workout day, 0 = Sunday. */
  days: readonly { weekday: number; name: string; exercises: readonly TemplateExercise[] }[]
}

const heavy = (slug: string, sets = 5, reps = 5): TemplateExercise => ({
  slug,
  sets,
  reps,
  restSeconds: 180,
})
const accessory = (slug: string, sets = 3, reps = 10, group?: string): TemplateExercise => ({
  slug,
  sets,
  reps,
  restSeconds: 90,
  group,
})

const dayA = [heavy("back-squat"), heavy("bench-press"), heavy("barbell-row")]
const dayB = [heavy("back-squat"), heavy("overhead-press"), heavy("deadlift", 1, 5)]
const push = [
  heavy("bench-press", 4, 6),
  heavy("overhead-press", 3, 8),
  accessory("incline-dumbbell-press"),
  accessory("lateral-raise", 3, 15, "a"),
  accessory("triceps-pushdown", 3, 12, "a"),
]
const pull = [
  heavy("deadlift", 3, 5),
  accessory("pull-up", 3, 8),
  accessory("seated-cable-row"),
  accessory("face-pull", 3, 15, "b"),
  accessory("dumbbell-curl", 3, 12, "b"),
]
const legs = [
  heavy("back-squat", 4, 6),
  accessory("romanian-deadlift", 3, 8),
  accessory("leg-press"),
  accessory("lying-leg-curl", 3, 12, "c"),
  accessory("standing-calf-raise", 3, 15, "c"),
]
const upper = [
  heavy("bench-press", 4, 6),
  heavy("barbell-row", 4, 6),
  accessory("seated-dumbbell-press"),
  accessory("lat-pulldown"),
  accessory("barbell-curl", 3, 12, "d"),
  accessory("skull-crusher", 3, 12, "d"),
]
const lower = [
  heavy("back-squat", 4, 6),
  accessory("romanian-deadlift", 3, 8),
  accessory("bulgarian-split-squat"),
  accessory("seated-leg-curl", 3, 12),
  accessory("plank", 3, 30),
]

export const PLAN_TEMPLATES: readonly PlanTemplate[] = [
  {
    id: "five-by-five",
    label: "5x5",
    description: "Five sets of five on the big lifts. Monday A, Wednesday B, Friday A.",
    days: [
      { weekday: 1, name: "Day A", exercises: dayA },
      { weekday: 3, name: "Day B", exercises: dayB },
      { weekday: 5, name: "Day A", exercises: dayA },
    ],
  },
  {
    id: "push-pull-legs",
    label: "Push Pull Legs",
    description: "Pushing muscles Monday, pulling muscles Wednesday, legs Friday.",
    days: [
      { weekday: 1, name: "Push", exercises: push },
      { weekday: 3, name: "Pull", exercises: pull },
      { weekday: 5, name: "Legs", exercises: legs },
    ],
  },
  {
    id: "upper-lower",
    label: "Upper Lower",
    description: "Upper body Monday and Thursday, lower body Tuesday and Friday.",
    days: [
      { weekday: 1, name: "Upper", exercises: upper },
      { weekday: 2, name: "Lower", exercises: lower },
      { weekday: 4, name: "Upper", exercises: upper },
      { weekday: 5, name: "Lower", exercises: lower },
    ],
  },
]

/** The share of an estimated one-rep max a template starts its sets at. */
export const TEMPLATE_START_SHARE = 0.75

export const GOALS = [
  { id: "strength", label: "Get stronger" },
  { id: "muscle", label: "Build muscle" },
  { id: "fat_loss", label: "Lose fat" },
  { id: "general", label: "Stay fit" },
] as const
export type GoalId = (typeof GOALS)[number]["id"]

export const EXPERIENCE = [
  { id: "beginner", label: "New, under a year" },
  { id: "intermediate", label: "One to three years" },
  { id: "advanced", label: "Over three years" },
] as const
export type ExperienceId = (typeof EXPERIENCE)[number]["id"]

export const MEASUREMENTS = [
  { key: "chestCm", label: "Chest" },
  { key: "waistCm", label: "Waist" },
  { key: "hipsCm", label: "Hips" },
  { key: "armCm", label: "Arm" },
  { key: "thighCm", label: "Thigh" },
] as const
export type MeasurementKey = (typeof MEASUREMENTS)[number]["key"]
