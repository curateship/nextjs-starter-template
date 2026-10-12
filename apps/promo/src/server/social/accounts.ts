import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { promoProfiles } from "@/server/browser/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { readBehaviour } from "./behaviour"
import { promoAccounts, promoJobs, promoVoices } from "./schema"

/**
 * The Reddit accounts, as records a person picks for.
 *
 * An account owns neither its browser nor its words. It points at a browser
 * profile, managed on the Browser profiles dashboard, and at a voice, managed
 * on the Voices dashboard. There can be any number of accounts, one per
 * profile, listed on the Reddit accounts dashboard (`account-list.ts`) and
 * grouped into projects (`projects.ts`).
 *
 * Settings → Reddit account still edits one of them: the oldest account in
 * use. Which account a comment goes out from is picked on the Projects
 * dashboard, per comment.
 */

export type AccountView = {
  id: string
  handle: string
  karma: number | null
  /** When Reddit made the account, or null when never read. */
  redditCreatedAt: Date | null
  lastPostedAt: Date | null
  /** Null when none was picked, or the one picked was deleted. */
  profile: { id: string; name: string } | null
  /** The voice it drafts with. Null when none was picked, or it was deleted. */
  voice: { id: string; name: string } | null
}

/** The oldest account in use, the one Settings → Reddit account edits, or null when there is none. */
export async function readAccount(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<AccountView | null> {
  const account = await readAccountRow(userId, db)
  if (!account) return null
  return {
    id: account.id,
    handle: account.handle,
    karma: account.karma,
    redditCreatedAt: account.redditCreatedAt,
    lastPostedAt: account.lastPostedAt,
    profile: account.profile,
    voice: account.voiceRef,
  }
}

export type SaveAccountInput = {
  /** The browser profile the account signs in inside, or null for none. */
  profileId: string | null
  /** The voice it drafts with, or null to draft plainly. */
  voiceId: string | null
}

/**
 * Creates or updates the oldest account in use: which browser profile and
 * which voice. Settings → Reddit account's one form.
 */
export async function saveAccount(
  userId: string,
  input: SaveAccountInput,
  db: CustomShellDb = defaultDb
): Promise<AccountView> {
  const existing = await readAccount(userId, db)
  await checkPicks(userId, input, existing?.id ?? null, db)

  const fields = { profileId: input.profileId, voiceId: input.voiceId }

  if (existing) {
    await db
      .update(promoAccounts)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(promoAccounts.id, existing.id), eq(promoAccounts.userId, userId)))
  } else {
    await db.insert(promoAccounts).values({ id: uuid(), userId, platform: "reddit", ...fields })
  }

  const saved = await readAccount(userId, db)
  if (!saved) throw new Error("The account could not be read back after saving.")
  return saved
}

/**
 * Adds another Reddit account, in a browser profile of its own, from the
 * Reddit accounts dashboard. It is signed in to Reddit inside that profile's
 * browser afterwards, and starts in no project.
 */
export async function addAccount(
  userId: string,
  input: { profileId: string; voiceId: string | null },
  db: CustomShellDb = defaultDb
): Promise<string> {
  await checkPicks(userId, input, null, db)
  const id = uuid()
  await db.insert(promoAccounts).values({
    id,
    userId,
    platform: "reddit",
    profileId: input.profileId,
    voiceId: input.voiceId,
  })
  return id
}

/**
 * Refuses a profile or voice that cannot be used, by name, before the
 * database's own rule would refuse it with an index name: a profile that is
 * not theirs, is the reader browser, or already holds another Reddit account,
 * and a voice that is not theirs.
 */
async function checkPicks(
  userId: string,
  input: SaveAccountInput,
  accountId: string | null,
  db: CustomShellDb
): Promise<void> {
  if (input.profileId) {
    const [profile] = await db
      .select({ name: promoProfiles.name })
      .from(promoProfiles)
      .where(and(eq(promoProfiles.id, input.profileId), eq(promoProfiles.userId, userId)))
      .limit(1)
    if (!profile) throw new Error("That browser profile does not exist.")
    if ((await readBehaviour(userId, db)).readerProfileId === input.profileId) {
      throw new Error(
        `The profile ${profile.name} is the reader browser, which stays signed in to nobody. Pick another profile, or change the reader in Settings → Behaviour.`
      )
    }

    const [taken] = await db
      .select({ id: promoAccounts.id })
      .from(promoAccounts)
      .where(
        and(
          eq(promoAccounts.profileId, input.profileId),
          eq(promoAccounts.platform, "reddit"),
          ...(accountId ? [ne(promoAccounts.id, accountId)] : [])
        )
      )
      .limit(1)
    if (taken) {
      throw new Error(
        `The profile ${profile.name} already has a Reddit account in it. One Reddit account per profile, or they sign in over each other.`
      )
    }
  }

  if (input.voiceId) {
    const [voice] = await db
      .select({ id: promoVoices.id })
      .from(promoVoices)
      .where(and(eq(promoVoices.id, input.voiceId), eq(promoVoices.userId, userId)))
      .limit(1)
    if (!voice) throw new Error("That voice does not exist.")
  }
}

/**
 * The accounts signed in inside each profile, as the browser program last saw
 * them, for the Browser profiles dashboard. Read from rows; no browser is asked.
 */
export async function accountsByProfile(
  userId: string,
  profileIds: string[],
  db: CustomShellDb = defaultDb
): Promise<Map<string, Array<{ id: string; platform: string; handle: string; blocked: boolean }>>> {
  const out = new Map<string, Array<{ id: string; platform: string; handle: string; blocked: boolean }>>()
  if (!profileIds.length) return out
  const rows = await db
    .select({
      id: promoAccounts.id,
      profileId: promoAccounts.profileId,
      platform: promoAccounts.platform,
      handle: promoAccounts.handle,
      blocked: promoAccounts.blocked,
    })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), inArray(promoAccounts.profileId, profileIds)))
  for (const row of rows) {
    if (!row.profileId) continue
    const list = out.get(row.profileId) ?? []
    list.push({ id: row.id, platform: row.platform, handle: row.handle, blocked: row.blocked })
    out.set(row.profileId, list)
  }
  return out
}

async function readAccountRow(userId: string, db: CustomShellDb) {
  const [row] = await db
    .select({ account: promoAccounts, profileName: promoProfiles.name, voiceName: promoVoices.name })
    .from(promoAccounts)
    .leftJoin(promoProfiles, eq(promoProfiles.id, promoAccounts.profileId))
    .leftJoin(promoVoices, eq(promoVoices.id, promoAccounts.voiceId))
    .where(
      and(
        eq(promoAccounts.userId, userId),
        eq(promoAccounts.platform, "reddit"),
        isNull(promoAccounts.retiredAt)
      )
    )
    .orderBy(asc(promoAccounts.createdAt), asc(promoAccounts.id))
    .limit(1)
  if (!row) return null
  const { account, profileName, voiceName } = row
  return {
    ...account,
    profile:
      account.profileId && profileName !== null
        ? { id: account.profileId, name: profileName }
        : null,
    voiceRef:
      account.voiceId && voiceName !== null ? { id: account.voiceId, name: voiceName } : null,
  }
}

/** Whether a job of this kind for this profile is already waiting or running. */
export async function hasPendingJob(
  userId: string,
  kind: "open" | "close" | "check" | "site_check" | "backup" | "restore",
  profileId: string,
  db: CustomShellDb = defaultDb
): Promise<boolean> {
  const [row] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, kind),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'profileId' = ${profileId}`
      )
    )
    .limit(1)
  return Boolean(row)
}
