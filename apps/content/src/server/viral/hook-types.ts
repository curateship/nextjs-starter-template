import { and, asc, desc, eq, inArray, isNull, notLike } from "drizzle-orm"
import { z } from "zod"

import {
  cleanHookTypeName,
  FIXED_HOOK_TYPES,
  hookTypeChoices,
  hookTypeFromName,
  isFixedHookType,
  OWN_HOOK_TYPES_MAX,
  type FixedHookTypeId,
  type HookTypeChoice,
  type OwnHookType,
} from "@/lib/viral/hook-types"
import { hookLine } from "@/lib/viral/viral-breakdown"
import { viralSays } from "@/lib/viral/viral"
import { roundedCents, writerDollars, type Writer, type WriterPrice } from "@/lib/viral/writers"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { readStoredBreakdown } from "@/server/viral/analysis"
import { viralAnalyses, viralHookTypes, viralOwnHooks, viralVideos } from "@/server/viral/schema"
import { isUniqueViolation } from "@/server/viral/unique-violation"
import { askWriter } from "@/server/viral/writer"
import { writerForPrices } from "@/server/viral/writer-choice"

/**
 * Hook types (`workspace/docs/library.md`, more-features task part 7). Tyler,
 * 6 Nov 2026: "Fixed + my own" and "Label old ones too".
 *
 * A hook's type is stored in two columns on its row (`viral_videos` for an
 * analysed video's hook, `viral_own_hooks` for your own): `hook_type` for a
 * fixed type, `hook_type_id` for one of the person's own. Deleting an own
 * type sets `hook_type_id` back to null through its foreign key, so those
 * hooks go back to no type with no code here.
 *
 * New analyses get their type for free: "Why it works" names it
 * (`ai-analysis.ts`). Hooks from before, and your own hooks saved with no
 * type, are labelled by the pass on Settings → Hook types, which the person
 * presses after seeing its price.
 */

export const HOOK_TYPE_FEATURE = "viral_hook_type"

/** Hooks one AI call labels in the pass. */
export const LABEL_BATCH = 25
/** Hooks one press labels at most, so a press answers in seconds rather than minutes. */
export const LABEL_PER_PRESS = 200
/** Calls the pass runs side by side. */
const LABEL_CALLS_AT_ONCE = 4

/** The two columns a type is stored in. */
export type HookTypeColumns = { hookType: FixedHookTypeId | null; hookTypeId: string | null }

export const NO_TYPE: HookTypeColumns = { hookType: null, hookTypeId: null }

export function typeColumns(choice: Pick<HookTypeChoice, "id" | "own"> | null): HookTypeColumns {
  if (!choice) return NO_TYPE
  return choice.own ? { hookType: null, hookTypeId: choice.id } : { hookType: choice.id as FixedHookTypeId, hookTypeId: null }
}

/** The one id a list and a filter use: the fixed key, or the own type's id. */
export function typeIdOf(row: HookTypeColumns): string | null {
  return row.hookType ?? row.hookTypeId ?? null
}

export async function listOwnHookTypes(ownerId: string): Promise<OwnHookType[]> {
  return db
    .select({ id: viralHookTypes.id, name: viralHookTypes.name })
    .from(viralHookTypes)
    .where(eq(viralHookTypes.ownerId, ownerId))
    .orderBy(asc(viralHookTypes.name))
}

/** The fixed types and the person's own, as the prompts and pickers list them. */
export async function hookTypeChoicesFor(ownerId: string): Promise<HookTypeChoice[]> {
  return hookTypeChoices(await listOwnHookTypes(ownerId))
}

/**
 * A type picked on screen, checked: a fixed key, or one of this person's own
 * types. Null is no type.
 */
export async function requireHookType(ownerId: string, typeId: string | null): Promise<HookTypeColumns> {
  if (!typeId) return NO_TYPE
  if (isFixedHookType(typeId)) return { hookType: typeId, hookTypeId: null }
  const [row] = await db
    .select({ id: viralHookTypes.id })
    .from(viralHookTypes)
    .where(and(eq(viralHookTypes.id, typeId), eq(viralHookTypes.ownerId, ownerId)))
  if (!row) throw viralSays("That hook type is gone. Pick another.")
  return { hookType: null, hookTypeId: row.id }
}

/** Adds one of the person's own types. A name already on the list, fixed or own, is refused. */
export async function addHookType(ownerId: string, rawName: string): Promise<OwnHookType[]> {
  const name = cleanHookTypeName(rawName)
  if (!name) throw viralSays("Give the type a name.")
  if (FIXED_HOOK_TYPES.some((one) => one.label.toLowerCase() === name.toLowerCase())) {
    throw viralSays(`"${name}" is one of the fixed types already.`)
  }
  const own = await listOwnHookTypes(ownerId)
  if (own.length >= OWN_HOOK_TYPES_MAX) throw viralSays(`You can have at most ${OWN_HOOK_TYPES_MAX} types of your own.`)
  try {
    await db.insert(viralHookTypes).values({ id: uuid(), ownerId, name, createdAt: now() })
  } catch (error) {
    if (isUniqueViolation(error)) throw viralSays(`You have a type called "${name}" already.`)
    throw error
  }
  return listOwnHookTypes(ownerId)
}

/** Deletes one of the person's own types. Its hooks go back to no type, through the foreign keys. */
export async function deleteHookType(ownerId: string, typeId: string): Promise<OwnHookType[]> {
  const [row] = await db
    .delete(viralHookTypes)
    .where(and(eq(viralHookTypes.id, typeId), eq(viralHookTypes.ownerId, ownerId)))
    .returning({ id: viralHookTypes.id })
  if (!row) throw viralSays("That type is gone already.")
  return listOwnHookTypes(ownerId)
}

/** The line every prompt that names a type carries: the list, and the rule to pick from it. */
export function hookTypeRule(choices: HookTypeChoice[]): string {
  return `one of: ${choices.map((one) => `"${one.label}"`).join(", ")}. Pick the closest one on that list, spelled exactly as it is written there.`
}

/** The type an AI named, as the two columns, or null when it named nothing on the list. */
export function typeFromAnswer(name: string | null | undefined, choices: HookTypeChoice[]): HookTypeColumns | null {
  const choice = hookTypeFromName(name, choices)
  return choice ? typeColumns(choice) : null
}

// ------------------------------------------------------- The old-hooks pass --

type Unlabelled = { kind: "video" | "own"; id: string; text: string }

/**
 * Every hook in the person's Library with no type yet, newest first: each
 * analysed video's hook and each of their own hooks. A sample's made-up video
 * is left out, because it is never sent to an AI; the sample gets its type
 * when it is made.
 */
export async function unlabelledHooks(ownerId: string): Promise<Unlabelled[]> {
  const [videos, own] = await Promise.all([
    db
      .select({ id: viralVideos.id, breakdown: viralVideos.breakdown })
      .from(viralVideos)
      .where(
        and(
          eq(viralVideos.ownerId, ownerId),
          inArray(
            viralVideos.id,
            db.select({ id: viralAnalyses.savedVideoId }).from(viralAnalyses).where(eq(viralAnalyses.ownerId, ownerId))
          ),
          isNull(viralVideos.hookType),
          isNull(viralVideos.hookTypeId),
          notLike(viralVideos.platformVideoId, "sample-%")
        )
      )
      .orderBy(desc(viralVideos.createdAt)),
    db
      .select({ id: viralOwnHooks.id, words: viralOwnHooks.words })
      .from(viralOwnHooks)
      .where(and(eq(viralOwnHooks.ownerId, ownerId), isNull(viralOwnHooks.hookType), isNull(viralOwnHooks.hookTypeId)))
      .orderBy(desc(viralOwnHooks.createdAt)),
  ])
  const fromVideos = videos.flatMap((row): Unlabelled[] => {
    const breakdown = readStoredBreakdown(row.breakdown)
    const line = breakdown ? hookLine(breakdown) : null
    return line ? [{ kind: "video", id: row.id, text: line.text }] : []
  })
  return [...fromVideos, ...own.map((row): Unlabelled => ({ kind: "own", id: row.id, text: row.words }))]
}

/**
 * What labelling this many hooks costs, before it runs. Each call reads
 * about 1,500 tokens (the list of types and 25 hooks) and writes about 400,
 * at the writer's price: a fraction of a cent a hook.
 */
export function labelPrice(writer: Writer, hooks: number): WriterPrice {
  const calls = Math.ceil(Math.min(hooks, LABEL_PER_PRESS) / LABEL_BATCH)
  return { cents: roundedCents(calls * writerDollars(writer, 1_500, 400)), writer: writer.label }
}

/** Settings → Hook types: the person's own types, and what the pass would do now. */
export type HookTypeSettings = {
  own: OwnHookType[]
  /** Hooks with no type yet. */
  unlabelled: number
  /** What the next press labels, at most `LABEL_PER_PRESS`. */
  nextPress: number
  price: WriterPrice
}

export async function readHookTypeSettings(ownerId: string): Promise<HookTypeSettings> {
  const [own, left, writer] = await Promise.all([listOwnHookTypes(ownerId), unlabelledHooks(ownerId), writerForPrices()])
  const nextPress = Math.min(left.length, LABEL_PER_PRESS)
  return { own, unlabelled: left.length, nextPress, price: labelPrice(writer, nextPress) }
}

const labelSchema = z.object({
  types: z
    .array(z.object({ n: z.number().int().min(1).max(LABEL_BATCH), type: z.string().max(100).nullable().catch(null) }))
    .max(LABEL_BATCH * 2),
})

function labelPrompt(batch: Unlabelled[], choices: HookTypeChoice[]) {
  const lines = batch.map((hook, index) => `${index + 1}. """${hook.text.slice(0, 400)}"""`).join("\n")
  return `Each line below is the opening line, the hook, of a short social video or post. Name each hook's type, ${hookTypeRule(choices)}

${lines}

Answer with JSON only, in exactly this shape, and nothing else:
{ "types": [{ "n": 1, "type": "the type's name from the list above" }] }
One entry per numbered line, with its number as "n".`
}

export type LabelResult = {
  /** Hooks given a type by this press. */
  labelled: number
  /** Hooks still with no type afterwards. */
  left: number
  /** Why a call failed, as thrown, when one did. The labels from the calls that worked are kept. */
  error: string | null
}

/**
 * The one-off pass on Settings → Hook types: labels up to 200 hooks with no
 * type, 25 to a call, four calls at a time, on the meter as
 * `viral_hook_type`. Each call's labels are kept as it answers, so a failed
 * call loses only its own 25. A hook the AI answers with a name off the
 * list stays without a type.
 *
 * The pass belongs to no project, since a hook can be analysed in several,
 * so it is not counted against any project's spend limit.
 */
export async function labelOldHooks(ownerId: string): Promise<LabelResult> {
  const [hooks, choices] = await Promise.all([unlabelledHooks(ownerId), hookTypeChoicesFor(ownerId)])
  const thisPress = hooks.slice(0, LABEL_PER_PRESS)
  const batches: Unlabelled[][] = []
  for (let start = 0; start < thisPress.length; start += LABEL_BATCH) batches.push(thisPress.slice(start, start + LABEL_BATCH))

  let labelled = 0
  let error: string | null = null
  for (let start = 0; start < batches.length; start += LABEL_CALLS_AT_ONCE) {
    const round = batches.slice(start, start + LABEL_CALLS_AT_ONCE)
    const answers = await Promise.allSettled(
      round.map((batch) =>
        askWriter({
          userId: ownerId,
          feature: HOOK_TYPE_FEATURE,
          metadata: { hooks: batch.length },
          prompt: labelPrompt(batch, choices),
          schema: labelSchema,
          label: "The hook types",
        })
      )
    )
    for (const [index, answer] of answers.entries()) {
      if (answer.status === "rejected") {
        // Kept as thrown; the tab words it with `getViralErrorMessage`, as every other Viral error is.
        error ??= answer.reason instanceof Error ? answer.reason.message : "A call failed."
        continue
      }
      labelled += await keepLabels(ownerId, round[index], answer.value.types, choices)
    }
    // Every call failing the same way (no key, no money) says so once rather than four times over.
    if (error && answers.every((answer) => answer.status === "rejected")) break
  }
  return { labelled, left: hooks.length - labelled, error }
}

async function keepLabels(
  ownerId: string,
  batch: Unlabelled[],
  types: { n: number; type: string | null }[],
  choices: HookTypeChoice[]
): Promise<number> {
  let kept = 0
  const at = now()
  for (const { n, type } of types) {
    const hook = batch[n - 1]
    const columns = hook ? typeFromAnswer(type, choices) : null
    if (!hook || !columns) continue
    // Only a hook still with no type is written, so a type set by hand meanwhile stands.
    const updated =
      hook.kind === "video"
        ? await db
            .update(viralVideos)
            .set(columns)
            .where(and(eq(viralVideos.id, hook.id), eq(viralVideos.ownerId, ownerId), isNull(viralVideos.hookType), isNull(viralVideos.hookTypeId)))
            .returning({ id: viralVideos.id })
        : await db
            .update(viralOwnHooks)
            .set({ ...columns, updatedAt: at })
            .where(
              and(eq(viralOwnHooks.id, hook.id), eq(viralOwnHooks.ownerId, ownerId), isNull(viralOwnHooks.hookType), isNull(viralOwnHooks.hookTypeId))
            )
            .returning({ id: viralOwnHooks.id })
    kept += updated.length
  }
  return kept
}

/** Writes the type "Why it works" named onto the analysed video, when it named one on the list. */
export async function keepAnalysedHookType(ownerId: string, savedVideoId: string, columns: HookTypeColumns | null) {
  if (!columns) return
  await db
    .update(viralVideos)
    .set(columns)
    .where(and(eq(viralVideos.id, savedVideoId), eq(viralVideos.ownerId, ownerId)))
}
