import { EXERCISE_CATALOG } from "@/lib/fitness/exercise-catalog"
import { toKg, type WeightUnit } from "@/lib/fitness/weights"

/**
 * Reading the workout history other gym apps export, so a person switching to
 * this app keeps their records and charts.
 *
 * - Strong exports one row per set with `Date`, `Workout Name`,
 *   `Exercise Name`, `Set Order`, `Weight` and `Reps`, separated by commas or,
 *   in newer versions, semicolons. A `Weight Unit` column says kg or lbs when
 *   it is there; otherwise the weights are in whatever unit the app was set to,
 *   which the person tells us.
 * - Hevy exports one row per set with `title`, `start_time`, `exercise_title`,
 *   `set_index`, `set_type`, `reps` and `weight_kg` or `weight_lbs`.
 *
 * Both apps change their files without warning, so headers are matched without
 * caring about capitals, and anything unrecognised is refused with a plain
 * sentence rather than half-read.
 */

type ImportSource = "strong" | "hevy"

type ImportedSet = { weightKg: number | null; reps: number | null; warmup: boolean }
type ImportedExercise = { name: string; sets: ImportedSet[] }
type ImportedWorkout = { key: string; name: string; day: string; startedAt: string; exercises: ImportedExercise[] }

export type ParsedImport = { source: ImportSource; workouts: ImportedWorkout[] }

/** Splits CSV text into rows, honouring quotes and quoted line breaks. */
export function readCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "")
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ""
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ","
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index]
    if (quoted) {
      if (char === '"' && clean[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[index + 1] === "\n") index += 1
      row.push(field)
      if (row.some((cell) => cell.trim() !== "")) rows.push(row)
      row = []
      field = ""
    } else {
      field += char
    }
  }
  row.push(field)
  if (row.some((cell) => cell.trim() !== "")) rows.push(row)
  return rows
}

function numberOrNull(value: string | undefined) {
  if (value === undefined) return null
  const trimmed = value.trim().replace(",", ".")
  if (trimmed === "") return null
  const number = Number(trimmed)
  return Number.isFinite(number) ? number : null
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
}

/** "2024-01-15 07:30:00" or "15 Jan 2024, 07:30" as a day and a time. */
export function readWhen(value: string): { day: string; time: string } | null {
  const trimmed = value.trim()
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2}:\d{2})?/)
  if (iso) return { day: `${iso[1]}-${iso[2]}-${iso[3]}`, time: iso[4] ?? "00:00" }
  const written = trimmed.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}),? ?(\d{1,2}:\d{2})?/)
  if (written) {
    const month = MONTHS[written[2].toLowerCase()]
    if (!month) return null
    return {
      day: `${written[3]}-${month}-${written[1].padStart(2, "0")}`,
      time: (written[4] ?? "00:00").padStart(5, "0"),
    }
  }
  return null
}

export function parseWorkoutExport(text: string, unitIfUnsaid: WeightUnit): ParsedImport | null {
  const rows = readCsv(text)
  if (rows.length < 2) return null
  const header = rows[0].map((cell) => cell.trim().toLowerCase())
  const column = (name: string) => header.indexOf(name)
  const body = rows.slice(1)

  if (column("exercise_title") >= 0 && column("start_time") >= 0) {
    const weightKgCol = column("weight_kg")
    const weightLbCol = column("weight_lbs")
    return group("hevy", body, {
      when: column("start_time"),
      name: column("title"),
      exercise: column("exercise_title"),
      reps: column("reps"),
      weight: (row) =>
        weightKgCol >= 0
          ? numberOrNull(row[weightKgCol])
          : weightLbCol >= 0
            ? nullableKg(numberOrNull(row[weightLbCol]), "lb")
            : null,
      warmup: (row) => (row[column("set_type")] ?? "").trim().toLowerCase() === "warmup",
    })
  }

  if (column("exercise name") >= 0 && column("date") >= 0) {
    const unitCol = column("weight unit")
    const weightCol = column("weight")
    return group("strong", body, {
      when: column("date"),
      name: column("workout name"),
      exercise: column("exercise name"),
      reps: column("reps"),
      weight: (row) => {
        const unitWord = unitCol >= 0 ? (row[unitCol] ?? "").trim().toLowerCase() : ""
        const unit: WeightUnit = unitWord.startsWith("lb") ? "lb" : unitWord === "kg" ? "kg" : unitIfUnsaid
        return nullableKg(numberOrNull(row[weightCol]), unit)
      },
      warmup: (row) => (row[column("set order")] ?? "").trim().toUpperCase() === "W",
    })
  }
  return null
}

function nullableKg(value: number | null, unit: WeightUnit) {
  return value === null ? null : toKg(value, unit)
}

function group(
  source: ImportSource,
  body: string[][],
  columns: {
    when: number
    name: number
    exercise: number
    reps: number
    weight: (row: string[]) => number | null
    warmup: (row: string[]) => boolean
  }
): ParsedImport | null {
  const workouts = new Map<string, ImportedWorkout>()
  for (const row of body) {
    const when = readWhen(row[columns.when] ?? "")
    const exercise = (row[columns.exercise] ?? "").trim()
    if (!when || !exercise) continue
    const name = (row[columns.name] ?? "").trim() || "Workout"
    const key = `${source}:${when.day}T${when.time}:${name}`.slice(0, 160)
    const workout =
      workouts.get(key) ??
      ({ key, name: name.slice(0, 80), day: when.day, startedAt: `${when.day}T${when.time}:00Z`, exercises: [] } as ImportedWorkout)
    workouts.set(key, workout)
    let entry = workout.exercises.find((candidate) => candidate.name === exercise)
    if (!entry) {
      entry = { name: exercise.slice(0, 80), sets: [] }
      workout.exercises.push(entry)
    }
    const reps = numberOrNull(row[columns.reps])
    entry.sets.push({
      weightKg: columns.weight(row),
      reps: reps === null ? null : Math.round(reps),
      warmup: columns.warmup(row),
    })
  }
  if (workouts.size === 0) return null
  return { source, workouts: [...workouts.values()] }
}

/** Lower case, no equipment in brackets, no punctuation: "Squat (Barbell)" is "squat". */
function normalise(name: string) {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * What Strong and Hevy call some of the built-in lifts, by the name each app
 * shows. Anything not here is matched on the built-in name itself.
 */
const ALIASES: Record<string, string> = {
  "squat (barbell)": "back-squat",
  "back squat (barbell)": "back-squat",
  "front squat (barbell)": "front-squat",
  "bench press (barbell)": "bench-press",
  "incline bench press (barbell)": "incline-bench-press",
  "bench press (dumbbell)": "dumbbell-bench-press",
  "incline bench press (dumbbell)": "incline-dumbbell-press",
  "deadlift (barbell)": "deadlift",
  "romanian deadlift (barbell)": "romanian-deadlift",
  "overhead press (barbell)": "overhead-press",
  "shoulder press (dumbbell)": "seated-dumbbell-press",
  "bent over row (barbell)": "barbell-row",
  "bent over one arm row (dumbbell)": "dumbbell-row",
  "pull up": "pull-up",
  "pull up (weighted)": "pull-up",
  "chin up": "chin-up",
  "lat pulldown (cable)": "lat-pulldown",
  "seated row (cable)": "seated-cable-row",
  "bicep curl (barbell)": "barbell-curl",
  "bicep curl (dumbbell)": "dumbbell-curl",
  "hammer curl (dumbbell)": "hammer-curl",
  "triceps pushdown (cable - straight bar)": "triceps-pushdown",
  "triceps pushdown": "triceps-pushdown",
  "leg press": "leg-press",
  "leg press (machine)": "leg-press",
  "leg extension (machine)": "leg-extension",
  "lying leg curl (machine)": "lying-leg-curl",
  "seated leg curl (machine)": "seated-leg-curl",
  "lateral raise (dumbbell)": "lateral-raise",
  "hip thrust (barbell)": "hip-thrust",
  "standing calf raise (machine)": "standing-calf-raise",
  "chest dip": "dip",
  "triceps dip": "dip",
  "face pull (cable)": "face-pull",
  "plank": "plank",
  "push up": "push-up",
}

/** The built-in lift an exported name most likely means, or null. */
export function matchCatalogSlug(name: string): string | null {
  const alias = ALIASES[name.trim().toLowerCase()]
  if (alias) return alias
  const wanted = normalise(name)
  const exact = EXERCISE_CATALOG.find((exercise) => normalise(exercise.name) === wanted)
  return exact?.slug ?? null
}
