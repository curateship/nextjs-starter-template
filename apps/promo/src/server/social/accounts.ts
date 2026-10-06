import { and, eq, inArray, ne, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { promoProfiles } from "@/server/browser/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { jobCounts, type JobCounts } from "./jobs"
import { promoAccounts, promoJobs, promoVoices } from "./schema"

/**
 * The one Reddit account.
 *
 * Build one has a single account on purpose, so this is a one-record form
 * rather than a table screen. The account owns neither its browser nor its
 * words. It points at a browser profile, managed on the Browser profiles
 * dashboard, and at a voice, managed on the Voices dashboard. The Reddit
 * settings tab only picks which of each.
 */

export type AccountView = {
  id: string
  handle: string
  karma: number | null
  lastPostedAt: Date | null
  /** Null when none was picked, or the one picked was deleted. */
  profile: { id: string; name: string } | null
  /** The voice it drafts with. Null when none was picked, or it was deleted. */
  voice: { id: string; name: string } | null
}

/** The account, or null when one has never been set up. */
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
 * Creates or updates the account: which browser profile and which voice.
 *
 * A profile that already holds another Reddit account is refused here with
 * its name, before the database's own rule refuses it with an index name.
 */
export async function saveAccount(
  userId: string,
  input: SaveAccountInput,
  db: CustomShellDb = defaultDb
): Promise<AccountView> {
  const existing = await readAccount(userId, db)

  if (input.profileId) {
    const [profile] = await db
      .select({ name: promoProfiles.name })
      .from(promoProfiles)
      .where(and(eq(promoProfiles.id, input.profileId), eq(promoProfiles.userId, userId)))
      .limit(1)
    if (!profile) throw new Error("That browser profile does not exist.")

    const [taken] = await db
      .select({ id: promoAccounts.id })
      .from(promoAccounts)
      .where(
        and(
          eq(promoAccounts.profileId, input.profileId),
          eq(promoAccounts.platform, "reddit"),
          ...(existing ? [ne(promoAccounts.id, existing.id)] : [])
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

export type BrowserStatus = {
  /** The Reddit handle the browser program last saw, or null. */
  handle: string | null
  /** True when a challenge or captcha needs a person at the browser. */
  blocked: boolean
  reason: string
  /** What the queue is doing, including which keywords are being searched. */
  jobs: JobCounts
  /** The profile the Reddit account uses, so a message can name it and link to it. */
  profile: { id: string; name: string } | null
  /** The voice it drafts with, or null when it drafts plainly. */
  voice: { id: string; name: string } | null
}

/**
 * What the Reddit dashboard needs to know about the browser, read from the
 * rows the browser program writes.
 *
 * Never calls a browser. Asking one which account is signed in used to send
 * its page to Reddit's front page, and the Reddit dashboard asks every two
 * seconds, so a sign-in form being typed into was replaced every two seconds.
 */
export async function readBrowserStatus(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<BrowserStatus> {
  const jobs = await jobCounts(userId, db)
  const account = await readAccountRow(userId, db)
  return {
    handle: account?.handle || null,
    blocked: account?.blocked ?? false,
    reason: account?.blockedReason ?? "",
    jobs,
    profile: account?.profile ?? null,
    voice: account?.voiceRef ?? null,
  }
}

async function readAccountRow(userId: string, db: CustomShellDb) {
  const [row] = await db
    .select({ account: promoAccounts, profileName: promoProfiles.name, voiceName: promoVoices.name })
    .from(promoAccounts)
    .leftJoin(promoProfiles, eq(promoProfiles.id, promoAccounts.profileId))
    .leftJoin(promoVoices, eq(promoVoices.id, promoAccounts.voiceId))
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "reddit")))
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
  kind: "open" | "close" | "check" | "site_check",
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
