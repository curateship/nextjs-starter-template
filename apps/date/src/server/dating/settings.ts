import { and, eq } from "drizzle-orm"

import {
  datingSettingsProblem,
  datingSettingsShape,
  type DatingSettings,
} from "@/lib/dating/settings"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { dateSettings } from "./schema"

/** The member's Dating settings, every value filled in, defaults where nothing was saved. */
export async function readDatingSettings(
  userId: string,
  workspaceId: string,
  db: CustomShellDb = defaultDb
): Promise<DatingSettings> {
  const [row] = await db
    .select({ values: dateSettings.values })
    .from(dateSettings)
    .where(and(eq(dateSettings.userId, userId), eq(dateSettings.workspaceId, workspaceId)))
    .limit(1)
  // A saved value that no longer passes its check takes its default, so one bad value never blanks the rest.
  const saved = row?.values ?? {}
  const result: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(datingSettingsShape.shape)) {
    const parsed = field.safeParse((saved as Record<string, unknown>)[key])
    result[key] = parsed.success ? parsed.data : field.parse(undefined)
  }
  return result as DatingSettings
}

/**
 * Saves the whole set at once, as the Settings screen sends it. Refused with
 * the reason when a value fails its check or two values disagree.
 */
export async function saveDatingSettings(
  userId: string,
  workspaceId: string,
  values: DatingSettings,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<DatingSettings> {
  const checked = datingSettingsShape.parse(values)
  const cleaned = { ...checked, examples: checked.examples.map((line) => line.trim()).filter(Boolean) }
  const problem = datingSettingsProblem(cleaned)
  if (problem) throw new Error(problem)
  await db
    .insert(dateSettings)
    .values({ userId, workspaceId, values: cleaned, updatedAt: now })
    .onConflictDoUpdate({ target: [dateSettings.userId, dateSettings.workspaceId], set: { values: cleaned, updatedAt: now } })
  return cleaned
}

/** Adds an answer to one of the AI's questions to what the AI may say about the member. */
export async function addToAboutMe(
  userId: string,
  workspaceId: string,
  question: string,
  answer: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const settings = await readDatingSettings(userId, workspaceId, db)
  const line = question.trim() ? `${question.trim()} ${answer.trim()}` : answer.trim()
  const aboutMe = [settings.aboutMe.trim(), line].filter(Boolean).join("\n").slice(0, 4_000)
  await saveDatingSettings(userId, workspaceId, { ...settings, aboutMe }, db, now)
}
