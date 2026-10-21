import { and, asc, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm"

import { PROFILE_PAUSED_WORDS, STOP_REASON_WORDS, WALK_KINDS, type WalkKind } from "@/lib/dating/options"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { addStepPictures, callPhone, forgetWalkScreenshots, PhoneActionError } from "@/server/phone/actions"
import { cancelPhoneActions } from "@/server/phone/link"
import { keepPicture } from "@/server/phone/pictures"
import { datePhoneActions, datePhones } from "@/server/phone/schema"
import { dateAccounts } from "@/server/dating/schema"
import { readDatingSettings } from "@/server/dating/settings"

import { walkRefusal } from "./limits"
import { dateMessages, dateWalks } from "./schema"
import { outOfLikesWait } from "./stop-screens"
import { whoIsSignedIn, readOwnProfile } from "./walks/account"
import { readCard, swipe } from "./walks/card"
import { setDiscovery } from "./walks/discovery"
import { readConversation, readMatches, sendMessage, unmatch } from "./walks/chat"
import { StopScreenError, walkKit, WalkError, type PhoneDriver, type WalkContext, type WalkKit } from "./walks/kit"

/**
 * The job list of Tinder walks. The dashboard and the AI ask for a walk here
 * and nowhere else; the shell's background pass hands each phone its oldest
 * waiting walk, one at a time, and runs it.
 *
 * A walk is run apart from the pass, so a card that takes a minute to read
 * never holds up the shell's emails and automations. The walk row's lease is
 * moved on before every step; a walk past its lease belonged to a process
 * that stopped, and is marked as stopped part-way.
 */

type WalkRunner = (ctx: WalkContext, kit: WalkKit, input: Record<string, unknown>, askedBy: "member" | "ai") => Promise<Record<string, unknown>>

const WALKS: Record<WalkKind, WalkRunner> = {
  "who-is-signed-in": (ctx, kit) => whoIsSignedIn(ctx, kit),
  "read-card": (ctx, kit) => readCard(ctx, kit),
  like: (ctx, kit, input, askedBy) => swipe(ctx, kit, "like", input, askedBy),
  "super-like": (ctx, kit, input, askedBy) => swipe(ctx, kit, "super", input, askedBy),
  pass: (ctx, kit, input, askedBy) => swipe(ctx, kit, "pass", input, askedBy),
  "read-matches": (ctx, kit) => readMatches(ctx, kit),
  "read-conversation": (ctx, kit, input) => readConversation(ctx, kit, input),
  "send-message": (ctx, kit, input) => sendMessage(ctx, kit, input),
  unmatch: (ctx, kit, input) => unmatch(ctx, kit, input),
  "read-own-profile": (ctx, kit) => readOwnProfile(ctx, kit),
  "set-discovery": (ctx, kit, input) => setDiscovery(ctx, kit, input),
}

/** How long a walk may go between steps before it counts as dropped. Longer than one step's longest wait. */
const LEASE_MS = 5 * 60_000

export type WalkRequest = {
  userId: string
  /** The profile whose walk it is, which must run on this phone. */
  accountId: string
  phoneId: string
  kind: WalkKind
  input?: Record<string, unknown>
  askedBy: "member" | "ai"
}

/**
 * Whether a walk may go on this phone's list now, refused in words for a
 * paused profile, a phone that is not the profile's, not paired, switched
 * off or stopped on a Tinder screen, and for a walk a limit stops right now.
 * The few seconds between swipes are not a refusal: a swipe waits its turn on
 * the list. Returns the phone.
 */
export async function checkWalkAllowed(
  request: Pick<WalkRequest, "userId" | "accountId" | "phoneId" | "kind">,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
) {
  if (!(WALK_KINDS as readonly string[]).includes(request.kind)) throw new Error("That is not something Date does on Tinder.")
  const [[phone], [account]] = await Promise.all([
    db
      .select()
      .from(datePhones)
      .where(and(eq(datePhones.id, request.phoneId), eq(datePhones.userId, request.userId)))
      .limit(1),
    db
      .select({ phoneId: dateAccounts.phoneId, pausedAt: dateAccounts.pausedAt })
      .from(dateAccounts)
      .where(and(eq(dateAccounts.id, request.accountId), eq(dateAccounts.userId, request.userId)))
      .limit(1),
  ])
  if (!phone) throw new Error("That phone does not exist.")
  if (!account) throw new Error("That profile is gone.")
  if (account.phoneId !== phone.id) throw new Error(`${phone.name} is not this profile's phone.`)
  if (account.pausedAt) throw new Error(PROFILE_PAUSED_WORDS)
  if (!phone.keyEncrypted) throw new Error(`${phone.name} is not paired. Pair it in the dashboard's Phone panel first.`)
  if (!phone.inControl) throw new Error(`Date is switched off for ${phone.name}. Switch it on in the dashboard's Phone panel first.`)
  if (phone.stoppedReason) {
    throw new Error(`${STOP_REASON_WORDS[phone.stoppedReason]}. Press Resume in the dashboard's Phone panel once it is sorted.`)
  }
  const settings = await readDatingSettings(request.accountId, db)
  const refusal = await walkRefusal(phone, request.kind, settings, db, now)
  if (refusal && refusal.limit !== "gap") throw new Error(refusal.words)
  return phone
}

/**
 * Puts a walk on a phone's list, once `checkWalkAllowed` says it may go. The
 * same walk already waiting is not added twice.
 */
export async function queueWalk(request: WalkRequest, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<string> {
  const input = request.input ?? {}
  const phone = await checkWalkAllowed(request, db, now)

  const [same] = await db
    .select({ id: dateWalks.id })
    .from(dateWalks)
    .where(
      and(
        eq(dateWalks.phoneId, phone.id),
        eq(dateWalks.kind, request.kind),
        sql`${dateWalks.input} = ${JSON.stringify(input)}::jsonb`,
        inArray(dateWalks.status, ["waiting", "running"])
      )
    )
    .limit(1)
  if (same) return same.id

  const id = uuid()
  await db.insert(dateWalks).values({
    id,
    userId: request.userId,
    workspaceId: phone.workspaceId,
    phoneId: phone.id,
    accountId: request.accountId,
    kind: request.kind,
    input,
    askedBy: request.askedBy,
    createdAt: now,
  })
  return id
}

type WalkRow = typeof dateWalks.$inferSelect

/**
 * Takes the phone's oldest waiting walk, when none is running on it, in one
 * statement, so two processes never run the same walk. A walk a limit stops
 * now is cancelled with the limit's words, except a swipe waiting out the
 * few seconds between swipes, which waits.
 */
export async function claimNextWalk(phoneId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<WalkRow | null> {
  for (let tries = 0; tries < 5; tries += 1) {
    const [next] = await db
      .select()
      .from(dateWalks)
      .where(and(eq(dateWalks.phoneId, phoneId), eq(dateWalks.status, "waiting")))
      .orderBy(asc(dateWalks.createdAt))
      .limit(1)
    if (!next) return null
    const [phone] = await db.select().from(datePhones).where(eq(datePhones.id, phoneId)).limit(1)
    if (!phone || !phone.keyEncrypted || !phone.inControl || phone.stoppedReason) return null
    const settings = await readDatingSettings(next.accountId, db)
    const refusal = await walkRefusal(phone, next.kind, settings, db, now)
    if (refusal?.limit === "gap") return null
    if (refusal) {
      await db
        .update(dateWalks)
        .set({ status: "cancelled", error: refusal.words, finishedAt: now })
        .where(and(eq(dateWalks.id, next.id), eq(dateWalks.status, "waiting")))
      await settleWalkMessage(next, "failed", refusal.words, db)
      continue
    }
    const claimed = await db.execute(sql`
      UPDATE "date_walks"
      SET "status" = 'running', "started_at" = ${now}, "lease_until" = ${new Date(now.getTime() + LEASE_MS)}
      WHERE "date_walks"."id" = ${next.id}
        AND "date_walks"."status" = 'waiting'
        AND NOT EXISTS (
          SELECT 1 FROM "date_walks" AS "busy"
          WHERE "busy"."phone_id" = ${phoneId} AND "busy"."status" = 'running'
        )
      RETURNING "date_walks"."id"
    `)
    if (!(claimed.rows as unknown[]).length) return null
    const [row] = await db.select().from(dateWalks).where(eq(dateWalks.id, next.id)).limit(1)
    return row ?? null
  }
  return null
}

/** A send walk that never ran leaves its message as not sent, with the reason. */
async function settleWalkMessage(walk: WalkRow, status: "failed", error: string, db: CustomShellDb) {
  if (walk.kind !== "send-message" || typeof walk.input.messageId !== "string") return
  await db
    .update(dateMessages)
    .set({ status, error })
    .where(and(eq(dateMessages.id, walk.input.messageId), eq(dateMessages.status, "sending")))
}

export type RunOptions = {
  /** Stands in for the phone, in tests. */
  drive?: PhoneDriver
  now?: () => Date
}

/**
 * Runs one claimed walk to its end and writes how it ended. Never throws: a
 * walk that fails is written as failed, with the reason in words and a
 * picture of the screen it stopped on.
 */
export async function runWalk(walk: WalkRow, db: CustomShellDb = defaultDb, options: RunOptions = {}): Promise<void> {
  const clock = options.now ?? (() => new Date())
  const [phone] = await db.select().from(datePhones).where(eq(datePhones.id, walk.phoneId)).limit(1)
  if (!phone) return
  const walkPhone = { id: phone.id, userId: phone.userId, workspaceId: phone.workspaceId, name: phone.name, accountId: walk.accountId }
  const toPhone: PhoneDriver = options.drive ?? ((kind, payload, limit) => callPhone(walkPhone, walk.id, kind, payload, limit, db))
  const drive: PhoneDriver = async (kind, payload, limit) => {
    // The lease moves on before every step, so a slow phone is never taken for a dropped walk.
    await db.update(dateWalks).set({ leaseUntil: new Date(clock().getTime() + LEASE_MS) }).where(eq(dateWalks.id, walk.id))
    return toPhone(kind, payload, limit)
  }
  const ctx: WalkContext = { phone: walkPhone, walkId: walk.id, drive, db, now: clock }
  const kit = walkKit(ctx)

  try {
    const result = await WALKS[walk.kind](ctx, kit, walk.input, walk.askedBy)
    await db
      .update(dateWalks)
      .set({ status: "done", result, error: "", finishedAt: clock() })
      .where(eq(dateWalks.id, walk.id))
    await followUp(walk, result, db, clock())
  } catch (error) {
    let words: string
    let shot: Buffer | null = kit.lastSeen?.shot ?? null
    if (error instanceof StopScreenError) {
      await stopPhoneForScreen(walkPhone, error, db, clock())
      words = `${STOP_REASON_WORDS[error.reason]}. Everything on the phone has stopped until you press Resume in the dashboard's Phone panel.`
      shot = null
    } else if (error instanceof WalkError) {
      words = error.message
      shot = error.shot ?? shot
    } else if (error instanceof PhoneActionError) {
      words = error.message
    } else {
      console.error(`Tinder walk ${walk.kind} failed`, error)
      words = "Something went wrong on the server during this. It is in the server's log."
    }
    await db
      .update(dateWalks)
      .set({ status: "failed", error: words.slice(0, 2_000), finishedAt: clock() })
      .where(eq(dateWalks.id, walk.id))
    if (shot) await keepFailurePicture(walk, shot, db, clock())
  } finally {
    await forgetWalkScreenshots(walk.id, db)
  }
}

/** The screen a failed walk stopped on, kept on its last step so the dashboard's Phone panel can show where it went wrong. */
async function keepFailurePicture(walk: WalkRow, shot: Buffer, db: CustomShellDb, now: Date): Promise<void> {
  try {
    const [last] = await db
      .select({ id: datePhoneActions.id })
      .from(datePhoneActions)
      .where(eq(datePhoneActions.walkId, walk.id))
      .orderBy(desc(datePhoneActions.createdAt))
      .limit(1)
    if (!last) return
    await addStepPictures(last.id, [await keepPicture(walk.userId, shot, "step", db, now)], db)
  } catch (error) {
    console.error("The picture of a failed walk could not be kept", error)
  }
}

/** What a finished walk leads to: a chat list with changed conversations has each one read. */
async function followUp(walk: WalkRow, result: Record<string, unknown>, db: CustomShellDb, now: Date): Promise<void> {
  if (walk.kind !== "read-matches" || !Array.isArray(result.toRead)) return
  for (const matchId of result.toRead) {
    if (typeof matchId !== "string") continue
    try {
      await queueWalk({ userId: walk.userId, accountId: walk.accountId, phoneId: walk.phoneId, kind: "read-conversation", input: { matchId }, askedBy: walk.askedBy }, db, now)
    } catch (error) {
      console.error("A conversation could not be put on the list", error)
    }
  }
}

/**
 * A stop screen: the phone stops doing anything until Resume. The loop is
 * switched off, every walk and action waiting is cancelled, and the screen is
 * kept so the dashboard's Phone panel shows what Tinder said.
 */
export async function stopPhoneForScreen(
  phone: { id: string; userId: string },
  stop: StopScreenError,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  let pictureId: string | null = null
  if (stop.shot) {
    try {
      pictureId = await keepPicture(phone.userId, stop.shot, "stop", db, now)
    } catch (error) {
      console.error("The stop screen's picture could not be kept", error)
    }
  }
  const wait = stop.reason === "out_of_likes" ? outOfLikesWaitWords(stop.words) : ""
  await db
    .update(datePhones)
    .set({
      stoppedReason: stop.reason,
      stoppedAt: now,
      stoppedWords: wait || stop.words.slice(0, 600),
      stoppedPictureId: pictureId,
      running: false,
      stopWhy: STOP_REASON_WORDS[stop.reason],
      stopWhyAt: now,
      updatedAt: now,
    })
    .where(eq(datePhones.id, phone.id))
  await cancelWalks(phone.id, `${STOP_REASON_WORDS[stop.reason]}, so this was not done.`, db, now)
  await cancelPhoneActions(phone.id, `${STOP_REASON_WORDS[stop.reason]}.`, db, now)
}

function outOfLikesWaitWords(words: string): string {
  const seconds = outOfLikesWait(words)
  if (seconds === null) return ""
  const total = Math.max(1, Math.round(seconds / 60))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  const parts = [hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "", minutes ? `${minutes} minute${minutes === 1 ? "" : "s"}` : ""]
  return `Tinder gives likes again in about ${parts.filter(Boolean).join(" ")}.`
}

/** Cancels every walk still waiting on a phone, with the reason. A send that never ran is marked not sent. */
export async function cancelWalks(phoneId: string, reason: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const cancelled = await db
    .update(dateWalks)
    .set({ status: "cancelled", error: reason, finishedAt: now })
    .where(and(eq(dateWalks.phoneId, phoneId), eq(dateWalks.status, "waiting")))
    .returning()
  for (const walk of cancelled) await settleWalkMessage(walk, "failed", reason, db)
}

/**
 * Resume in the dashboard's Phone panel: the stop is cleared and Tinder is looked at
 * again at once. If the same screen is still there, the phone stops again,
 * with how long Tinder says is left. Tinder's distance and ages are set again
 * from Date's on the next pass after that.
 */
export async function resumePhone(
  account: { id: string; userId: string; phoneId: string | null },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string> {
  if (!account.phoneId) throw new Error("No phone is paired for this profile yet. Pair one in the dashboard's Phone panel first.")
  const [phone] = await db
    .update(datePhones)
    .set({ stoppedReason: null, stoppedAt: null, stoppedWords: "", stoppedPictureId: null, discoveryOwed: true, updatedAt: now })
    .where(and(eq(datePhones.id, account.phoneId), eq(datePhones.userId, account.userId)))
    .returning({ id: datePhones.id })
  if (!phone) throw new Error("That phone does not exist.")
  return queueWalk({ userId: account.userId, accountId: account.id, phoneId: phone.id, kind: "who-is-signed-in", askedBy: "member" }, db, now)
}

/**
 * Walks whose lease ran out belonged to a process that stopped. They are
 * marked as stopped part-way; a message that was mid-send stays unsure for
 * the next read of its chat to settle, or not sent if Send was never tapped.
 */
export async function expireWalkLeases(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const dropped = await db
    .update(dateWalks)
    .set({ status: "failed", error: "Stopped part-way: the server restarted while this was running.", finishedAt: now })
    .where(and(eq(dateWalks.status, "running"), isNotNull(dateWalks.leaseUntil), lt(dateWalks.leaseUntil, now)))
    .returning()
  for (const walk of dropped) {
    await settleWalkMessage(walk, "failed", "The server restarted before it was typed, so it was not sent.", db)
    await forgetWalkScreenshots(walk.id, db)
  }
}

/** Walks running in this process, so one pass never starts a walk another pass of the same process started. */
const running = new Set<string>()

/**
 * One pass of the job list: drop walks whose process went, then start the
 * next walk on every phone with one waiting and none running. Returns the
 * walks it started, still going, so a test can wait for them; the background
 * pass does not wait.
 */
export async function runWalkList(db: CustomShellDb = defaultDb, now: Date = new Date(), options: RunOptions = {}): Promise<Promise<void>[]> {
  await expireWalkLeases(db, now)
  const phones = await db
    .selectDistinct({ phoneId: dateWalks.phoneId })
    .from(dateWalks)
    .where(eq(dateWalks.status, "waiting"))
  const started: Promise<void>[] = []
  for (const { phoneId } of phones) {
    const walk = await claimNextWalk(phoneId, db, now)
    if (!walk || running.has(walk.id)) continue
    running.add(walk.id)
    started.push(
      runWalk(walk, db, options)
        .catch((error) => console.error("A Tinder walk could not be run", error))
        .finally(() => running.delete(walk.id))
    )
  }
  return started
}

/** Whether a phone has a walk running or waiting. */
export async function phoneIsBusy(phoneId: string, db: CustomShellDb = defaultDb): Promise<boolean> {
  const [busy] = await db
    .select({ id: dateWalks.id })
    .from(dateWalks)
    .where(and(eq(dateWalks.phoneId, phoneId), inArray(dateWalks.status, ["waiting", "running"])))
    .limit(1)
  return Boolean(busy)
}

