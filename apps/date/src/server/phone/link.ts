import { randomBytes, randomInt } from "node:crypto"
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm"

import {
  ACTION_ANSWER_GRACE_MS,
  PAIR_CODE_MINUTES,
  PHONE_AWAY_MS,
  PHONE_CHECK_IN_SECONDS,
  PHONE_CLOCK_WINDOW_SECONDS,
  type PhoneActionKind,
  type PhoneActionStatus,
  type StopReason,
} from "@/lib/dating/options"
import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { deletePictures, keepPicture } from "./pictures"
import { datePhoneActions, datePhoneNonces, datePhonePairCodes, datePhones } from "./schema"
import { isWatched } from "./screens"
import { replySignature, requestSignature, sameSignature, sha256Hex } from "./signing"

/**
 * The phone's side of Date: pairing, checking every signed message, the
 * check-ins that say the phone is there, and handing out the plain actions
 * the server has written for it. The addresses the phone calls are in
 * `src/routes/api/phone/` and do nothing but hand the request to here.
 *
 * Copied from Promo's rack link (`apps/promo/src/server/phones/rack.ts`) and
 * trimmed: one phone talks for itself rather than a computer for a rack of
 * phones, so there is no adb, no USB, no serial number and no proxy. The phone
 * always dials out; the server never calls the phone.
 */

/** A refusal the phone is told about: 401 for anything about who it is, 400 for a bad message. */
export class PhoneRefusal extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "PhoneRefusal"
    this.status = status
  }
}

/**
 * A new six-digit code, shown once in the dashboard's Phone panel. Only its hash is
 * kept. A million codes, each good once for ten minutes, and the pairing
 * address allows ten tries in fifteen minutes from one address.
 *
 * Naming a phone pairs that phone again, keeping its history. Naming none
 * makes a new phone when the code is used.
 */
export async function createPairingCode(
  userId: string,
  workspaceId: string,
  phoneId: string | null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ code: string; expiresAt: Date }> {
  if (phoneId) {
    const [phone] = await db
      .select({ id: datePhones.id })
      .from(datePhones)
      .where(and(eq(datePhones.id, phoneId), eq(datePhones.userId, userId)))
      .limit(1)
    if (!phone) throw new Error("That phone does not exist.")
  }
  // Codes a day past their end are no use to anyone, so they go as new ones come.
  await db.delete(datePhonePairCodes).where(lt(datePhonePairCodes.expiresAt, new Date(now.getTime() - 86_400_000)))
  const expiresAt = new Date(now.getTime() + PAIR_CODE_MINUTES * 60_000)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
    const codeHash = sha256Hex(code)
    // Two live codes may never share digits, or one person's code would pair
    // the other's phone.
    const [live] = await db
      .select({ id: datePhonePairCodes.id })
      .from(datePhonePairCodes)
      .where(
        and(
          eq(datePhonePairCodes.codeHash, codeHash),
          isNull(datePhonePairCodes.usedAt),
          sql`${datePhonePairCodes.expiresAt} > ${now}`
        )
      )
      .limit(1)
    if (live) continue
    await db.insert(datePhonePairCodes).values({ id: uuid(), userId, workspaceId, phoneId, codeHash, expiresAt, createdAt: now })
    return { code, expiresAt }
  }
  throw new Error("Could not make a code. Try again.")
}

export type PairInput = { code: string; model: string; android: string; appVersion: string }

/**
 * Swaps a code for the phone's key. The code is spent in the same statement
 * that checks it, so two phones racing with one code cannot both win. The key
 * goes back once, in this answer, and is kept encrypted.
 */
export async function pairPhone(
  input: PairInput,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ phoneId: string; key: string }> {
  // Encrypted before the code is spent, so a server with no encryption key
  // refuses and leaves the code usable once the key is set.
  const key = randomBytes(32).toString("base64url")
  const keyEncrypted = encryptSecret(key)
  const [spent] = await db
    .update(datePhonePairCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(datePhonePairCodes.codeHash, sha256Hex(input.code.replace(/\D/g, ""))),
        isNull(datePhonePairCodes.usedAt),
        sql`${datePhonePairCodes.expiresAt} > ${now}`
      )
    )
    .returning({
      userId: datePhonePairCodes.userId,
      workspaceId: datePhonePairCodes.workspaceId,
      phoneId: datePhonePairCodes.phoneId,
    })
  if (!spent) {
    throw new PhoneRefusal(
      401,
      `That code is not right, already used or more than ${PAIR_CODE_MINUTES} minutes old. Make a new one in the dashboard's Phone panel.`
    )
  }

  const reported = {
    model: input.model.trim().slice(0, 120),
    androidVersion: input.android.trim().slice(0, 40),
    appVersion: input.appVersion.trim().slice(0, 40),
  }
  if (spent.phoneId) {
    await db
      .update(datePhones)
      .set({ ...reported, keyEncrypted, pairedAt: now, updatedAt: now })
      .where(eq(datePhones.id, spent.phoneId))
    // A new key starts a new set of random words.
    await db.delete(datePhoneNonces).where(eq(datePhoneNonces.phoneId, spent.phoneId))
    return { phoneId: spent.phoneId, key }
  }

  const phoneId = uuid()
  await db.insert(datePhones).values({
    id: phoneId,
    userId: spent.userId,
    workspaceId: spent.workspaceId,
    name: reported.model || "Android phone",
    ...reported,
    keyEncrypted,
    pairedAt: now,
    createdAt: now,
    updatedAt: now,
  })
  return { phoneId, key }
}

export type VerifiedPhone = { id: string; userId: string; workspaceId: string; key: string }

/**
 * Checks a signed message from a phone and returns the phone, or refuses it:
 * no phone, an unpaired phone, a clock more than five minutes out, a random
 * word seen before, or a signature that does not match the body.
 */
export async function verifyPhoneRequest(
  request: { method: string; path: string; headers: Headers; body: string },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<VerifiedPhone> {
  const phoneId = request.headers.get("x-phone-id") ?? ""
  const stamp = Number(request.headers.get("x-phone-time") ?? "")
  const nonce = request.headers.get("x-phone-nonce") ?? ""
  const signature = request.headers.get("x-phone-signature") ?? ""
  if (!phoneId || !nonce || !signature || !Number.isInteger(stamp) || !/^[a-f0-9]{16,64}$/.test(nonce)) {
    throw new PhoneRefusal(401, "This message is not signed.")
  }

  const [phone] = await db
    .select({
      id: datePhones.id,
      userId: datePhones.userId,
      workspaceId: datePhones.workspaceId,
      keyEncrypted: datePhones.keyEncrypted,
    })
    .from(datePhones)
    .where(eq(datePhones.id, phoneId))
    .limit(1)
  if (!phone) throw new PhoneRefusal(401, "This phone is not paired with Date.")
  if (!phone.keyEncrypted) {
    throw new PhoneRefusal(401, "This phone was unpaired in the dashboard's Phone panel. Pair it again with a new code.")
  }
  if (Math.abs(now.getTime() / 1000 - stamp) > PHONE_CLOCK_WINDOW_SECONDS) {
    throw new PhoneRefusal(401, "This phone's clock is more than five minutes from the server's. Check the phone's time.")
  }

  const key = decryptSecret(phone.keyEncrypted)
  const expected = requestSignature(key, request.method, request.path, stamp, nonce, request.body)
  if (!sameSignature(signature, expected)) throw new PhoneRefusal(401, "This message's signature does not match.")

  // The word is written only after the signature checks out, so a stranger
  // cannot fill the table. Old words go once they are outside the clock window.
  await db
    .delete(datePhoneNonces)
    .where(lt(datePhoneNonces.seenAt, new Date(now.getTime() - 2 * PHONE_CLOCK_WINDOW_SECONDS * 1000)))
  const [fresh] = await db
    .insert(datePhoneNonces)
    .values({ phoneId, nonce, seenAt: now })
    .onConflictDoNothing()
    .returning({ nonce: datePhoneNonces.nonce })
  if (!fresh) throw new PhoneRefusal(401, "This message was already received once.")

  return { id: phone.id, userId: phone.userId, workspaceId: phone.workspaceId, key }
}

/** The headers that sign a reply to the phone. */
export function signReply(phone: VerifiedPhone, status: number, nonce: string, body: string, now: Date = new Date()) {
  const stamp = Math.floor(now.getTime() / 1000)
  return {
    "x-date-time": String(stamp),
    "x-date-signature": replySignature(phone.key, status, nonce, stamp, body),
  }
}

export type CheckInInput = {
  appVersion: string
  model: string
  android: string
  timezone: string
  batteryPercent: number | null
  /** Tinder's version, or empty when it is not installed. */
  tinderVersion: string
  tinderInFront: boolean
  /** The "Date is in control" switch on the phone. */
  phoneSwitchOn: boolean
}

/**
 * Every fifteen seconds: what the phone is and how it is. The answer says how
 * often to come back and whether a window on the dashboard is watching its
 * screen, so it starts sending pictures.
 */
export async function checkIn(
  phone: VerifiedPhone,
  input: CheckInInput,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ checkInSeconds: number; watched: boolean }> {
  await db
    .update(datePhones)
    .set({
      lastSeenAt: now,
      appVersion: input.appVersion.slice(0, 40),
      ...(input.model.trim() ? { model: input.model.trim().slice(0, 120) } : {}),
      ...(input.android.trim() ? { androidVersion: input.android.trim().slice(0, 40) } : {}),
      ...(input.timezone.trim() ? { timeZone: input.timezone.trim().slice(0, 64) } : {}),
      batteryPercent: input.batteryPercent,
      tinderVersion: input.tinderVersion.slice(0, 60),
      tinderInFront: input.tinderInFront,
      phoneSwitchOn: input.phoneSwitchOn,
      updatedAt: now,
    })
    .where(eq(datePhones.id, phone.id))
  return { checkInSeconds: PHONE_CHECK_IN_SECONDS, watched: isWatched(phone.id, now.getTime()) }
}

export type HandedAction = { id: string; kind: PhoneActionKind; payload: Record<string, unknown>; timeLimitSeconds: number }

/** How often the long wait for an action looks again. */
const NEXT_POLL_MS = 400

/** The longest the phone's ask for an action is held open, in seconds. */
export const NEXT_MAX_WAIT_SECONDS = 20

/**
 * Hands the phone its oldest waiting action and marks it running, in one
 * statement, so an action is never handed out twice. A phone runs one action
 * at a time, in order. An action left running past its own time limit and a
 * minute more is failed first: the phone lost it.
 *
 * With nothing waiting, the ask is held open for up to `waitSeconds`, so a
 * walk's next step reaches the phone within half a second rather than at its
 * next ask. It also comes back early when a window starts or stops watching
 * the screen, which the phone was not told about yet.
 *
 * Nothing is handed out while Date is switched off in the dashboard's Phone panel.
 */
export async function nextAction(
  phone: VerifiedPhone,
  input: { waitSeconds: number; watching: boolean },
  db: CustomShellDb = defaultDb,
  clock: { now: () => Date; sleep: (ms: number) => Promise<void> } = realClock
): Promise<{ action: HandedAction | null; watched: boolean }> {
  const deadline = clock.now().getTime() + Math.min(Math.max(input.waitSeconds, 0), NEXT_MAX_WAIT_SECONDS) * 1000
  for (;;) {
    const now = clock.now()
    const watched = isWatched(phone.id, now.getTime())
    const action = await claimAction(phone.id, db, now)
    if (action) return { action, watched }
    if (watched !== input.watching || now.getTime() >= deadline) return { action: null, watched }
    await clock.sleep(NEXT_POLL_MS)
  }
}

const realClock = {
  now: () => new Date(),
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
}

async function claimAction(phoneId: string, db: CustomShellDb, now: Date): Promise<HandedAction | null> {
  await db
    .update(datePhoneActions)
    .set({ status: "failed", error: "The phone did not answer in time.", screenshot: null, finishedAt: now })
    .where(
      and(
        eq(datePhoneActions.phoneId, phoneId),
        eq(datePhoneActions.status, "running"),
        sql`${datePhoneActions.startedAt} + make_interval(secs => ${datePhoneActions.timeLimitSeconds} + ${ACTION_ANSWER_GRACE_MS / 1000}) < ${now}`
      )
    )

  // Every column in the raw statement is qualified, because an unqualified one
  // resolves against the wrong table without complaint.
  const claimed = await db.execute(sql`
    UPDATE "date_phone_actions"
    SET "status" = 'running', "started_at" = ${now}
    WHERE "date_phone_actions"."id" = (
      SELECT "waiting"."id" FROM "date_phone_actions" AS "waiting"
      JOIN "date_phones" AS "phone" ON "phone"."id" = "waiting"."phone_id"
      WHERE "waiting"."phone_id" = ${phoneId}
        AND "waiting"."status" = 'waiting'
        AND "phone"."in_control" = true
        AND "phone"."key_encrypted" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "date_phone_actions" AS "busy"
          WHERE "busy"."phone_id" = "waiting"."phone_id" AND "busy"."status" = 'running'
        )
      ORDER BY "waiting"."created_at" ASC
      LIMIT 1
      FOR UPDATE OF "waiting" SKIP LOCKED
    )
    RETURNING "date_phone_actions"."id", "date_phone_actions"."kind",
              "date_phone_actions"."payload", "date_phone_actions"."time_limit_seconds"
  `)
  const row = (
    claimed.rows as Array<{ id: string; kind: PhoneActionKind; payload: Record<string, unknown> | null; time_limit_seconds: number }>
  )[0]
  if (!row) return null
  return { id: row.id, kind: row.kind, payload: row.payload ?? {}, timeLimitSeconds: row.time_limit_seconds }
}

export type ActionResultInput = {
  id: string
  ok: boolean
  answer: Record<string, unknown> | null
  error: string
  /** The screen as a JPEG, after the action, when the action reads the screen or takes a picture. */
  screenshot: string | null
}

/**
 * The phone's answer to one action. Only the phone the action was handed to
 * can answer it, and only while it is running, so a late answer to a
 * cancelled action changes nothing.
 *
 * A step of a walk keeps its screenshot on the row until the walk has used
 * it: the walk may run in another process, the worker, and needs the
 * picture to cut a card's photos from. An action asked for on its own, the
 * Phone panel's picture button, keeps its picture at once.
 */
export async function finishAction(
  phone: VerifiedPhone,
  input: ActionResultInput,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<boolean> {
  const mine = and(
    eq(datePhoneActions.id, input.id),
    eq(datePhoneActions.phoneId, phone.id),
    eq(datePhoneActions.status, "running")
  )
  const [running] = await db
    .select({ id: datePhoneActions.id, walkId: datePhoneActions.walkId })
    .from(datePhoneActions)
    .where(mine)
    .limit(1)
  if (!running) return false

  const kept: string[] = []
  if (input.screenshot && !running.walkId) {
    kept.push(await keepPicture(phone.userId, Buffer.from(input.screenshot, "base64"), "step", db, now))
  }

  const [done] = await db
    .update(datePhoneActions)
    .set({
      status: input.ok ? "done" : "failed",
      answer: input.ok ? input.answer : null,
      error: input.ok ? "" : input.error.slice(0, 2_000) || "The phone gave no reason.",
      screenshot: running.walkId ? input.screenshot : null,
      pictureIds: kept,
      finishedAt: now,
    })
    .where(mine)
    .returning({ id: datePhoneActions.id })
  if (!done) {
    // Cancelled while the picture was uploading: the answer is turned away.
    await deletePictures(kept, db)
    return false
  }
  return true
}

/** True when the phone checked in within the last 45 seconds. */
export function phoneIsHere(lastSeenAt: Date | null, now: Date = new Date()): boolean {
  return Boolean(lastSeenAt && now.getTime() - lastSeenAt.getTime() < PHONE_AWAY_MS)
}

export type PhoneView = {
  id: string
  name: string
  model: string
  androidVersion: string
  appVersion: string
  paired: boolean
  pairedAt: Date | null
  lastSeenAt: Date | null
  /** True when it checked in within the last 45 seconds. */
  here: boolean
  batteryPercent: number | null
  timeZone: string
  tinderVersion: string
  tinderInFront: boolean
  inControl: boolean
  phoneSwitchOn: boolean
  running: boolean
  runningSince: Date | null
  /** Who started the loop running now: the member's Start, or the swiping schedule. */
  startedBy: "member" | "schedule" | null
  stopWhy: string
  stopWhyAt: Date | null
  stoppedReason: StopReason | null
  stoppedAt: Date | null
  stoppedWords: string
  stoppedPictureId: string | null
}

/** This member's phones on this site, newest first. */
export async function listPhones(
  userId: string,
  workspaceId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<PhoneView[]> {
  const rows = await db
    .select()
    .from(datePhones)
    .where(and(eq(datePhones.userId, userId), eq(datePhones.workspaceId, workspaceId)))
    .orderBy(desc(datePhones.createdAt))
  return rows.map((row) => phoneView(row, now))
}

export function phoneView(row: typeof datePhones.$inferSelect, now: Date = new Date()): PhoneView {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    androidVersion: row.androidVersion,
    appVersion: row.appVersion,
    paired: row.keyEncrypted !== null,
    pairedAt: row.pairedAt,
    lastSeenAt: row.lastSeenAt,
    here: row.keyEncrypted !== null && phoneIsHere(row.lastSeenAt, now),
    batteryPercent: row.batteryPercent,
    timeZone: row.timeZone,
    tinderVersion: row.tinderVersion,
    tinderInFront: row.tinderInFront,
    inControl: row.inControl,
    phoneSwitchOn: row.phoneSwitchOn,
    running: row.running,
    runningSince: row.runningSince,
    startedBy: row.startedBy ?? null,
    stopWhy: row.stopWhy,
    stopWhyAt: row.stopWhyAt,
    stoppedReason: row.stoppedReason,
    stoppedAt: row.stoppedAt,
    stoppedWords: row.stoppedWords,
    stoppedPictureId: row.stoppedPictureId,
  }
}

/** One of this member's phones, or a refusal. */
export async function ownPhone(
  userId: string,
  phoneId: string,
  db: CustomShellDb = defaultDb
): Promise<typeof datePhones.$inferSelect> {
  const [phone] = await db
    .select()
    .from(datePhones)
    .where(and(eq(datePhones.id, phoneId), eq(datePhones.userId, userId)))
    .limit(1)
  if (!phone) throw new Error("That phone does not exist.")
  return phone
}

/** Cancels every action still waiting or running for a phone, with the reason in words. */
export async function cancelPhoneActions(
  phoneId: string,
  reason: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  await db
    .update(datePhoneActions)
    .set({ status: "cancelled", error: reason, screenshot: null, finishedAt: now })
    .where(and(eq(datePhoneActions.phoneId, phoneId), inArray(datePhoneActions.status, ["waiting", "running"])))
}

/**
 * Cancels the phone's key at once. Every message it sends from now on is
 * refused and every action waiting for it is cancelled. The phone's record,
 * its history and what it read stay; Pair again gives it a new key.
 */
export async function unpairPhone(
  userId: string,
  phoneId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [phone] = await db
    .update(datePhones)
    .set({ keyEncrypted: null, running: false, stopWhy: "The phone was unpaired.", stopWhyAt: now, updatedAt: now })
    .where(and(eq(datePhones.id, phoneId), eq(datePhones.userId, userId)))
    .returning({ id: datePhones.id })
  if (!phone) throw new Error("That phone does not exist.")
  await cancelPhoneActions(phoneId, "The phone was unpaired.", db, now)
}

/**
 * The "Date is in control" switch in the dashboard's Phone panel. Off, the phone is
 * handed nothing, everything waiting for it is cancelled and the AI's loop
 * stops. On again, nothing restarts by itself.
 */
export async function setInControl(
  userId: string,
  phoneId: string,
  on: boolean,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [phone] = await db
    .update(datePhones)
    .set(
      on
        ? { inControl: true, updatedAt: now }
        : { inControl: false, running: false, stopWhy: "Date was switched off in the dashboard's Phone panel.", stopWhyAt: now, updatedAt: now }
    )
    .where(and(eq(datePhones.id, phoneId), eq(datePhones.userId, userId)))
    .returning({ id: datePhones.id })
  if (!phone) throw new Error("That phone does not exist.")
  if (!on) await cancelPhoneActions(phoneId, "Date was switched off in the dashboard's Phone panel.", db, now)
}

export type PhoneActionView = {
  id: string
  kind: PhoneActionKind
  status: PhoneActionStatus
  error: string
  /** Part of a walk, or asked for on its own. */
  walkId: string | null
  createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
  pictureIds: string[]
}

/** The phone's last fifty actions, newest first. */
export async function phoneActions(
  userId: string,
  phoneId: string,
  db: CustomShellDb = defaultDb
): Promise<PhoneActionView[]> {
  const rows = await db
    .select({
      id: datePhoneActions.id,
      kind: datePhoneActions.kind,
      status: datePhoneActions.status,
      error: datePhoneActions.error,
      walkId: datePhoneActions.walkId,
      createdAt: datePhoneActions.createdAt,
      startedAt: datePhoneActions.startedAt,
      finishedAt: datePhoneActions.finishedAt,
      pictureIds: datePhoneActions.pictureIds,
    })
    .from(datePhoneActions)
    .where(and(eq(datePhoneActions.phoneId, phoneId), eq(datePhoneActions.userId, userId)))
    .orderBy(desc(datePhoneActions.createdAt), asc(datePhoneActions.id))
    .limit(50)
  return rows
}
