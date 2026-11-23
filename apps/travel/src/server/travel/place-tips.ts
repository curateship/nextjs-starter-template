import { eq } from "drizzle-orm"
import { z } from "zod"

import type { WrittenPageNode } from "@/lib/pages/written-page-body"
import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { readNotes, storedNotes } from "@/lib/travel/notes"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { requireActivity } from "@/server/travel/access"
import { meteredAi, type AskAi } from "@/server/travel/ai"
import { travelActivities, travelActivityTypes } from "@/server/travel/schema"

/**
 * Tips for a place, by AI (More Travel features part 5; Tyler: "Into the
 * card's notes"). Add tips in a card's ⋮ menu asks for three to five short
 * tips, such as the best time to go or what to order, and adds them after
 * what the notes already hold, under a "Tips" heading, as a list the person
 * can change like any other note. Pressing it again adds a second list; it
 * never rewrites what is there.
 */

const MAX_ANSWER_TOKENS = 700
/** The longest notes an ordinary save takes (`updateActivitySchema` in `src/lib/travel/schemas.ts`). */
const NOTES_MAX = 100_000
const TIP_MAX = 240

/** The shell's metered AI, set for writing tips. */
export function tipsAi(userId: string): AskAi {
  return meteredAi(userId, { feature: "travel-place-tips", maxTokens: MAX_ANSWER_TOKENS, failed: TRAVEL_ERRORS.tipsFailed })
}

const SYSTEM_PROMPT = [
  "You give a traveller short, practical tips for one place, as a well-travelled local friend would.",
  "Answer with one JSON object and nothing else. No code fence, no words before or after.",
  'The shape is {"tips":["...","..."]}, with 3 to 5 tips, each one sentence of at most 30 words.',
  "Cover what helps on the day: the best time to go, what to see or order, tickets or queues, what to wear, and how long to allow.",
  "Only say what is true of this place. Never invent prices, opening hours or phone numbers.",
].join(" ")

const answerSchema = z.object({ tips: z.array(z.unknown()) })

/** The tips in an answer: 3 to 5 non-empty sentences, each cut to 240 characters. Too few is a failed answer. */
export function readTips(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end <= start) throw new Error(TRAVEL_ERRORS.tipsFailed)
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new Error(TRAVEL_ERRORS.tipsFailed)
  }
  const answer = answerSchema.safeParse(parsed)
  if (!answer.success) throw new Error(TRAVEL_ERRORS.tipsFailed)
  const tips = answer.data.tips
    .flatMap((tip) => (typeof tip === "string" && tip.trim() ? [tip.trim().replace(/\s+/g, " ").slice(0, TIP_MAX)] : []))
    .slice(0, 5)
  if (tips.length < 3) throw new Error(TRAVEL_ERRORS.tipsFailed)
  return tips
}

/** The notes with a "Tips" heading and the tips as a list after what they already hold. */
export function notesWithTips(stored: string, tips: string[]) {
  const doc = readNotes(stored)
  const paragraph = (text: string): WrittenPageNode => ({ type: "paragraph", content: [{ type: "text", text }] })
  const added: WrittenPageNode[] = [
    { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Tips" }] },
    { type: "bulletList", content: tips.map((tip) => ({ type: "listItem", content: [paragraph(tip)] })) },
  ]
  return storedNotes(JSON.stringify({ ...doc, content: [...(doc.content ?? []), ...added] }))
}

export async function addPlaceTips(
  userId: string,
  input: { activityId: string },
  { database = db, ask = tipsAi(userId) }: { database?: CustomShellDb; ask?: AskAi } = {}
) {
  const { activity, trip } = await requireActivity(userId, input.activityId, database)
  const [type] = activity.typeId
    ? await database
        .select({ name: travelActivityTypes.name })
        .from(travelActivityTypes)
        .where(eq(travelActivityTypes.id, activity.typeId))
        .limit(1)
    : []
  const prompt = [
    `The place is ${activity.place?.name || activity.title}.`,
    activity.place?.address ? `Its address is ${activity.place.address}.` : "",
    type ? `It is a ${type.name.toLowerCase()}.` : "",
    trip.destination ? `The trip is to ${trip.destination}.` : "",
  ]
    .filter(Boolean)
    .join(" ")
  const tips = readTips(await ask(SYSTEM_PROMPT, prompt))
  // The notes as they are now, read again after the AI's wait, so words saved meanwhile are kept.
  const [latest] = await database
    .select({ notes: travelActivities.notes })
    .from(travelActivities)
    .where(eq(travelActivities.id, activity.id))
    .limit(1)
  // Never past the length an ordinary save allows, or the notes could no longer be edited.
  const notes = notesWithTips(latest?.notes ?? activity.notes, tips)
  if (notes.length > NOTES_MAX) throw new Error(TRAVEL_ERRORS.tipsNotesFull)
  await database
    .update(travelActivities)
    .set({ notes, updatedAt: now() })
    .where(eq(travelActivities.id, activity.id))
  return { tips: tips.length }
}
