import { and, eq, ne } from "drizzle-orm"

import { DATING_APP_WORDS } from "@/lib/dating/options"
import {
  datingSettingsProblem,
  datingSettingsShape,
  hourWindowsOverlap,
  type DatingSettings,
} from "@/lib/dating/settings"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { dateAccounts, dateSettings } from "./schema"

/** What saving settings needs to know about the profile they belong to. */
export type SettingsOwner = { id: string; userId: string; workspaceId: string; phoneId: string | null }

/** A profile's Dating settings, every value filled in, defaults where nothing was saved. */
export async function readDatingSettings(accountId: string, db: CustomShellDb = defaultDb): Promise<DatingSettings> {
  const [row] = await db.select({ values: dateSettings.values }).from(dateSettings).where(eq(dateSettings.accountId, accountId)).limit(1)
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
 * Another profile on the same phone whose swiping hours share an hour with
 * these, in words, or null. The phone runs one app at a time.
 */
async function scheduleClash(owner: SettingsOwner, settings: DatingSettings, db: CustomShellDb): Promise<string | null> {
  const { scheduleStart: start, scheduleEnd: end } = settings
  if (!owner.phoneId || start === null || end === null) return null
  const others = await db
    .select({ id: dateAccounts.id, name: dateAccounts.name, app: dateAccounts.app })
    .from(dateAccounts)
    .where(and(eq(dateAccounts.phoneId, owner.phoneId), ne(dateAccounts.id, owner.id)))
  for (const other of others) {
    const theirs = await readDatingSettings(other.id, db)
    if (theirs.scheduleStart === null || theirs.scheduleEnd === null) continue
    if (!hourWindowsOverlap({ start, end }, { start: theirs.scheduleStart, end: theirs.scheduleEnd })) continue
    return `${DATING_APP_WORDS[other.app].name} (${other.name}) swipes on this phone from ${theirs.scheduleStart}:00 to ${theirs.scheduleEnd}:00. Pick hours that don't overlap it.`
  }
  return null
}

/**
 * Saves the whole set at once, as the settings window sends it. Refused with
 * the reason when a value fails its check, two values disagree, or the
 * swiping hours overlap another profile's on the same phone.
 */
export async function saveDatingSettings(
  owner: SettingsOwner,
  values: DatingSettings,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<DatingSettings> {
  const checked = datingSettingsShape.parse(values)
  const cleaned = { ...checked, examples: checked.examples.map((line) => line.trim()).filter(Boolean) }
  const problem = datingSettingsProblem(cleaned) ?? (await scheduleClash(owner, cleaned, db))
  if (problem) throw new Error(problem)
  await db
    .insert(dateSettings)
    .values({ accountId: owner.id, userId: owner.userId, workspaceId: owner.workspaceId, values: cleaned, updatedAt: now })
    .onConflictDoUpdate({ target: dateSettings.accountId, set: { values: cleaned, updatedAt: now } })
  return cleaned
}

/** Adds an answer to one of the AI's questions to what the AI may say about the member. */
export async function addToAboutMe(
  owner: SettingsOwner,
  question: string,
  answer: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const settings = await readDatingSettings(owner.id, db)
  const line = question.trim() ? `${question.trim()} ${answer.trim()}` : answer.trim()
  const aboutMe = [settings.aboutMe.trim(), line].filter(Boolean).join("\n").slice(0, 4_000)
  await saveDatingSettings(owner, { ...settings, aboutMe }, db, now)
}
