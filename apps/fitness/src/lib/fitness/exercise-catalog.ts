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

/**
 * The body parts a day's exercises are grouped under (Tyler, 20 Oct 2026).
 * A lift's body part is never typed in: it comes from its main muscle, the
 * first in its list, so every lift has one, built-in or your own.
 */
export const BODY_PARTS = ["chest", "back", "shoulders", "arms", "core", "legs", "other"] as const
export type BodyPart = (typeof BODY_PARTS)[number]

export const BODY_PART_LABELS: Record<BodyPart, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  arms: "Arms",
  core: "Core",
  legs: "Legs",
  other: "Other",
}

const BODY_PART_OF_MUSCLE: Record<Muscle, BodyPart> = {
  chest: "chest",
  upper_back: "back",
  lats: "back",
  traps: "back",
  lower_back: "back",
  shoulders: "shoulders",
  biceps: "arms",
  triceps: "arms",
  forearms: "arms",
  abs: "core",
  glutes: "legs",
  quads: "legs",
  hamstrings: "legs",
  calves: "legs",
}

/** The muscles whose lifts file under a body part, for narrowing a list to it. */
export function musclesOfBodyPart(part: BodyPart): Muscle[] {
  return MUSCLES.filter((muscle) => BODY_PART_OF_MUSCLE[muscle] === part)
}

/** A lift's body part, from its main muscle. A lift with no muscle set is Other. */
export function bodyPartOf(muscles: readonly string[]): BodyPart {
  const main = muscles[0] as Muscle | undefined
  return (main && BODY_PART_OF_MUSCLE[main]) || "other"
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
  "rings",
  "parallettes",
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
  rings: "Rings",
  parallettes: "Parallettes",
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
  /** The routine type it belongs to. Strength training unless it says otherwise. */
  routineType: "strength" | "calisthenics"
  /** A Calisthenics move's next harder version, by slug: knee push-up to push-up. */
  harder?: string
  /** A hold, such as a plank, logged in seconds rather than reps. */
  timed?: boolean
}

function lift(
  slug: string,
  name: string,
  muscles: readonly Muscle[],
  equipment: readonly Equipment[],
  movement: Movement,
  bodyweight = false
): CatalogExercise {
  return { slug, name, muscles, equipment, movement, bodyweight, routineType: "strength" }
}

/**
 * A Calisthenics move. Its weight is the body, never counted: progress is
 * more reps, then the next harder version (Tyler, 21 Oct 2026: "Reps, then the
 * next version").
 */
function move(
  slug: string,
  name: string,
  muscles: readonly Muscle[],
  equipment: readonly Equipment[],
  movement: Movement,
  { harder, timed = false }: { harder?: string; timed?: boolean } = {}
): CatalogExercise {
  return { slug, name, muscles, equipment, movement, routineType: "calisthenics", harder, timed }
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

  // Calisthenics, each ladder from easiest to hardest.
  // Push-up ladder
  move("cal-wall-push-up", "Wall push-up", ["chest", "triceps", "shoulders"], ["bodyweight"], "push", { harder: "cal-incline-push-up" }),
  move("cal-incline-push-up", "Incline push-up", ["chest", "triceps", "shoulders"], ["bench"], "push", { harder: "cal-knee-push-up" }),
  move("cal-knee-push-up", "Knee push-up", ["chest", "triceps", "shoulders"], ["bodyweight"], "push", { harder: "cal-push-up" }),
  move("cal-push-up", "Push-up", ["chest", "triceps", "shoulders"], ["bodyweight"], "push", { harder: "cal-decline-push-up" }),
  move("cal-decline-push-up", "Decline push-up", ["chest", "shoulders", "triceps"], ["bench"], "push", { harder: "cal-archer-push-up" }),
  move("cal-archer-push-up", "Archer push-up", ["chest", "triceps", "shoulders"], ["bodyweight"], "push", { harder: "cal-one-arm-push-up" }),
  move("cal-one-arm-push-up", "One-arm push-up", ["chest", "triceps", "abs"], ["bodyweight"], "push"),
  // Overhead push ladder
  move("cal-pike-push-up", "Pike push-up", ["shoulders", "triceps"], ["bodyweight"], "push", { harder: "cal-elevated-pike-push-up" }),
  move("cal-elevated-pike-push-up", "Elevated pike push-up", ["shoulders", "triceps"], ["bench"], "push", { harder: "cal-wall-handstand-push-up" }),
  move("cal-wall-handstand-push-up", "Wall handstand push-up", ["shoulders", "triceps"], ["bodyweight"], "push"),
  // Dip ladder
  move("cal-bench-dip", "Bench dip", ["triceps", "chest"], ["bench"], "push", { harder: "cal-negative-dip" }),
  move("cal-negative-dip", "Slow lowering dip", ["triceps", "chest"], ["dip_bars"], "push", { harder: "cal-dip" }),
  move("cal-dip", "Dip", ["triceps", "chest", "shoulders"], ["dip_bars"], "push", { harder: "cal-ring-dip" }),
  move("cal-ring-dip", "Ring dip", ["triceps", "chest", "shoulders"], ["rings"], "push"),
  // Pull-up ladder
  move("cal-scapular-pull-up", "Scapular pull-up", ["upper_back", "lats"], ["pull_up_bar"], "pull", { harder: "cal-negative-pull-up" }),
  move("cal-negative-pull-up", "Slow lowering pull-up", ["lats", "biceps", "upper_back"], ["pull_up_bar"], "pull", { harder: "cal-pull-up" }),
  move("cal-pull-up", "Pull-up", ["lats", "biceps", "upper_back"], ["pull_up_bar"], "pull", { harder: "cal-chest-to-bar-pull-up" }),
  move("cal-chest-to-bar-pull-up", "Chest-to-bar pull-up", ["lats", "upper_back", "biceps"], ["pull_up_bar"], "pull", { harder: "cal-archer-pull-up" }),
  move("cal-archer-pull-up", "Archer pull-up", ["lats", "biceps", "upper_back"], ["pull_up_bar"], "pull"),
  // Row ladder
  move("cal-incline-row", "Incline ring row", ["upper_back", "lats", "biceps"], ["rings"], "pull", { harder: "cal-inverted-row" }),
  move("cal-inverted-row", "Inverted row", ["upper_back", "lats", "biceps"], ["rings"], "pull", { harder: "cal-feet-elevated-row" }),
  move("cal-feet-elevated-row", "Feet-up inverted row", ["upper_back", "lats", "biceps"], ["rings"], "pull"),
  // Squat ladder
  move("cal-assisted-squat", "Assisted squat", ["quads", "glutes"], ["bodyweight"], "squat", { harder: "cal-squat" }),
  move("cal-squat", "Bodyweight squat", ["quads", "glutes"], ["bodyweight"], "squat", { harder: "cal-split-squat" }),
  move("cal-split-squat", "Split squat", ["quads", "glutes"], ["bodyweight"], "lunge", { harder: "cal-bulgarian-split-squat" }),
  move("cal-bulgarian-split-squat", "Rear-foot-up split squat", ["quads", "glutes"], ["bench"], "lunge", { harder: "cal-shrimp-squat" }),
  move("cal-shrimp-squat", "Shrimp squat", ["quads", "glutes"], ["bodyweight"], "squat", { harder: "cal-pistol-squat" }),
  move("cal-pistol-squat", "Pistol squat", ["quads", "glutes"], ["bodyweight"], "squat"),
  // Hip and calf ladders
  move("cal-glute-bridge", "Glute bridge", ["glutes", "hamstrings"], ["bodyweight"], "hinge", { harder: "cal-single-leg-glute-bridge" }),
  move("cal-single-leg-glute-bridge", "Single-leg glute bridge", ["glutes", "hamstrings"], ["bodyweight"], "hinge"),
  move("cal-calf-raise", "Calf raise", ["calves"], ["bodyweight"], "isolation", { harder: "cal-single-leg-calf-raise" }),
  move("cal-single-leg-calf-raise", "Single-leg calf raise", ["calves"], ["bodyweight"], "isolation"),
  // Core ladders
  move("cal-lying-knee-raise", "Lying knee raise", ["abs"], ["bodyweight"], "core", { harder: "cal-hanging-knee-raise" }),
  move("cal-hanging-knee-raise", "Hanging knee raise", ["abs"], ["pull_up_bar"], "core", { harder: "cal-hanging-leg-raise" }),
  move("cal-hanging-leg-raise", "Hanging leg raise", ["abs"], ["pull_up_bar"], "core", { harder: "cal-toes-to-bar" }),
  move("cal-toes-to-bar", "Toes to bar", ["abs", "lats"], ["pull_up_bar"], "core"),
  // Holds, in seconds
  move("cal-plank", "Plank", ["abs"], ["bodyweight"], "core", { timed: true, harder: "cal-long-lever-plank" }),
  move("cal-long-lever-plank", "Long-lever plank", ["abs"], ["bodyweight"], "core", { timed: true }),
  move("cal-hollow-hold", "Hollow body hold", ["abs"], ["bodyweight"], "core", { timed: true }),
  move("cal-tuck-l-sit", "Tuck L-sit", ["abs", "triceps"], ["parallettes"], "core", { timed: true, harder: "cal-one-leg-l-sit" }),
  move("cal-one-leg-l-sit", "One-leg L-sit", ["abs", "triceps"], ["parallettes"], "core", { timed: true, harder: "cal-l-sit" }),
  move("cal-l-sit", "L-sit", ["abs", "triceps", "quads"], ["parallettes"], "core", { timed: true }),
  move("cal-dead-hang", "Dead hang", ["forearms", "lats"], ["pull_up_bar"], "pull", { timed: true }),
]

/** A built-in move's next harder version, or null at the top of its ladder or for a lift with none. */
export function harderVersionOf(slug: string | null): string | null {
  if (!slug) return null
  return EXERCISE_CATALOG.find((exercise) => exercise.slug === slug)?.harder ?? null
}

/** Every slug in a move's ladder, easiest first: the move, the ones before it and the ones after. */
export function ladderOf(slug: string): string[] {
  let first = slug
  for (;;) {
    const easier = EXERCISE_CATALOG.find((exercise) => exercise.harder === first)
    if (!easier) break
    first = easier.slug
  }
  const ladder: string[] = []
  for (let at: string | null = first; at; at = harderVersionOf(at)) ladder.push(at)
  return ladder
}
