import { randomBytes, randomInt } from "node:crypto"
import { and, asc, desc, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm"

import {
  OLDEST_IOS,
  PHONE_STALE_MS,
  RACK_CHECK_IN_SECONDS,
  RACK_CLOCK_WINDOW_SECONDS,
  RACK_CODE_MINUTES,
  actionWords,
  type PhoneKind,
} from "@/lib/phones/options"
import { resultWords } from "@/lib/phones/wording"
import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { finishMoveFromPhone } from "@/server/social/move-to-phone"
import { noteAppAlerts, type AppAlert } from "@/server/social/phone-apps/inbox"

import { recordVitals, stopForBanScreen, type BanScreen, type ReportedVitals } from "./health"
import { recordPhoneEvent } from "./history"
import { clearProblem } from "./notices"
import { RACK_VERSION } from "./release"
import { promoPhoneActions, promoPhones, promoPhoneScreenshots, promoRackCodes, promoRackNonces, promoRacks } from "./schema"
import { recordAppUpdate, recordSelfTest, recordStoreCheck } from "./self-test"
import { recordSetupCheck } from "./setup"
import { replySignature, requestSignature, sameSignature, sha256Hex } from "./signing"
import { dropStepPictures, keepStepPictures, type StepShot } from "./trail"
import { recordWipe } from "./wipe"

/**
 * The rack program's side of Promo: pairing, checking every signed message,
 * the check-ins that say which phones are plugged in, and the queue of named
 * actions. The HTTP addresses the program calls are in `src/routes/api/rack/`
 * and do nothing but hand the request to here.
 *
 * The rack dials out to Promo. Promo never calls the house, so nothing at
 * home is ever opened to the internet.
 */

/** A refusal the rack is told about: 401 for anything about who it is, 400 for a bad message. */
export class RackRefusal extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "RackRefusal"
    this.status = status
  }
}

/** Letters a person can read off a screen and type without mixing up 0 and O. */
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

/**
 * A new one-time code for pairing a rack, shown once on the Phones dashboard.
 * Only its hash is kept. Eight letters from 32 is about a trillion codes, and
 * the pairing address allows ten tries in fifteen minutes from one address.
 */
export async function createPairingCode(
  userId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ code: string; expiresAt: Date }> {
  let raw = ""
  for (let index = 0; index < 8; index += 1) raw += CODE_LETTERS[randomInt(CODE_LETTERS.length)]
  const expiresAt = new Date(now.getTime() + RACK_CODE_MINUTES * 60_000)
  // Codes a day past their end are no use to anyone, so they go as new ones come.
  await db.delete(promoRackCodes).where(lt(promoRackCodes.expiresAt, new Date(now.getTime() - 86_400_000)))
  await db.insert(promoRackCodes).values({ id: uuid(), userId, codeHash: sha256Hex(raw), expiresAt, createdAt: now })
  return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt }
}

/**
 * Swaps a code for a rack and its key. The code is spent in the same
 * statement that checks it, so two programs racing with one code cannot both
 * win. The key goes back once, in this answer, and is kept encrypted.
 */
export async function pairRack(
  input: { code: string; name: string; platform: string; version: string },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ rackId: string; key: string }> {
  // Encrypted before the code is spent, so a server with no encryption key
  // refuses the pairing and leaves the code usable once the key is set.
  const key = randomBytes(32).toString("base64url")
  const keyEncrypted = encryptSecret(key)
  const [spent] = await db
    .update(promoRackCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(promoRackCodes.codeHash, sha256Hex(normaliseCode(input.code))),
        isNull(promoRackCodes.usedAt),
        sql`${promoRackCodes.expiresAt} > ${now}`
      )
    )
    .returning({ userId: promoRackCodes.userId })
  if (!spent) {
    throw new RackRefusal(401, "That code is not valid, already used or more than 15 minutes old. Make a new one on the Phones dashboard.")
  }

  const rackId = uuid()
  await db.insert(promoRacks).values({
    id: rackId,
    userId: spent.userId,
    name: input.name.trim().slice(0, 120) || "Rack",
    keyEncrypted,
    platform: input.platform.trim().slice(0, 40),
    version: input.version.trim().slice(0, 40),
    pairedAt: now,
  })
  return { rackId, key }
}

export type VerifiedRack = { id: string; userId: string; key: string }

/**
 * Checks a signed message from a rack and returns the rack, or refuses it:
 * no rack, a disconnected rack, a clock more than five minutes out, a random
 * word seen before, or a signature that does not match the body.
 */
export async function verifyRackRequest(
  request: { method: string; path: string; headers: Headers; body: string },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<VerifiedRack> {
  const rackId = request.headers.get("x-rack-id") ?? ""
  const stamp = Number(request.headers.get("x-rack-time") ?? "")
  const nonce = request.headers.get("x-rack-nonce") ?? ""
  const signature = request.headers.get("x-rack-signature") ?? ""
  if (!rackId || !nonce || !signature || !Number.isInteger(stamp) || !/^[a-f0-9]{16,64}$/.test(nonce)) {
    throw new RackRefusal(401, "This message is not signed.")
  }

  const [rack] = await db
    .select({ id: promoRacks.id, userId: promoRacks.userId, keyEncrypted: promoRacks.keyEncrypted, disconnectedAt: promoRacks.disconnectedAt })
    .from(promoRacks)
    .where(eq(promoRacks.id, rackId))
    .limit(1)
  if (!rack) throw new RackRefusal(401, "This rack is not paired with Promo.")
  if (rack.disconnectedAt) {
    throw new RackRefusal(401, "This rack was disconnected on the Phones dashboard. Install it again with a new code.")
  }
  if (Math.abs(now.getTime() / 1000 - stamp) > RACK_CLOCK_WINDOW_SECONDS) {
    throw new RackRefusal(401, "This message's clock is more than five minutes from Promo's. Check the computer's time.")
  }

  const key = decryptSecret(rack.keyEncrypted)
  const expected = requestSignature(key, request.method, request.path, stamp, nonce, request.body)
  if (!sameSignature(signature, expected)) throw new RackRefusal(401, "This message's signature does not match.")

  // The word is written only after the signature checks out, so a stranger
  // cannot fill the table. Old words go once they are outside the clock window.
  await db.delete(promoRackNonces).where(lt(promoRackNonces.seenAt, new Date(now.getTime() - 2 * RACK_CLOCK_WINDOW_SECONDS * 1000)))
  const [fresh] = await db
    .insert(promoRackNonces)
    .values({ rackId, nonce, seenAt: now })
    .onConflictDoNothing()
    .returning({ nonce: promoRackNonces.nonce })
  if (!fresh) throw new RackRefusal(401, "This message was already received once.")

  return { id: rack.id, userId: rack.userId, key }
}

/** The headers that sign a reply to the rack. */
export function signReply(rack: VerifiedRack, status: number, nonce: string, body: string, now: Date = new Date()) {
  const stamp = Math.floor(now.getTime() / 1000)
  return {
    "x-promo-time": String(stamp),
    "x-promo-signature": replySignature(rack.key, status, nonce, stamp, body),
  }
}

export type ReportedPhone = {
  serial: string
  state: string
  usb: string
  model: string
  /** The system version: Android's, or iOS's on an iPhone. */
  android: string
  /** Android or iPhone. The check-in's shape fills in Android for a rack older than 2026.10.18. */
  kind: PhoneKind
  /** The phone's own time zone, such as "America/Toronto", or empty when unread. */
  timezone?: string
  /** Battery, heat, storage, signal and app versions, about once a minute. */
  vitals?: ReportedVitals | null
  /** App notifications that arrived since the last check-in, without their words. */
  alerts?: AppAlert[]
}

export type CheckInInput = {
  version: string
  platform: string
  phones: ReportedPhone[]
  rolledBack: { from: string; to: string; at: string; why: string } | null
  /** When the rack's WebDriverAgent signature runs out, as an ISO date, or null on a rack without iPhone tools. */
  wdaExpiresAt?: string | null
}

/**
 * A rack's check-in: which phones adb sees, and the program's version.
 *
 * A serial Promo has never seen becomes a phone record named after its model,
 * so plugging a phone in is all it takes to see it on the dashboard. A known
 * phone gets its USB port, adb's word for it and the time, and the minute's
 * reading of its battery, heat, storage and signal when one came. A phone
 * that was plugged into this rack and is missing now is marked gone at once.
 * Plugging in and pulling out are written in the phone's history; the bell
 * is rung by the health sweep (`health.ts`), which waits five minutes before
 * calling a phone offline.
 */
export async function checkIn(
  rack: VerifiedRack,
  input: CheckInInput,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ latestVersion: string; checkInSeconds: number }> {
  await db
    .update(promoRacks)
    .set({
      seenAt: now,
      version: input.version.slice(0, 40),
      platform: input.platform.slice(0, 40),
      updateNote: input.rolledBack ? rollbackWords(input.rolledBack) : "",
      wdaExpiresAt: input.wdaExpiresAt ? new Date(input.wdaExpiresAt) : null,
    })
    .where(eq(promoRacks.id, rack.id))

  const reported = new Map<string, ReportedPhone>()
  for (const phone of input.phones) {
    const serial = phone.serial.trim().slice(0, 120)
    if (serial) reported.set(serial, { ...phone, serial })
  }
  const serials = Array.from(reported.keys())
  const known = serials.length
    ? await db
        .select()
        .from(promoPhones)
        .where(and(eq(promoPhones.userId, rack.userId), inArray(promoPhones.serial, serials)))
    : []
  const bySerial = new Map(known.map((phone) => [phone.serial, phone]))

  for (const [serial, seen] of reported) {
    const state = seen.state.slice(0, 20)
    const phone = bySerial.get(serial)
    if (!phone) {
      const [added] = await db
        .insert(promoPhones)
        .values({
          id: uuid(),
          userId: rack.userId,
          name: seen.model.trim().slice(0, 120) || serialName(serial),
          kind: seen.kind,
          model: seen.model.trim().slice(0, 120),
          androidVersion: seen.android.trim().slice(0, 40),
          timeZone: (seen.timezone ?? "").trim().slice(0, 64),
          serial,
          usbPort: seen.usb.slice(0, 120),
          rackId: rack.id,
          adbState: state,
          stateSince: now,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning()
      if (added) {
        await recordPhoneEvent(rack.userId, added.id, "plugged_in", pluggedWords(added.usbPort, state, added.kind), db, now)
        if (seen.vitals) await recordVitals(rack.userId, added, seen.vitals, db, now)
      }
      continue
    }
    await db
      .update(promoPhones)
      .set({
        rackId: rack.id,
        // The rack knows which kind it is holding; a record typed by hand before it was plugged in may have guessed.
        ...(seen.kind !== phone.kind ? { kind: seen.kind } : {}),
        // A phone the rack is restarting is listed with no port; it keeps its own.
        usbPort: seen.usb ? seen.usb.slice(0, 120) : phone.usbPort,
        adbState: state,
        ...(state !== phone.adbState ? { stateSince: now } : {}),
        lastSeenAt: now,
        // The model a person typed is kept; adb's fills a blank one. The
        // Android version is a fact the phone reports, so it always wins.
        ...(phone.model ? {} : { model: seen.model.trim().slice(0, 120) }),
        // A phone first seen before USB debugging was allowed got a name from
        // its serial. It takes its model's name once that can be read.
        ...(phone.name === serialName(serial) && seen.model.trim() ? { name: seen.model.trim().slice(0, 120) } : {}),
        ...(seen.android.trim() ? { androidVersion: seen.android.trim().slice(0, 40) } : {}),
        ...(seen.timezone?.trim() ? { timeZone: seen.timezone.trim().slice(0, 64) } : {}),
      })
      .where(eq(promoPhones.id, phone.id))
    // Back from gone, or seen for the first time, is a plug-in. A phone the
    // rack restarted comes back from "restarting", which is not.
    if (!phone.adbState || phone.adbState === "gone") {
      await recordPhoneEvent(rack.userId, phone.id, "plugged_in", pluggedWords(seen.usb, state, seen.kind), db, now)
    }
    if (seen.vitals && state === "device") await recordVitals(rack.userId, phone, seen.vitals, db, now)
    // A message or a comment arrived: the account on that app reads it,
    // through the notification, once it is awake (phone farm file 06).
    if (seen.alerts?.length && state === "device") await noteAppAlerts(rack.userId, phone.id, seen.alerts, db)
  }

  // Phones this rack had a moment ago that it no longer lists. Read before
  // the write, because the notice depends on what they were.
  const missing = await db
    .select()
    .from(promoPhones)
    .where(
      and(
        eq(promoPhones.rackId, rack.id),
        sql`${promoPhones.adbState} <> 'gone'`,
        ...(serials.length ? [notInArray(promoPhones.serial, serials)] : [])
      )
    )
  if (missing.length) {
    await db
      .update(promoPhones)
      .set({ adbState: "gone", stateSince: now })
      .where(inArray(promoPhones.id, missing.map((phone) => phone.id)))
  }
  for (const phone of missing) {
    await recordPhoneEvent(
      rack.userId,
      phone.id,
      "unplugged",
      phone.usbPort ? `It was on USB port ${phone.usbPort}.` : "",
      db,
      now
    )
  }

  return { latestVersion: RACK_VERSION, checkInSeconds: RACK_CHECK_IN_SECONDS }
}

function pluggedWords(usb: string, state: string, kind: PhoneKind): string {
  return [
    usb ? `On USB port ${usb}.` : "",
    state === "unauthorized"
      ? kind === "iphone"
        ? "Waiting for Trust this computer on its screen."
        : "Waiting for USB debugging to be allowed on its screen."
      : "",
    state === "too_old" ? `Its iOS is too old for the rack; ${OLDEST_IOS} or newer.` : "",
    state === "no_driver" ? "WebDriverAgent is not running on the rack, so it cannot be driven." : "",
  ]
    .filter(Boolean)
    .join(" ")
}

/** The name of a phone whose model could not be read yet. */
function serialName(serial: string): string {
  return `Phone ${serial.slice(-4)}`
}

function rollbackWords(note: { from: string; to: string; at: string; why: string }): string {
  const at = new Date(note.at)
  const when = Number.isNaN(at.getTime()) ? "" : ` on ${at.toISOString().slice(0, 16).replace("T", " ")} UTC`
  return `Went back to ${note.to.slice(0, 40)}${when}, because ${note.from.slice(0, 40)} ${note.why.slice(0, 120)}.`
}

/**
 * Hands the rack its oldest waiting action and marks it running, in one
 * statement, so an action is never handed out twice. A phone runs one action
 * at a time, in order, so an action whose phone is already busy waits; two
 * phones work side by side. An action left running past its own time limit
 * is failed first: the rack lost it.
 *
 * Every column in the raw statement is qualified, because an unqualified one
 * resolves against the wrong table without complaint.
 */
export async function nextAction(
  rack: VerifiedRack,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ id: string; serial: string; action: string; args: Record<string, unknown>; timeoutSeconds: number } | null> {
  await db
    .update(promoPhoneActions)
    .set({ status: "failed", error: "The rack did not answer in time.", finishedAt: now })
    .where(
      and(
        eq(promoPhoneActions.rackId, rack.id),
        eq(promoPhoneActions.status, "running"),
        sql`${promoPhoneActions.startedAt} + make_interval(secs => ${promoPhoneActions.timeoutSeconds}) < ${now}`
      )
    )

  const claimed = await db.execute(sql`
    UPDATE "promo_phone_actions"
    SET "status" = 'running', "started_at" = ${now}
    WHERE "promo_phone_actions"."id" = (
      SELECT "waiting"."id" FROM "promo_phone_actions" AS "waiting"
      WHERE "waiting"."rack_id" = ${rack.id}
        AND "waiting"."status" = 'queued'
        AND NOT EXISTS (
          SELECT 1 FROM "promo_phone_actions" AS "busy"
          WHERE "busy"."phone_id" = "waiting"."phone_id" AND "busy"."status" = 'running'
        )
      ORDER BY "waiting"."created_at" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "promo_phone_actions"."id", "promo_phone_actions"."phone_id",
              "promo_phone_actions"."action", "promo_phone_actions"."args",
              "promo_phone_actions"."timeout_seconds"
  `)
  const action = (
    claimed.rows as Array<{
      id: string
      phone_id: string
      action: string
      args: Record<string, unknown> | null
      timeout_seconds: number
    }>
  )[0]
  if (!action) return null
  const [phone] = await db
    .select({ serial: promoPhones.serial })
    .from(promoPhones)
    .where(eq(promoPhones.id, action.phone_id))
    .limit(1)
  return {
    id: action.id,
    serial: phone?.serial ?? "",
    action: action.action,
    args: action.args ?? {},
    // The rack reopens a frozen app shortly before this runs out.
    timeoutSeconds: action.timeout_seconds,
  }
}

export type ActionResultInput = {
  id: string
  ok: boolean
  result: Record<string, unknown> | null
  error: string
  /** A picture of each step. */
  steps?: StepShot[]
  /** An app's suspended, locked or "confirm it's you" screen, when one was on the phone. */
  banScreen?: BanScreen | null
  /** What the rack did about a freeze: 'app' or 'phone', or empty. */
  recovered?: string
}

/**
 * The rack's answer to an action. Only the rack the action was handed to can
 * answer it, and only while it is running, so a late answer to a cancelled
 * action changes nothing.
 *
 * Then, whatever the action: its step pictures are kept, a ban screen stops
 * the account, and a frozen app the rack reopened goes in the phone's
 * history. The self-test, the Play Store look and an app update each move
 * their own records on (`self-test.ts`).
 */
export async function finishAction(
  rack: VerifiedRack,
  input: ActionResultInput,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<boolean> {
  const recovered = input.recovered === "app" || input.recovered === "phone" ? input.recovered : ""
  const mine = and(
    eq(promoPhoneActions.id, input.id),
    eq(promoPhoneActions.rackId, rack.id),
    eq(promoPhoneActions.status, "running")
  )
  const [running] = await db
    .select({ id: promoPhoneActions.id, phoneId: promoPhoneActions.phoneId })
    .from(promoPhoneActions)
    .where(mine)
    .limit(1)
  if (!running) return false

  // The pictures go first, so a window that sees the action finished sees
  // every step it took, not the first few while the rest are still uploading.
  const kept = await keepStepPictures(running.phoneId, running.id, input.steps ?? [], db, now)
  // Before the action reads as finished, so the job waiting on it already
  // finds its account stopped and does not put itself back on the queue.
  if (input.banScreen) await stopForBanScreen(rack.userId, running.phoneId, input.banScreen, db, now)

  const [done] = await db
    .update(promoPhoneActions)
    .set({
      status: input.ok ? "done" : "failed",
      result: input.ok ? input.result : null,
      error: input.ok ? "" : input.error.slice(0, 2_000) || "The rack gave no reason.",
      recovered,
      finishedAt: now,
    })
    .where(mine)
    .returning({
      id: promoPhoneActions.id,
      phoneId: promoPhoneActions.phoneId,
      action: promoPhoneActions.action,
      args: promoPhoneActions.args,
    })
  if (!done) {
    // Cancelled while the pictures were uploading: the answer is turned away.
    await dropStepPictures(kept, db)
    return false
  }

  if (recovered === "app") {
    await recordPhoneEvent(
      rack.userId,
      done.phoneId,
      "restarted",
      `An app froze during ${actionWords(done.action)}, so the rack closed it and opened it again.`,
      db,
      now
    )
  }

  if (done.action === "phone/self-test" && input.ok) {
    await recordSelfTest(rack.userId, done.phoneId, done.id, input.result, db, now)
  } else if (done.action === "phone/check-updates" && input.ok) {
    await recordStoreCheck(rack.userId, done.phoneId, input.result, db, now)
  } else if (done.action === "phone/update-app") {
    await recordAppUpdate(rack.userId, done.phoneId, done.args, input, db, now)
  } else if (done.action === "phone/setup-check" && input.ok) {
    await recordSetupCheck(rack.userId, done.phoneId, input.result, db, now)
  } else if (done.action === "phone/wipe" && input.ok && input.result?.wiped === true) {
    await recordWipe(rack.userId, done.phoneId, db, now)
  } else if (done.action === "reddit/state" && input.ok) {
    await finishMoveFromPhone(rack.userId, done.phoneId, input.result, db, now)
  }
  return true
}

export type PhoneActionView = {
  id: string
  action: string
  status: string
  /** A finished check's answer in words, or empty. */
  answer: string
  error: string
  /** What the rack did about a freeze: 'app', 'phone' or empty. */
  recovered: string
  createdAt: Date
  finishedAt: Date | null
  /** The steps it has pictures for, in order. The pictures themselves are asked for one action at a time. */
  steps: string[]
}

/** The phone's last twenty actions, newest first, with the names of their steps. */
export async function phoneActions(
  userId: string,
  phoneId: string,
  db: CustomShellDb = defaultDb
): Promise<PhoneActionView[]> {
  const actions = await db
    .select()
    .from(promoPhoneActions)
    .where(and(eq(promoPhoneActions.phoneId, phoneId), eq(promoPhoneActions.userId, userId)))
    .orderBy(desc(promoPhoneActions.createdAt))
    .limit(20)
  if (!actions.length) return []
  const shots = await db
    .select({ actionId: promoPhoneScreenshots.actionId, step: promoPhoneScreenshots.step })
    .from(promoPhoneScreenshots)
    .where(inArray(promoPhoneScreenshots.actionId, actions.map((action) => action.id)))
    .orderBy(asc(promoPhoneScreenshots.position), asc(promoPhoneScreenshots.createdAt))
  return actions.map((action) => ({
    id: action.id,
    action: action.action,
    status: action.status,
    answer: action.status === "done" && action.result ? resultWords(action.action, action.result) : "",
    error: action.error,
    recovered: action.recovered,
    createdAt: action.createdAt,
    finishedAt: action.finishedAt,
    steps: shots.filter((shot) => shot.actionId === action.id).map((shot) => shot.step),
  }))
}

export type RackView = {
  id: string
  name: string
  platform: string
  version: string
  /** True when it checked in within the last 45 seconds. */
  live: boolean
  seenAt: Date | null
  pairedAt: Date
  updateNote: string
  /** False when the program is on an older version than Promo serves. */
  upToDate: boolean
  /** When its WebDriverAgent signature runs out, or null on a rack without iPhone tools. */
  wdaExpiresAt: Date | null
}

/** The racks still paired, newest first. A disconnected rack is not listed. */
export async function listRacks(
  userId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<RackView[]> {
  const rows = await db
    .select()
    .from(promoRacks)
    .where(and(eq(promoRacks.userId, userId), isNull(promoRacks.disconnectedAt)))
    .orderBy(desc(promoRacks.pairedAt))
  return rows.map((rack) => ({
    id: rack.id,
    name: rack.name,
    platform: rack.platform,
    version: rack.version,
    live: Boolean(rack.seenAt && now.getTime() - rack.seenAt.getTime() < PHONE_STALE_MS),
    seenAt: rack.seenAt,
    pairedAt: rack.pairedAt,
    updateNote: rack.updateNote,
    upToDate: rack.version === RACK_VERSION,
    wdaExpiresAt: rack.wdaExpiresAt,
  }))
}

/**
 * Cancels a rack's key at once. Every message it sends from now on is
 * refused, every action waiting for it is cancelled, and its phones read
 * offline because their rack is gone. The phone records and the accounts on
 * them stay.
 */
export async function disconnectRack(
  userId: string,
  rackId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [rack] = await db
    .update(promoRacks)
    .set({ disconnectedAt: now })
    .where(and(eq(promoRacks.id, rackId), eq(promoRacks.userId, userId), isNull(promoRacks.disconnectedAt)))
    .returning({ id: promoRacks.id })
  if (!rack) throw new Error("That rack is not connected.")
  // Disconnected on purpose, so it is not "not checking in" any more.
  await clearProblem(userId, "rack_silent", rackId, null, db, now)
  await db
    .update(promoPhoneActions)
    .set({ status: "cancelled", error: "The rack was disconnected.", finishedAt: now })
    .where(and(eq(promoPhoneActions.rackId, rackId), inArray(promoPhoneActions.status, ["queued", "running"])))
}
