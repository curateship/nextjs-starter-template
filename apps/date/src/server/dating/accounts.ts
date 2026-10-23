import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"

import { DATING_SAVED_VIEW_KIND } from "@/lib/dating/lead-views"
import { DATING_APP_WORDS, PROFILE_NAME_MAX, type DatingApp } from "@/lib/dating/options"
import { savedViewScreen } from "@/lib/saved-views"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { cancelPhoneActions, phoneIsHere } from "@/server/phone/link"
import { deletePictures } from "@/server/phone/pictures"
import { datePhones } from "@/server/phone/schema"
import { customShellSavedViews } from "@/server/schema"
import { appHasWalk, cancelProfileWalks, queueWalk } from "@/server/tinder/jobs"
import { swipeLimits } from "@/server/tinder/limits"
import { dateMatches, dateOwnProfiles, dateProfiles } from "@/server/tinder/schema"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { dateAccountPicks, dateAccounts, dateSettings } from "./schema"
import { readDatingSettings } from "./settings"

/**
 * Profiles (task "features/06-profiles", Tyler, 20 Oct 2026): one member runs
 * several dating profiles, each one app's account, and the Dating dashboard
 * shows the one picked. The pick is kept on the server, so it is the same on
 * every device, and every server function acts on the picked profile; the
 * browser names a profile only to switch to it, pause it or delete it. Only
 * the member who made a profile sees it.
 */

export type DatingAccount = typeof dateAccounts.$inferSelect

/** The member's profiles on this site, oldest first. */
export async function listAccounts(userId: string, workspaceId: string, db: CustomShellDb = defaultDb): Promise<DatingAccount[]> {
  return db
    .select()
    .from(dateAccounts)
    .where(and(eq(dateAccounts.userId, userId), eq(dateAccounts.workspaceId, workspaceId)))
    .orderBy(asc(dateAccounts.createdAt), asc(dateAccounts.id))
}

/** One of the member's profiles on this site, or a refusal. Another member's profile is refused the same way. */
export async function ownAccount(userId: string, workspaceId: string, accountId: string, db: CustomShellDb = defaultDb): Promise<DatingAccount> {
  const [account] = await db
    .select()
    .from(dateAccounts)
    .where(and(eq(dateAccounts.id, accountId), eq(dateAccounts.userId, userId), eq(dateAccounts.workspaceId, workspaceId)))
    .limit(1)
  if (!account) throw new Error("That profile is gone.")
  return account
}

/**
 * The profile the Dating dashboard shows: the one last picked, else the
 * first. A member with none gets a first Tinder profile, made once even when
 * two requests ask at the same moment.
 */
export async function openAccount(userId: string, workspaceId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<DatingAccount> {
  const [picked] = await db
    .select({ account: dateAccounts })
    .from(dateAccountPicks)
    .innerJoin(dateAccounts, eq(dateAccounts.id, dateAccountPicks.accountId))
    .where(and(eq(dateAccountPicks.userId, userId), eq(dateAccountPicks.workspaceId, workspaceId)))
    .limit(1)
  if (picked) return picked.account
  const [first] = await listAccounts(userId, workspaceId, db)
  if (first) return first
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`date-account:${userId}:${workspaceId}`}))`)
    const [made] = await listAccounts(userId, workspaceId, tx)
    if (made) return made
    const account = { id: uuid(), userId, workspaceId, app: "tinder" as const, name: DATING_APP_WORDS.tinder.name, createdAt: now, updatedAt: now }
    const [row] = await tx.insert(dateAccounts).values(account).returning()
    return row
  })
}

/** The profile open for the member signed in on this request's site. */
export async function requestAccount(userId: string): Promise<DatingAccount> {
  return openAccount(userId, await workspaceIdForRequest(userId))
}

/** Switching profile on the dashboard. Kept for the member, so every device opens it. */
export async function pickAccount(userId: string, workspaceId: string, accountId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  await ownAccount(userId, workspaceId, accountId, db)
  await db
    .insert(dateAccountPicks)
    .values({ userId, workspaceId, accountId, updatedAt: now })
    .onConflictDoUpdate({ target: [dateAccountPicks.userId, dateAccountPicks.workspaceId], set: { accountId, updatedAt: now } })
}

/**
 * New profile: a name and an app, with a copy of the open profile's settings
 * (Tyler, 20 Oct 2026). A Google Calendar is never copied: each profile
 * connects its own. It is not picked here: the dashboard keeps showing the
 * open profile while New profile shows the new one's pair code, and picks it
 * when that window closes. Hinge is refused until its walks are built.
 */
export async function createAccount(
  from: DatingAccount,
  input: { name: string; app: DatingApp },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<DatingAccount> {
  const name = input.name.trim().replace(/\s+/g, " ")
  if (!name) throw new Error("Give the profile a name.")
  if (name.length > PROFILE_NAME_MAX) throw new Error(`A profile's name is at most ${PROFILE_NAME_MAX} letters.`)
  if (!DATING_APP_WORDS[input.app].ready) throw new Error(`${DATING_APP_WORDS[input.app].name} isn't ready yet. Date runs Tinder and Facebook Dating for now.`)
  const [account] = await db
    .insert(dateAccounts)
    .values({ id: uuid(), userId: from.userId, workspaceId: from.workspaceId, app: input.app, name, createdAt: now, updatedAt: now })
    .returning()
  const copied = await readDatingSettings(from.id, db)
  // Facebook Dating starts at its own pace, 50 a day and 20 an hour (task "facebook/01", part 4).
  const limits = swipeLimits(input.app, copied)
  const settings = { ...copied, swipesPerDay: limits.perDay, swipesPerHour: limits.perHour }
  // Copied straight, not through the settings check: the new profile has no
  // phone yet, so its hours can clash with nobody.
  await db.insert(dateSettings).values({ accountId: account.id, userId: account.userId, workspaceId: account.workspaceId, values: settings, updatedAt: now })
  return account
}

/** Renaming a profile, from its settings window. */
export async function renameAccount(account: DatingAccount, name: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const clean = name.trim().replace(/\s+/g, " ")
  if (!clean) throw new Error("Give the profile a name.")
  if (clean.length > PROFILE_NAME_MAX) throw new Error(`A profile's name is at most ${PROFILE_NAME_MAX} letters.`)
  await db.update(dateAccounts).set({ name: clean, updatedAt: now }).where(eq(dateAccounts.id, account.id))
}

/** Words a stopped loop shows for a paused profile. */
const PAUSED_WORDS = "The profile was paused."

/**
 * Pause stops a profile's swiping, replies and AI calls until Resume: the
 * background pass skips it, its loop stops, and its walks waiting on the
 * phone are called off. Resume starts nothing by itself; the schedule or
 * Start does.
 *
 * On Facebook Dating, Pause also turns on Dating's own break so nobody sees
 * the profile while Date isn't answering, and Resume turns it off (part 22 of
 * "facebook/01", Tyler's "Yes, both ways"). The phone reads the switch back;
 * a break it could not set shows as a failed walk in the Phone panel.
 */
export async function setAccountPaused(account: DatingAccount, paused: boolean, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  await db
    .update(dateAccounts)
    .set({ pausedAt: paused ? now : null, ...(paused ? { running: false, stopWhy: PAUSED_WORDS, stopWhyAt: now } : {}), updatedAt: now })
    .where(eq(dateAccounts.id, account.id))
  if (!account.phoneId) return
  if (paused) await cancelProfileWalks(account.id, `${PAUSED_WORDS} Nothing was done.`, db, now)
  if (!appHasWalk(account.app, "set-break")) return
  try {
    await queueWalk({ userId: account.userId, accountId: account.id, phoneId: account.phoneId, kind: "set-break", input: { on: paused }, askedBy: "member" }, db, now)
  } catch (error) {
    // Paused all the same on Date's side: the Phone panel shows the break as not set.
    console.error(`Facebook Dating's break could not be put on phone ${account.phoneId}'s list`, error)
  }
}

/** What Delete takes with it, for the confirm's words. */
export async function accountCounts(accountId: string, db: CustomShellDb = defaultDb): Promise<{ leads: number; chats: number }> {
  const [[cards], [chats]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(dateProfiles).where(eq(dateProfiles.accountId, accountId)),
    db
      .select({ count: sql<number>`count(*)::int`, cardless: sql<number>`(count(*) filter (where ${dateMatches.profileId} is null))::int` })
      .from(dateMatches)
      .where(eq(dateMatches.accountId, accountId)),
  ])
  return { leads: cards.count + chats.cardless, chats: chats.count }
}

/**
 * Delete, after the confirm: the profile goes with its cards, chats,
 * messages, walks, own profile, settings and Google Calendar (the database
 * cascades them), and the pictures nothing else of the member's still shows.
 * Its phone is unpaired and forgotten, so it can be paired for another
 * profile, unless another profile still runs on it. The member's next load
 * opens their first profile, or a new one when this was the last.
 */
export async function deleteAccount(account: DatingAccount, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const [cards, chats, own] = await Promise.all([
    db.select({ photoIds: dateProfiles.photoIds, instagramPhotoIds: dateProfiles.instagramPhotoIds }).from(dateProfiles).where(eq(dateProfiles.accountId, account.id)),
    db.select({ photoId: dateMatches.photoId }).from(dateMatches).where(eq(dateMatches.accountId, account.id)),
    db.select({ photoIds: dateOwnProfiles.photoIds }).from(dateOwnProfiles).where(eq(dateOwnProfiles.accountId, account.id)),
  ])
  // The stop screen's picture is the profile's own and goes with it.
  const pictures = new Set([
    ...cards.flatMap((card) => [...card.photoIds, ...card.instagramPhotoIds]),
    ...chats.flatMap((chat) => (chat.photoId ? [chat.photoId] : [])),
    ...own.flatMap((row) => row.photoIds),
    ...(account.stoppedPictureId ? [account.stoppedPictureId] : []),
  ])

  await db.delete(dateAccounts).where(eq(dateAccounts.id, account.id))
  await db
    .delete(customShellSavedViews)
    .where(and(eq(customShellSavedViews.userId, account.userId), eq(customShellSavedViews.screen, savedViewScreen(DATING_SAVED_VIEW_KIND, account.id))))

  if (account.phoneId) {
    const [shared] = await db.select({ id: dateAccounts.id }).from(dateAccounts).where(eq(dateAccounts.phoneId, account.phoneId)).limit(1)
    if (!shared) {
      await cancelPhoneActions(account.phoneId, "The profile was deleted.", db, now)
      await db.delete(datePhones).where(eq(datePhones.id, account.phoneId))
    }
  }

  // The profile is gone by now, so a picture left behind is only storage: it never undoes the delete.
  try {
    await deleteUnshownPictures(account.userId, [...pictures], db)
  } catch (error) {
    console.error("A deleted profile's pictures could not all be removed", error)
  }
}

/**
 * Deletes the pictures no card, chat or own profile of the member's still
 * shows. A picture is kept once per member, so another profile's card may
 * show the same one. The ids go to the database as one value, so a profile
 * of any size fits in one query.
 */
async function deleteUnshownPictures(userId: string, ids: string[], db: CustomShellDb): Promise<void> {
  if (!ids.length) return
  const asked = sql`array(select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))`
  const [stillCards, stillChats, stillOwn] = await Promise.all([
    db
      .select({ photoIds: dateProfiles.photoIds, instagramPhotoIds: dateProfiles.instagramPhotoIds })
      .from(dateProfiles)
      .where(and(eq(dateProfiles.userId, userId), sql`(${dateProfiles.photoIds} ?| ${asked} or ${dateProfiles.instagramPhotoIds} ?| ${asked})`)),
    db.select({ photoId: dateMatches.photoId }).from(dateMatches).where(and(eq(dateMatches.userId, userId), sql`${dateMatches.photoId} = any(${asked})`)),
    db.select({ photoIds: dateOwnProfiles.photoIds }).from(dateOwnProfiles).where(eq(dateOwnProfiles.userId, userId)),
  ])
  const shown = new Set([...stillCards.flatMap((row) => [...row.photoIds, ...row.instagramPhotoIds]), ...stillChats.map((row) => row.photoId), ...stillOwn.flatMap((row) => row.photoIds)])
  await deletePictures(
    ids.filter((id) => !shown.has(id)),
    db
  )
}

/** One profile as the picker and the Profiles section show it. */
export type ProfileListItem = {
  id: string
  name: string
  app: DatingApp
  paused: boolean
  /** The phone it runs on, and whether that phone checked in within the last 45 seconds. */
  phone: { name: string; here: boolean } | null
  /** Leads waiting on the member: a draft to send, a flag to look at, or the AI's question. */
  waiting: number
  /** The first photo on the profile's own profile, once the phone has read it. */
  photoId: string | null
}

/**
 * Every profile of the member's, with its phone and how many leads wait on
 * them, counted the way the lead list counts them (`chatWaiting` in
 * `src/lib/dating/leads.ts`): a live chat that is flagged, or holds a draft
 * the AI is not about to send by itself.
 */
export async function listProfiles(userId: string, workspaceId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<ProfileListItem[]> {
  const accounts = await listAccounts(userId, workspaceId, db)
  if (!accounts.length) return []
  const ids = accounts.map((account) => account.id)
  const phoneIds = accounts.flatMap((account) => (account.phoneId ? [account.phoneId] : []))
  const live = and(inArray(dateMatches.accountId, ids), isNull(dateMatches.unmatchedAt), isNull(dateMatches.movedToTextAt), isNull(dateMatches.endedAt))
  const unflaggedDraft = sql`${dateMatches.flaggedReason} is null and ${dateMatches.draft} <> '' and not ${dateMatches.aiOff}`
  const [phones, own, counts, settings] = await Promise.all([
    phoneIds.length
      ? db.select({ id: datePhones.id, name: datePhones.name, keyEncrypted: datePhones.keyEncrypted, lastSeenAt: datePhones.lastSeenAt }).from(datePhones).where(inArray(datePhones.id, phoneIds))
      : Promise.resolve([]),
    db.select({ accountId: dateOwnProfiles.accountId, photoIds: dateOwnProfiles.photoIds }).from(dateOwnProfiles).where(inArray(dateOwnProfiles.accountId, ids)),
    db
      .select({
        accountId: dateMatches.accountId,
        flagged: sql<number>`(count(*) filter (where ${dateMatches.flaggedReason} is not null))::int`,
        drafts: sql<number>`(count(*) filter (where ${unflaggedDraft} and ${dateMatches.draftSendAt} is null))::int`,
        timed: sql<number>`(count(*) filter (where ${unflaggedDraft} and ${dateMatches.draftSendAt} is not null))::int`,
      })
      .from(dateMatches)
      .where(live)
      .groupBy(dateMatches.accountId),
    Promise.all(accounts.map((account) => readDatingSettings(account.id, db))),
  ])
  const phoneById = new Map(phones.map((phone) => [phone.id, phone]))
  const photoByAccount = new Map(own.map((row) => [row.accountId, row.photoIds[0] ?? null]))
  const countsByAccount = new Map(counts.map((row) => [row.accountId, row]))
  return accounts.map((account, index) => {
    const phone = account.phoneId ? phoneById.get(account.phoneId) : undefined
    const count = countsByAccount.get(account.id)
    // With automate on, a draft with a send time goes by itself and waits on nobody.
    const waiting = count ? count.flagged + count.drafts + (settings[index].automate ? 0 : count.timed) : 0
    return {
      id: account.id,
      name: account.name,
      app: account.app,
      paused: account.pausedAt !== null,
      phone: phone ? { name: phone.name, here: phone.keyEncrypted !== null && phoneIsHere(phone.lastSeenAt, now) } : null,
      waiting,
      photoId: photoByAccount.get(account.id) ?? null,
    }
  })
}
