import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm"

import type { AccountImportance } from "@/lib/social/importance"
import { aNetwork, handleWords, isNetwork, isPhoneAppNetwork, NETWORK_NAMES, type Network } from "@/lib/social/networks"
import { uuid } from "@/server/auth/security"
import { promoProfiles } from "@/server/browser/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { recordPhoneEvent } from "@/server/phones/history"
import { promoPhones } from "@/server/phones/schema"
import { isTestPhone } from "@/server/phones/self-test"
import { noteAccountLeftPhone, refusePhoneNotReady } from "@/server/phones/wipe"

import {
  noteImportantOnPhone,
  refuseImportantOnProfile,
  refuseMixedVoice,
  refuseThrowawayOnImportantPhone,
} from "./apart"
import { readBehaviour } from "./behaviour"
import { promoAccounts, promoJobs, promoVoices } from "./schema"
import { promoLinkedinSearchers } from "./linkedin/schema"
import { promoXSearchers } from "./x/schema"

/**
 * The Reddit accounts, as records a person picks for.
 *
 * An account owns neither its browser nor its words. It runs on a browser
 * profile, managed on the Browser profiles dashboard, or on a phone, managed
 * on the Phones dashboard, never both. It points at a voice, managed on the
 * Voices dashboard. There can be any number of accounts, one per
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
  /** The phone it runs on instead, or null. Never set beside a profile. */
  phone: { id: string; name: string } | null
  /** The voice it drafts with. Null when none was picked, or it was deleted. */
  voice: { id: string; name: string } | null
  importance: AccountImportance
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
    phone: account.phone,
    voice: account.voiceRef,
    importance: account.importance,
  }
}

export type SaveAccountInput = {
  /** The browser profile the account signs in inside, or null for none. */
  profileId: string | null
  /** The phone it runs on instead, or null. At most one of the two is set. */
  phoneId: string | null
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

  // Set by hand, so a move to a phone that was waiting is off.
  const fields = { profileId: input.profileId, phoneId: input.phoneId, voiceId: input.voiceId, movingToPhoneId: null }

  if (existing) {
    await db
      .update(promoAccounts)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(promoAccounts.id, existing.id), eq(promoAccounts.userId, userId)))
  } else {
    await db.insert(promoAccounts).values({ id: uuid(), userId, platform: "reddit", ...fields })
  }
  await notePhoneMove(
    userId,
    { handle: existing?.handle ?? "", importance: existing?.importance ?? "throwaway" },
    existing?.phone?.id ?? null,
    input.phoneId,
    db
  )

  const saved = await readAccount(userId, db)
  if (!saved) throw new Error("The account could not be read back after saving.")
  return saved
}

/**
 * Adds another account from the Accounts dashboard: Reddit on a browser
 * profile or a phone of its own, Instagram or TikTok on a phone only. It is
 * signed in there afterwards, and starts in no project.
 */
export async function addAccount(
  userId: string,
  input: SaveAccountInput & { platform?: Network },
  db: CustomShellDb = defaultDb
): Promise<string> {
  const platform = input.platform ?? "reddit"
  if (!isNetwork(platform)) throw new Error("Promo cannot use that network yet.")
  if (!input.profileId && !input.phoneId) {
    throw new Error(
      isPhoneAppNetwork(platform)
        ? `Pick the phone the ${NETWORK_NAMES[platform]} account runs on.`
        : "Pick the browser profile or the phone the account runs on."
    )
  }
  await checkPicks(userId, input, null, db, platform)
  const id = uuid()
  await db.insert(promoAccounts).values({
    id,
    userId,
    platform,
    profileId: input.profileId,
    phoneId: input.phoneId,
    voiceId: input.voiceId,
  })
  await notePhoneMove(userId, { handle: "", importance: "throwaway", platform }, null, input.phoneId, db)
  return id
}

/**
 * Moves an account to another browser profile or phone, from the row's
 * settings on the Reddit accounts dashboard. Whatever it ran on before is
 * cleared in the same write, so it is never on two at once.
 */
export async function setAccountRunsOn(
  userId: string,
  accountId: string,
  input: Pick<SaveAccountInput, "profileId" | "phoneId">,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (!input.profileId && !input.phoneId) {
    throw new Error("Pick the browser profile or the phone the account runs on.")
  }
  const [before] = await db
    .select({
      handle: promoAccounts.handle,
      phoneId: promoAccounts.phoneId,
      importance: promoAccounts.importance,
      platform: promoAccounts.platform,
    })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!before) throw new Error("That account is not there any more.")
  await checkPicks(userId, { ...input, voiceId: null }, accountId, db, isNetwork(before.platform) ? before.platform : "reddit")
  await db
    .update(promoAccounts)
    // Set by hand, so a move to a phone that was waiting is off.
    .set({ profileId: input.profileId, phoneId: input.phoneId, movingToPhoneId: null, updatedAt: new Date() })
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
  await notePhoneMove(userId, before, before.phoneId, input.phoneId, db)
}

/**
 * A line in each phone's history when a Reddit account moves onto it or off
 * it. The phone it left needs wiping before another account goes on
 * (part 26 of the phone farm), and a phone an important account went onto
 * is marked as having held one (part 22).
 */
async function notePhoneMove(
  userId: string,
  account: { handle: string; importance: string; platform?: string },
  from: string | null,
  to: string | null,
  db: CustomShellDb
): Promise<void> {
  if (from === to) return
  const platform = account.platform ?? "reddit"
  const name = account.handle
    ? handleWords(platform, account.handle)
    : `${isNetwork(platform) ? aNetwork(platform, true) : `A ${platform}`} account`
  if (from) {
    await recordPhoneEvent(userId, from, "account_moved", `${name} moved off it. It needs wiping before another account goes on.`, db)
    await noteAccountLeftPhone(userId, from, db)
  }
  if (to) {
    await recordPhoneEvent(userId, to, "account_moved", `${name} moved onto it.`, db)
    if (account.importance === "important") await noteImportantOnPhone(userId, to, db)
  }
}

/**
 * Refuses a profile, phone or voice that cannot be used, by name, before the
 * database's own rule would refuse it with an index name: both a profile and
 * a phone at once, a profile or phone that is not theirs, the reader browser,
 * a profile or phone that already holds another Reddit account, and a voice
 * that is not theirs.
 */
async function checkPicks(
  userId: string,
  input: SaveAccountInput,
  accountId: string | null,
  db: CustomShellDb,
  platform: Network = "reddit"
): Promise<void> {
  if (input.profileId && input.phoneId) {
    throw new Error("An account runs on a browser profile or a phone, never both.")
  }
  // Instagram and TikTok are built for the phone, and a desktop browser
  // stands out there (phone farm file 06).
  if (input.profileId && isPhoneAppNetwork(platform)) {
    throw new Error(
      `${aNetwork(platform, true)} account runs on a phone only, in the ${NETWORK_NAMES[platform]} app, never on a browser profile. Pick a phone.`
    )
  }
  const networkName = NETWORK_NAMES[platform]

  // Important and throwaway accounts are kept apart (part 22 of the phone
  // farm); a new account is a throwaway until it is marked.
  const [self] = accountId
    ? await db
        .select({ handle: promoAccounts.handle, importance: promoAccounts.importance, movingToPhoneId: promoAccounts.movingToPhoneId })
        .from(promoAccounts)
        .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
        .limit(1)
    : []
  const group = self ?? { handle: "", importance: "throwaway" as const, movingToPhoneId: null }
  refuseImportantOnProfile(group, input)
  await refuseThrowawayOnImportantPhone(userId, group, input.phoneId, db)
  await refusePhoneNotReady(userId, input.phoneId, accountId, db)

  if (input.phoneId) {
    const [phone] = await db
      .select({ name: promoPhones.name })
      .from(promoPhones)
      .where(and(eq(promoPhones.id, input.phoneId), eq(promoPhones.userId, userId)))
      .limit(1)
    if (!phone) throw new Error("That phone does not exist.")
    if (await isTestPhone(input.phoneId, db)) {
      throw new Error(
        `The phone ${phone.name} is the self-test phone, which carries only its test account. Pick another phone, or change the self-test phone in Settings → Phones.`
      )
    }
    const [taken] = await db
      .select({ id: promoAccounts.id })
      .from(promoAccounts)
      .where(
        and(
          eq(promoAccounts.phoneId, input.phoneId),
          eq(promoAccounts.platform, platform),
          ...(accountId ? [ne(promoAccounts.id, accountId)] : [])
        )
      )
      .limit(1)
    if (taken) {
      throw new Error(
        `The phone ${phone.name} already has ${aNetwork(platform)} account on it. One ${networkName} account per phone, or they sign in over each other.`
      )
    }
    // Only Reddit, X and LinkedIn accounts are moved onto phones from a browser profile.
    const [incoming] = platform !== "reddit" && platform !== "x" && platform !== "linkedin" ? [] : await db
      .select({ handle: promoAccounts.handle })
      .from(promoAccounts)
      .where(
        and(
          eq(promoAccounts.movingToPhoneId, input.phoneId),
          eq(promoAccounts.userId, userId),
          eq(promoAccounts.platform, platform),
          isNull(promoAccounts.retiredAt),
          ...(accountId ? [ne(promoAccounts.id, accountId)] : [])
        )
      )
      .limit(1)
    if (incoming) {
      throw new Error(
        `The phone ${phone.name} already has ${aNetwork(platform)} account on it, or one on its way. One ${networkName} account per phone: ${handleWords(platform, incoming.handle)} is being moved onto it.`
      )
    }
  }

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
    const [searcher] = await db
      .select({ id: promoXSearchers.id })
      .from(promoXSearchers)
      .where(eq(promoXSearchers.profileId, input.profileId))
      .limit(1)
    if (searcher) {
      throw new Error(
        `The profile ${profile.name} is an X search account, which only ever reads. Pick another profile, or take it off under X in Settings → Behaviour.`
      )
    }
    const [linkedinSearcher] = await db
      .select({ id: promoLinkedinSearchers.id })
      .from(promoLinkedinSearchers)
      .where(eq(promoLinkedinSearchers.profileId, input.profileId))
      .limit(1)
    if (linkedinSearcher) {
      throw new Error(
        `The profile ${profile.name} is a LinkedIn search account, which only ever reads. Pick another profile, or take it off under LinkedIn in Settings → Behaviour.`
      )
    }

    const [taken] = await db
      .select({ id: promoAccounts.id })
      .from(promoAccounts)
      .where(
        and(
          eq(promoAccounts.profileId, input.profileId),
          eq(promoAccounts.platform, platform),
          ...(accountId ? [ne(promoAccounts.id, accountId)] : [])
        )
      )
      .limit(1)
    if (taken) {
      throw new Error(
        `The profile ${profile.name} already has ${aNetwork(platform)} account in it. One ${networkName} account per profile, or they sign in over each other.`
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
    await refuseMixedVoice(userId, { id: accountId, ...group }, input.voiceId, db)
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
    .select({
      account: promoAccounts,
      profileName: promoProfiles.name,
      phoneName: promoPhones.name,
      voiceName: promoVoices.name,
    })
    .from(promoAccounts)
    .leftJoin(promoProfiles, eq(promoProfiles.id, promoAccounts.profileId))
    .leftJoin(promoPhones, eq(promoPhones.id, promoAccounts.phoneId))
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
  const { account, profileName, phoneName, voiceName } = row
  return {
    ...account,
    profile:
      account.profileId && profileName !== null
        ? { id: account.profileId, name: profileName }
        : null,
    phone: account.phoneId && phoneName !== null ? { id: account.phoneId, name: phoneName } : null,
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
