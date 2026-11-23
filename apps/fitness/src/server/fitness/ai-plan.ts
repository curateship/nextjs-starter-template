import { eq } from "drizzle-orm"
import { z } from "zod"

import { defaultRange } from "@/lib/fitness/calisthenics"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { EXERCISE_CATALOG } from "@/lib/fitness/exercise-catalog"
import { EXPERIENCE, GOALS, TEMPLATE_START_SHARE } from "@/lib/fitness/templates"
import { roundToStep } from "@/lib/fitness/weights"
import { getAiKey } from "@/server/ai/keys"
import { runAiCall } from "@/server/ai/usage"
import { uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { programFor, type FitnessDb } from "@/server/fitness/access"
import { rescheduleFromToday, todayFor } from "@/server/fitness/calendar"
import { builtInBySlug, listExercises } from "@/server/fitness/exercises"
import { loadBaseline, settleDayOrder, settleRange } from "@/server/fitness/week"
import { preferencesFor } from "@/server/fitness/profile"
import { fitnessWeekDays, fitnessDayExercises } from "@/server/fitness/schema"

/**
 * "Build my plan": the AI writes a first plan from the person's goal, the days
 * they can train and the equipment they have. It may only use built-in lifts,
 * only ones their equipment allows and none on their pain list, and anything
 * else it names is dropped. The answer comes back as a draft for the person
 * to look over; nothing is saved until they choose Use this plan.
 *
 * A beginner gets at most four workout days and at most five lifts a day.
 */

const draftSchema = z.object({
  days: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        name: z.string().min(1).max(60),
        exercises: z
          .array(
            z.object({
              slug: z.string().min(1).max(64),
              sets: z.number().int().min(1).max(10),
              reps: z.number().int().min(1).max(100),
              /** Calisthenics only: the top of the move's rep range. */
              repsMax: z.number().int().min(1).max(100).optional(),
              restSeconds: z.number().int().min(30).max(600),
            })
          )
          .min(1)
          .max(10),
      })
    )
    .min(1)
    .max(7),
})

export type PlanDraft = {
  days: {
    /** 0 is Sunday. Weekdays not listed are rest days. */
    weekday: number
    name: string
    exercises: {
      exerciseId: string
      name: string
      sets: number
      reps: number
      /** Calisthenics only: the move's rep range, the target starting at its bottom. */
      repsMin?: number | null
      repsMax?: number | null
      restSeconds: number
      weightKg: number
    }[]
  }[]
}

const ANTHROPIC_MODEL = "claude-sonnet-5"
const OPENAI_MODEL = "gpt-5-mini"

export async function buildAiPlan(
  actorId: string,
  programId: string,
  input: { daysPerWeek: number },
  database: FitnessDb = db
): Promise<PlanDraft> {
  const program = await programFor(actorId, programId, database, { forChange: true })
  const baseline = await loadBaseline(programId, database)
  const profile = await preferencesFor(program.userId, database)
  const beginner = baseline.experience === "beginner" || baseline.experience === null
  const daysPerWeek = Math.min(input.daysPerWeek, beginner ? 4 : 6)
  const have = new Set(baseline.equipment)
  const avoided = new Set(
    (await listExercises(program.userId, database)).filter((exercise) => exercise.avoided).map((exercise) => exercise.slug)
  )
  const calisthenics = program.routineType === "calisthenics"
  // Only the program's own routine type: a Calisthenics week is Calisthenics moves.
  const allowed = EXERCISE_CATALOG.filter(
    (exercise) =>
      exercise.routineType === program.routineType &&
      !avoided.has(exercise.slug) &&
      (have.size === 0 || exercise.equipment.every((item) => item === "bodyweight" || have.has(item)))
  )
  const goal = GOALS.find((entry) => entry.id === baseline.goal)?.label ?? "Get stronger"
  const experience = EXPERIENCE.find((entry) => entry.id === baseline.experience)?.label ?? "New, under a year"
  const prompt = [
    calisthenics
      ? "You write calisthenics plans: bodyweight moves only, no weights. Answer with JSON only, no prose."
      : "You write strength training plans. Answer with JSON only, no prose.",
    `The lifter's goal: ${goal}. Training experience: ${experience}.`,
    `They can train ${daysPerWeek} days a week.`,
    beginner
      ? calisthenics
        ? "They are a beginner: at most 5 moves per day, 3 sets each, from the easier versions."
        : "They are a beginner: at most 5 exercises per day, mostly compound lifts, 3 sets each."
      : "",
    calisthenics
      ? "Each move has a rep range: reps is its bottom and repsMax its top, such as 8 and 12. Moves marked (seconds) are holds, so their reps are seconds, such as 20 and 40."
      : "",
    "Use only these exercise slugs (slug: name):",
    allowed.map((exercise) => `${exercise.slug}: ${exercise.name}${exercise.timed ? " (seconds)" : ""}`).join("\n"),
    calisthenics
      ? `Return {"days": [{"weekday": 0-6 where 0 is Sunday, "name": "short workout name", "exercises": [{"slug", "sets", "reps", "repsMax", "restSeconds"}]}]}.`
      : `Return {"days": [{"weekday": 0-6 where 0 is Sunday, "name": "short workout name", "exercises": [{"slug", "sets", "reps", "restSeconds"}]}]}.`,
    `Give exactly ${daysPerWeek} days, each on a different weekday, spread through the week. Every other weekday is a rest day.`,
  ]
    .filter(Boolean)
    .join("\n")

  // Metered to whoever pressed the button, so a coach spends their own allowance.
  const answer = await askForPlan(actorId, prompt)
  const bySlug = await builtInBySlug(database)
  const allowedSlugs = new Set(allowed.map((exercise) => exercise.slug))
  const startWeight = (exerciseId: string, isBodyweight: boolean) => {
    if (isBodyweight) return 0
    const lift = baseline.lifts.find((candidate) => candidate.exerciseId === exerciseId)
    return lift ? roundToStep(lift.oneRepMaxKg * TEMPLATE_START_SHARE, profile.stepKg) : 0
  }
  const seen = new Set<number>()
  const days = answer.days
    .filter((day) => {
      if (seen.has(day.weekday)) return false
      seen.add(day.weekday)
      return true
    })
    .slice(0, daysPerWeek)
    .map((day) => ({
      weekday: day.weekday,
      name: day.name,
      exercises: day.exercises
        .filter((exercise) => allowedSlugs.has(exercise.slug) && bySlug.has(exercise.slug))
        .slice(0, beginner ? 5 : 10)
        .map((exercise) => {
          const row = bySlug.get(exercise.slug)!
          const range = calisthenics
            ? settleRange(exercise.reps, exercise.reps, exercise.repsMax ?? defaultRange(exercise.reps).repsMax)
            : null
          return {
            exerciseId: row.id,
            name: row.name,
            sets: exercise.sets,
            reps: exercise.reps,
            repsMin: range?.repsMin ?? null,
            repsMax: range?.repsMax ?? null,
            restSeconds: exercise.restSeconds,
            weightKg: calisthenics ? 0 : startWeight(row.id, row.isBodyweight),
          }
        }),
    }))
    .filter((day) => day.exercises.length > 0)
  if (days.length === 0) throw new Error(FITNESS_ERRORS.aiFailed)
  return { days }
}

async function askForPlan(userId: string, prompt: string) {
  const anthropic = await getAiKey("anthropic")
  const openai = anthropic ? null : await getAiKey("openai")
  if (!anthropic && !openai) throw new Error(FITNESS_ERRORS.aiNoKey)
  const provider = anthropic ? "anthropic" : "openai"
  const model = anthropic ? ANTHROPIC_MODEL : OPENAI_MODEL
  try {
    return await runAiCall({ userId, provider, model, feature: "fitness-plan" }, async () => {
      const reply = anthropic ? await askAnthropic(anthropic, prompt) : await askOpenAi(openai!, prompt)
      return { result: draftSchema.parse(readJson(reply.text)), usage: reply.usage }
    })
  } catch (error) {
    console.error("AI plan failed", error)
    throw new Error(FITNESS_ERRORS.aiFailed)
  }
}

function readJson(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end < start) throw new Error("No JSON in the answer")
  return JSON.parse(text.slice(start, end + 1))
}

async function askAnthropic(apiKey: string, prompt: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw new Error(`Anthropic answered ${response.status}`)
  const payload = (await response.json()) as {
    content?: { type?: string; text?: string }[]
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  return {
    text: (payload.content ?? []).filter((block) => block.type === "text").map((block) => block.text ?? "").join(""),
    usage: { inputTokens: payload.usage?.input_tokens ?? 0, outputTokens: payload.usage?.output_tokens ?? 0 },
  }
}

async function askOpenAi(apiKey: string, prompt: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw new Error(`OpenAI answered ${response.status}`)
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  return {
    text: payload.choices?.[0]?.message?.content ?? "",
    usage: { inputTokens: payload.usage?.prompt_tokens ?? 0, outputTokens: payload.usage?.completion_tokens ?? 0 },
  }
}

/** Saves a draft the person chose to use, in place of the program's week. */
export async function applyAiPlan(actorId: string, programId: string, draft: PlanDraft, database: FitnessDb = db) {
  const program = await programFor(actorId, programId, database, { forChange: true })
  const bySlug = await builtInBySlug(database)
  // Only built-in lifts of the program's own routine type.
  const builtInIds = new Set(
    [...bySlug.values()].filter((row) => row.routineType === program.routineType).map((row) => row.id)
  )
  const calisthenics = program.routineType === "calisthenics"
  await database.delete(fitnessWeekDays).where(eq(fitnessWeekDays.programId, programId))
  const used = new Set<number>()
  for (const day of draft.days) {
    if (used.has(day.weekday)) continue
    used.add(day.weekday)
    const dayId = uuid()
    await database.insert(fitnessWeekDays).values({ id: dayId, programId, name: day.name, weekday: day.weekday })
    const rows = day.exercises
      .filter((exercise) => builtInIds.has(exercise.exerciseId))
      .map((exercise, index) => ({
        id: uuid(),
        dayId: dayId,
        exerciseId: exercise.exerciseId,
        position: index,
        sets: exercise.sets,
        ...(calisthenics
          ? {
              ...settleRange(
                exercise.reps,
                exercise.repsMin ?? exercise.reps,
                exercise.repsMax ?? defaultRange(exercise.reps).repsMax
              ),
              weightKg: 0,
            }
          : { reps: exercise.reps, repsMin: null, repsMax: null, weightKg: exercise.weightKg }),
        restSeconds: exercise.restSeconds,
        groupKey: null,
        missStreak: 0,
      }))
    if (rows.length) await database.insert(fitnessDayExercises).values(rows)
    await settleDayOrder(dayId, database)
  }
  await rescheduleFromToday(programId, await todayFor(program.userId, database), database)
}
