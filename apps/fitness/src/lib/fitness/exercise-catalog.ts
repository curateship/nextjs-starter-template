/**
 * The exercise library's fixed words and the lifts every account starts with.
 *
 * The built-in lifts are loaded into `fitness_exercises` by a migration, keyed
 * by `slug`, so a plan or a logged set points at one row however the name is
 * later spelled. This list is also what that migration was written from, and
 * the test beside it checks the two still agree.
 */

export const MUSCLES = [
  "chest",
  "upper_back",
  "lats",
  "traps",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "lower_back",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
] as const
export type Muscle = (typeof MUSCLES)[number]

export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: "Chest",
  upper_back: "Upper back",
  lats: "Lats",
  traps: "Traps",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  lower_back: "Lower back",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
}

export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "kettlebell",
  "machine",
  "cable",
  "smith_machine",
  "ez_bar",
  "trap_bar",
  "band",
  "pull_up_bar",
  "dip_bars",
  "bench",
  "bodyweight",
] as const
export type Equipment = (typeof EQUIPMENT)[number]

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbells",
  kettlebell: "Kettlebell",
  machine: "Machine",
  cable: "Cable",
  smith_machine: "Smith machine",
  ez_bar: "EZ bar",
  trap_bar: "Trap bar",
  band: "Band",
  pull_up_bar: "Pull-up bar",
  dip_bars: "Dip bars",
  bench: "Bench",
  bodyweight: "Nothing",
}

export const MOVEMENTS = [
  "push",
  "pull",
  "squat",
  "hinge",
  "lunge",
  "carry",
  "core",
  "isolation",
] as const
export type Movement = (typeof MOVEMENTS)[number]

export const MOVEMENT_LABELS: Record<Movement, string> = {
  push: "Push",
  pull: "Pull",
  squat: "Squat",
  hinge: "Hinge",
  lunge: "Lunge",
  carry: "Carry",
  core: "Core",
  isolation: "Single muscle",
}

type CatalogExercise = {
  slug: string
  name: string
  /** The muscles that do most of the work, the main one first. */
  muscles: readonly Muscle[]
  /** What it needs. A bench press needs a barbell and a bench. */
  equipment: readonly Equipment[]
  movement: Movement
  /**
   * The lifter's own body is the weight, so a logged set is bodyweight plus
   * whatever hangs from a belt or sits in a vest.
   */
  bodyweight?: boolean
}

function lift(
  slug: string,
  name: string,
  muscles: readonly Muscle[],
  equipment: readonly Equipment[],
  movement: Movement,
  bodyweight = false
): CatalogExercise {
  return { slug, name, muscles, equipment, movement, bodyweight }
}

export const EXERCISE_CATALOG: readonly CatalogExercise[] = [
  // Squat
  lift("back-squat", "Back squat", ["quads", "glutes", "lower_back"], ["barbell"], "squat"),
  lift("front-squat", "Front squat", ["quads", "glutes", "abs"], ["barbell"], "squat"),
  lift("box-squat", "Box squat", ["glutes", "quads", "hamstrings"], ["barbell", "bench"], "squat"),
  lift("goblet-squat", "Goblet squat", ["quads", "glutes"], ["dumbbell"], "squat"),
  lift("kettlebell-goblet-squat", "Kettlebell goblet squat", ["quads", "glutes"], ["kettlebell"], "squat"),
  lift("smith-machine-squat", "Smith machine squat", ["quads", "glutes"], ["smith_machine"], "squat"),
  lift("hack-squat", "Hack squat", ["quads", "glutes"], ["machine"], "squat"),
  lift("leg-press", "Leg press", ["quads", "glutes"], ["machine"], "squat"),
  lift("belt-squat", "Belt squat", ["quads", "glutes"], ["machine"], "squat"),
  lift("bodyweight-squat", "Bodyweight squat", ["quads", "glutes"], ["bodyweight"], "squat", true),
  lift("pistol-squat", "Pistol squat", ["quads", "glutes"], ["bodyweight"], "squat", true),

  // Hinge
  lift("deadlift", "Deadlift", ["hamstrings", "glutes", "lower_back"], ["barbell"], "hinge"),
  lift("sumo-deadlift", "Sumo deadlift", ["glutes", "quads", "hamstrings"], ["barbell"], "hinge"),
  lift("trap-bar-deadlift", "Trap bar deadlift", ["quads", "glutes", "hamstrings"], ["trap_bar"], "hinge"),
  lift("romanian-deadlift", "Romanian deadlift", ["hamstrings", "glutes", "lower_back"], ["barbell"], "hinge"),
  lift("dumbbell-romanian-deadlift", "Dumbbell Romanian deadlift", ["hamstrings", "glutes"], ["dumbbell"], "hinge"),
  lift("stiff-leg-deadlift", "Stiff-leg deadlift", ["hamstrings", "lower_back"], ["barbell"], "hinge"),
  lift("rack-pull", "Rack pull", ["lower_back", "traps", "glutes"], ["barbell"], "hinge"),
  lift("good-morning", "Good morning", ["hamstrings", "lower_back"], ["barbell"], "hinge"),
  lift("hip-thrust", "Hip thrust", ["glutes", "hamstrings"], ["barbell", "bench"], "hinge"),
  lift("glute-bridge", "Glute bridge", ["glutes"], ["bodyweight"], "hinge", true),
  lift("kettlebell-swing", "Kettlebell swing", ["glutes", "hamstrings"], ["kettlebell"], "hinge"),
  lift("back-extension", "Back extension", ["lower_back", "glutes"], ["machine"], "hinge", true),
  lift("cable-pull-through", "Cable pull-through", ["glutes", "hamstrings"], ["cable"], "hinge"),
  lift("power-clean", "Power clean", ["glutes", "traps", "quads"], ["barbell"], "hinge"),

  // Lunge
  lift("walking-lunge", "Walking lunge", ["quads", "glutes"], ["dumbbell"], "lunge"),
  lift("reverse-lunge", "Reverse lunge", ["glutes", "quads"], ["dumbbell"], "lunge"),
  lift("barbell-lunge", "Barbell lunge", ["quads", "glutes"], ["barbell"], "lunge"),
  lift("bulgarian-split-squat", "Bulgarian split squat", ["quads", "glutes"], ["dumbbell", "bench"], "lunge"),
  lift("step-up", "Step-up", ["quads", "glutes"], ["dumbbell", "bench"], "lunge"),
  lift("bodyweight-lunge", "Bodyweight lunge", ["quads", "glutes"], ["bodyweight"], "lunge", true),

  // Horizontal push
  lift("bench-press", "Bench press", ["chest", "triceps", "shoulders"], ["barbell", "bench"], "push"),
  lift("incline-bench-press", "Incline bench press", ["chest", "shoulders", "triceps"], ["barbell", "bench"], "push"),
  lift("decline-bench-press", "Decline bench press", ["chest", "triceps"], ["barbell", "bench"], "push"),
  lift("close-grip-bench-press", "Close-grip bench press", ["triceps", "chest"], ["barbell", "bench"], "push"),
  lift("paused-bench-press", "Paused bench press", ["chest", "triceps", "shoulders"], ["barbell", "bench"], "push"),
  lift("dumbbell-bench-press", "Dumbbell bench press", ["chest", "triceps", "shoulders"], ["dumbbell", "bench"], "push"),
  lift("incline-dumbbell-press", "Incline dumbbell press", ["chest", "shoulders"], ["dumbbell", "bench"], "push"),
  lift("smith-machine-bench-press", "Smith machine bench press", ["chest", "triceps"], ["smith_machine", "bench"], "push"),
  lift("machine-chest-press", "Machine chest press", ["chest", "triceps"], ["machine"], "push"),
  lift("push-up", "Push-up", ["chest", "triceps", "shoulders"], ["bodyweight"], "push", true),
  lift("dip", "Dip", ["chest", "triceps"], ["dip_bars"], "push", true),
  lift("floor-press", "Floor press", ["triceps", "chest"], ["barbell"], "push"),

  // Vertical push
  lift("overhead-press", "Overhead press", ["shoulders", "triceps"], ["barbell"], "push"),
  lift("push-press", "Push press", ["shoulders", "triceps", "quads"], ["barbell"], "push"),
  lift("seated-dumbbell-press", "Seated dumbbell shoulder press", ["shoulders", "triceps"], ["dumbbell", "bench"], "push"),
  lift("arnold-press", "Arnold press", ["shoulders", "triceps"], ["dumbbell"], "push"),
  lift("machine-shoulder-press", "Machine shoulder press", ["shoulders", "triceps"], ["machine"], "push"),
  lift("landmine-press", "Landmine press", ["shoulders", "chest"], ["barbell"], "push"),
  lift("pike-push-up", "Pike push-up", ["shoulders", "triceps"], ["bodyweight"], "push", true),

  // Vertical pull
  lift("pull-up", "Pull-up", ["lats", "biceps", "upper_back"], ["pull_up_bar"], "pull", true),
  lift("chin-up", "Chin-up", ["lats", "biceps"], ["pull_up_bar"], "pull", true),
  lift("lat-pulldown", "Lat pulldown", ["lats", "biceps"], ["cable"], "pull"),
  lift("close-grip-pulldown", "Close-grip pulldown", ["lats", "biceps"], ["cable"], "pull"),
  lift("assisted-pull-up", "Assisted pull-up", ["lats", "biceps"], ["machine"], "pull"),
  lift("straight-arm-pulldown", "Straight-arm pulldown", ["lats"], ["cable"], "isolation"),

  // Horizontal pull
  lift("barbell-row", "Barbell row", ["upper_back", "lats", "biceps"], ["barbell"], "pull"),
  lift("pendlay-row", "Pendlay row", ["upper_back", "lats"], ["barbell"], "pull"),
  lift("dumbbell-row", "One-arm dumbbell row", ["lats", "upper_back", "biceps"], ["dumbbell", "bench"], "pull"),
  lift("chest-supported-row", "Chest-supported row", ["upper_back", "lats"], ["dumbbell", "bench"], "pull"),
  lift("seated-cable-row", "Seated cable row", ["upper_back", "lats", "biceps"], ["cable"], "pull"),
  lift("t-bar-row", "T-bar row", ["upper_back", "lats"], ["barbell"], "pull"),
  lift("machine-row", "Machine row", ["upper_back", "lats"], ["machine"], "pull"),
  lift("inverted-row", "Inverted row", ["upper_back", "biceps"], ["barbell"], "pull", true),
  lift("face-pull", "Face pull", ["shoulders", "upper_back"], ["cable"], "pull"),
  lift("band-pull-apart", "Band pull-apart", ["shoulders", "upper_back"], ["band"], "isolation"),

  // Shoulders
  lift("lateral-raise", "Lateral raise", ["shoulders"], ["dumbbell"], "isolation"),
  lift("cable-lateral-raise", "Cable lateral raise", ["shoulders"], ["cable"], "isolation"),
  lift("front-raise", "Front raise", ["shoulders"], ["dumbbell"], "isolation"),
  lift("rear-delt-fly", "Rear delt fly", ["shoulders", "upper_back"], ["dumbbell"], "isolation"),
  lift("reverse-pec-deck", "Reverse pec deck", ["shoulders", "upper_back"], ["machine"], "isolation"),
  lift("upright-row", "Upright row", ["shoulders", "traps"], ["barbell"], "pull"),
  lift("barbell-shrug", "Barbell shrug", ["traps"], ["barbell"], "isolation"),
  lift("dumbbell-shrug", "Dumbbell shrug", ["traps"], ["dumbbell"], "isolation"),

  // Chest
  lift("dumbbell-fly", "Dumbbell fly", ["chest"], ["dumbbell", "bench"], "isolation"),
  lift("cable-fly", "Cable fly", ["chest"], ["cable"], "isolation"),
  lift("pec-deck", "Pec deck", ["chest"], ["machine"], "isolation"),

  // Arms
  lift("barbell-curl", "Barbell curl", ["biceps", "forearms"], ["barbell"], "isolation"),
  lift("ez-bar-curl", "EZ bar curl", ["biceps"], ["ez_bar"], "isolation"),
  lift("dumbbell-curl", "Dumbbell curl", ["biceps"], ["dumbbell"], "isolation"),
  lift("hammer-curl", "Hammer curl", ["biceps", "forearms"], ["dumbbell"], "isolation"),
  lift("incline-dumbbell-curl", "Incline dumbbell curl", ["biceps"], ["dumbbell", "bench"], "isolation"),
  lift("preacher-curl", "Preacher curl", ["biceps"], ["ez_bar", "bench"], "isolation"),
  lift("cable-curl", "Cable curl", ["biceps"], ["cable"], "isolation"),
  lift("triceps-pushdown", "Triceps pushdown", ["triceps"], ["cable"], "isolation"),
  lift("overhead-triceps-extension", "Overhead triceps extension", ["triceps"], ["dumbbell"], "isolation"),
  lift("skull-crusher", "Skull crusher", ["triceps"], ["ez_bar", "bench"], "isolation"),
  lift("cable-overhead-extension", "Cable overhead triceps extension", ["triceps"], ["cable"], "isolation"),
  lift("wrist-curl", "Wrist curl", ["forearms"], ["dumbbell"], "isolation"),

  // Legs, single muscle
  lift("leg-extension", "Leg extension", ["quads"], ["machine"], "isolation"),
  lift("lying-leg-curl", "Lying leg curl", ["hamstrings"], ["machine"], "isolation"),
  lift("seated-leg-curl", "Seated leg curl", ["hamstrings"], ["machine"], "isolation"),
  lift("nordic-curl", "Nordic curl", ["hamstrings"], ["bodyweight"], "isolation", true),
  lift("standing-calf-raise", "Standing calf raise", ["calves"], ["machine"], "isolation"),
  lift("seated-calf-raise", "Seated calf raise", ["calves"], ["machine"], "isolation"),
  lift("hip-abduction", "Hip abduction", ["glutes"], ["machine"], "isolation"),
  lift("cable-kickback", "Cable glute kickback", ["glutes"], ["cable"], "isolation"),

  // Core and carries
  lift("plank", "Plank", ["abs"], ["bodyweight"], "core", true),
  lift("hanging-leg-raise", "Hanging leg raise", ["abs"], ["pull_up_bar"], "core", true),
  lift("cable-crunch", "Cable crunch", ["abs"], ["cable"], "core"),
  lift("ab-wheel-rollout", "Ab wheel rollout", ["abs"], ["bodyweight"], "core", true),
  lift("pallof-press", "Pallof press", ["abs"], ["cable"], "core"),
  lift("russian-twist", "Russian twist", ["abs"], ["bodyweight"], "core", true),
  lift("farmers-carry", "Farmer's carry", ["forearms", "traps", "abs"], ["dumbbell"], "carry"),
  lift("suitcase-carry", "Suitcase carry", ["abs", "forearms"], ["kettlebell"], "carry"),
]
