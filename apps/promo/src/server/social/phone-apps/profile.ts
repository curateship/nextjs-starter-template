import { and, desc, eq, inArray } from "drizzle-orm"

import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { isOwnedImageUrl } from "@/server/media/library"
import { formatDateTime } from "@/lib/format/format-time"
import { isPhoneAppNetwork, NETWORK_NAMES } from "@/lib/social/networks"
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  LINK_MAX,
  PROFILE_EDIT_WAIT_HOURS,
  type ProfileEditStatus,
} from "@/lib/social/phone-apps"

import { queueJob } from "../jobs"
import { promoAccounts, promoJobs, promoProfileEdits } from "../schema"
import { appProfile } from "./calls"
import { lockAccountWrites, ownAccount, refuseAppAccount } from "./posts"

/**
 * An Instagram or TikTok account's profile, set from Promo and applied in the
 * app by its phone (phone farm file 06, part 33): the name shown, the bio,
 * the link and the picture, from the media library. Only the fields given
 * change.
 *
 * Refused in the account's first day after it signed in on the phone, since a
 * new sign-in followed at once by a new name, bio and picture is what a
 * taken-over account looks like, and can bring on a "confirm it's you"
 * check. One change at a time per account, tried once and never again.
 */

type AccountRow = typeof promoAccounts.$inferSelect

type ProfileEditInput = {
  displayName: string | null
  bio: string | null
  link: string | null
  pictureUrl: string | null
}

/** The fields cleaned, each null when left as it is, or a refusal saying what is wrong. */
export function cleanProfileEdit(platform: string, input: ProfileEditInput): ProfileEditInput {
  if (!isPhoneAppNetwork(platform)) throw new Error("Only an Instagram or TikTok profile is changed from here.")
  const displayName = input.displayName === null ? null : input.displayName.trim()
  const bio = input.bio === null ? null : input.bio.trim()
  const link = input.link === null ? null : input.link.trim()
  const pictureUrl = input.pictureUrl === null || input.pictureUrl === "" ? null : input.pictureUrl
  if (displayName !== null && displayName.length > DISPLAY_NAME_MAX) {
    throw new Error(`The name is ${displayName.length} characters, and ${NETWORK_NAMES[platform]} allows ${DISPLAY_NAME_MAX}.`)
  }
  if (bio !== null && bio.length > BIO_MAX[platform]) {
    throw new Error(`The bio is ${bio.length} characters, and ${NETWORK_NAMES[platform]} allows ${BIO_MAX[platform]}.`)
  }
  if (link !== null && link) {
    if (link.length > LINK_MAX) throw new Error(`The link is longer than ${LINK_MAX} characters.`)
    let parsed: URL | null = null
    try {
      parsed = new URL(link)
    } catch {
      parsed = null
    }
    if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) {
      throw new Error("The link has to be a web address starting with https://.")
    }
  }
  if (displayName === null && bio === null && link === null && pictureUrl === null) {
    throw new Error("Change the name, the bio, the link or the picture first.")
  }
  return { displayName, bio, link, pictureUrl }
}

/** When a profile change may go, or null when it may go now. */
function profileEditOpensAt(signedInAt: Date | null, now: Date = new Date()): Date | null {
  if (!signedInAt) return null
  const opens = new Date(signedInAt.getTime() + PROFILE_EDIT_WAIT_HOURS * 3_600_000)
  return opens > now ? opens : null
}

/**
 * Sends a profile change to the account's phone, because a person pressed
 * Apply. Refused in the account's first day after signing in, while one
 * change is still on its way, and for a picture that is not one of this
 * person's own uploaded images.
 */
export async function queueProfileEdit(
  userId: string,
  accountId: string,
  input: ProfileEditInput,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ id: string }> {
  const account = await ownAccount(userId, accountId, db)
  const network = await refuseAppAccount(userId, account, `${account.platform}/profile`, db)
  const fields = cleanProfileEdit(network, input)
  if (!account.signedInAt) {
    throw new Error(
      `${NETWORK_NAMES[network]} has not been read signed in on the phone yet, so the first day cannot be counted. Press Check now on the Accounts dashboard once it is signed in.`
    )
  }
  const opens = profileEditOpensAt(account.signedInAt, now)
  if (opens) {
    throw new Error(
      `The account signed in on its phone less than a day ago. A new profile straight after a new sign-in looks like a taken-over account and can bring on a check, so it may be changed from ${formatDateTime(opens)}.`
    )
  }
  if (fields.pictureUrl && !(await isOwnedImageUrl(userId, fields.pictureUrl, db))) {
    throw new Error("That picture is not one of your uploaded images. Pick or upload it again.")
  }
  const id = uuid()
  const jobId = uuid()
  await db.transaction(async (tx) => {
    await lockAccountWrites(tx, account.id)
    const [waiting] = await tx
      .select({ id: promoProfileEdits.id })
      .from(promoProfileEdits)
      .innerJoin(promoJobs, eq(promoJobs.id, promoProfileEdits.jobId))
      .where(
        and(
          eq(promoProfileEdits.accountId, account.id),
          eq(promoProfileEdits.status, "waiting"),
          inArray(promoJobs.status, ["queued", "running"])
        )
      )
      .limit(1)
    if (waiting) throw new Error("A profile change for this account is already on its way. Wait for it to finish first.")
    await tx.insert(promoProfileEdits).values({ id, userId, accountId: account.id, ...fields, jobId, createdAt: now })
    await queueJob(userId, "app_profile", { accountId: account.id, editId: id }, tx, null, jobId)
  })
  return { id }
}

/**
 * Runs an `app_profile` job on the phone. The bio is read back off the
 * profile afterwards; one that does not match fails the change rather than
 * calling it done.
 */
export async function runProfileEdit(
  userId: string,
  account: AccountRow,
  target: CommandTarget,
  payload: Record<string, unknown>,
  jobId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (!isPhoneAppNetwork(account.platform)) throw new Refusal("Only an Instagram or TikTok profile is changed from here.")
  const editId = String(payload.editId ?? "")
  const [edit] = editId
    ? await db
        .select()
        .from(promoProfileEdits)
        .where(and(eq(promoProfileEdits.id, editId), eq(promoProfileEdits.userId, userId)))
        .limit(1)
    : []
  if (!edit || edit.status !== "waiting" || edit.jobId !== jobId) {
    throw new Refusal("That profile change is not waiting for this job any more. Nothing was changed.")
  }
  try {
    const answer = await appProfile(target, account.platform, {
      displayName: edit.displayName,
      bio: edit.bio,
      link: edit.link,
      pictureUrl: edit.pictureUrl,
    })
    if (edit.bio !== null && answer.bioAfter !== null && answer.bioAfter.trim() !== edit.bio.trim()) {
      throw new Error(`The phone saved the bio, but the profile shows "${answer.bioAfter.slice(0, 200)}" afterwards.`)
    }
    await db
      .update(promoProfileEdits)
      .set({ status: "done", lastError: "", finishedAt: now })
      .where(eq(promoProfileEdits.id, edit.id))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(promoProfileEdits)
      .set({ status: "failed", lastError: message.slice(0, 2_000), finishedAt: now })
      .where(eq(promoProfileEdits.id, edit.id))
    throw error
  }
}

export type ProfileEditView = {
  displayName: string | null
  bio: string | null
  link: string | null
  pictureUrl: string | null
  /** A change whose job failed or was dropped reads as failed, with why. */
  status: ProfileEditStatus
  lastError: string
  createdAt: Date
}

/**
 * The account's profile as Promo last set it, field by field from the newest
 * change that carried each, and the newest change's state. Null fields were
 * never set from Promo.
 */
export async function readProfileEdits(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{
  last: ProfileEditView | null
  applied: ProfileEditInput
  opensAt: Date | null
  signedIn: boolean
}> {
  const account = await ownAccount(userId, accountId, db)
  const rows = await db
    .select({ edit: promoProfileEdits, jobStatus: promoJobs.status, jobError: promoJobs.lastError })
    .from(promoProfileEdits)
    .leftJoin(promoJobs, eq(promoJobs.id, promoProfileEdits.jobId))
    .where(and(eq(promoProfileEdits.userId, userId), eq(promoProfileEdits.accountId, accountId)))
    .orderBy(desc(promoProfileEdits.createdAt))
    .limit(50)
  const applied: ProfileEditInput = { displayName: null, bio: null, link: null, pictureUrl: null }
  for (const { edit } of rows) {
    if (edit.status !== "done") continue
    applied.displayName ??= edit.displayName
    applied.bio ??= edit.bio
    applied.link ??= edit.link
    applied.pictureUrl ??= edit.pictureUrl
  }
  const newest = rows[0]
  const lost = newest?.edit.status === "waiting" && (newest.jobStatus === "failed" || newest.jobStatus === null)
  return {
    last: newest
      ? {
          displayName: newest.edit.displayName,
          bio: newest.edit.bio,
          link: newest.edit.link,
          pictureUrl: newest.edit.pictureUrl,
          status: lost ? "failed" : newest.edit.status,
          lastError: lost ? newest.jobError || "The phone did not change it." : newest.edit.lastError,
          createdAt: newest.edit.createdAt,
        }
      : null,
    applied,
    opensAt: profileEditOpensAt(account.signedInAt, now),
    signedIn: Boolean(account.signedInAt),
  }
}
