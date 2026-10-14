import { randomBytes, randomInt } from "node:crypto"
import { and, asc, desc, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm"

import {
  PHONE_ACTION_TIMEOUT_MS,
  PHONE_ACTIONS,
  PHONE_STALE_MS,
  RACK_CHECK_IN_SECONDS,
  RACK_CLOCK_WINDOW_SECONDS,
  RACK_CODE_MINUTES,
  type PhoneAction,
} from "@/lib/phones/options"
import { resultWords } from "@/lib/phones/wording"
import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { writePhoneNotice } from "./notices"
import { RACK_VERSION } from "./release"
import {
  promoPhoneActions,
  promoPhones,
  promoPhoneScreenshots,
  promoRackCodes,
  promoRackNonces,
  promoRacks,
} from "./schema"
import { replySignature, requestSignature, sameSignature, sha256Hex } from "./signing"

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

export type ReportedPhone = { serial: string; state: string; usb: string; model: string; android: string }

export type CheckInInput = {
  version: string
  platform: string
  phones: ReportedPhone[]
  rolledBack: { from: string; to: string; at: string; why: string } | null
}

/**
 * A rack's check-in: which phones adb sees, and the program's version.
 *
 * A serial Promo has never seen becomes a phone record named after its model,
 * so plugging a phone in is all it takes to see it on the dashboard. A known
 * phone gets its USB port, adb's word for it and the time. A phone that was
 * plugged into this rack and is missing now is marked gone at once, and a
 * phone that went missing or is waiting for a tap on its screen gets a bell
 * notice that names its shelf slot.
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
          model: seen.model.trim().slice(0, 120),
          androidVersion: seen.android.trim().slice(0, 40),
          serial,
          usbPort: seen.usb.slice(0, 120),
          rackId: rack.id,
          adbState: state,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning()
      if (added && state === "unauthorized") {
        await writePhoneNotice(rack.userId, added, "is waiting for you to allow USB debugging on its screen", db)
      }
      continue
    }
    await db
      .update(promoPhones)
      .set({
        rackId: rack.id,
        usbPort: seen.usb.slice(0, 120),
        adbState: state,
        lastSeenAt: now,
        // The model a person typed is kept; adb's fills a blank one. The
        // Android version is a fact the phone reports, so it always wins.
        ...(phone.model ? {} : { model: seen.model.trim().slice(0, 120) }),
        // A phone first seen before USB debugging was allowed got a name from
        // its serial. It takes its model's name once that can be read.
        ...(phone.name === serialName(serial) && seen.model.trim() ? { name: seen.model.trim().slice(0, 120) } : {}),
        ...(seen.android.trim() ? { androidVersion: seen.android.trim().slice(0, 40) } : {}),
      })
      .where(eq(promoPhones.id, phone.id))
    if (state === "unauthorized" && phone.adbState !== "unauthorized") {
      await writePhoneNotice(rack.userId, phone, "is waiting for you to allow USB debugging on its screen", db)
    }
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
      .set({ adbState: "gone" })
      .where(inArray(promoPhones.id, missing.map((phone) => phone.id)))
  }
  for (const phone of missing) {
    const wasLive =
      phone.adbState === "device" &&
      phone.lastSeenAt !== null &&
      now.getTime() - phone.lastSeenAt.getTime() < PHONE_STALE_MS * 2
    if (wasLive && !phone.held) {
      await writePhoneNotice(rack.userId, phone, "disappeared from the rack", db)
    }
  }

  return { latestVersion: RACK_VERSION, checkInSeconds: RACK_CHECK_IN_SECONDS }
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
 * statement, so an action is never handed out twice. An action left running
 * longer than five minutes is failed first: the rack lost it.
 */
export async function nextAction(
  rack: VerifiedRack,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ id: string; serial: string; action: string; args: Record<string, unknown> } | null> {
  await db
    .update(promoPhoneActions)
    .set({ status: "failed", error: "The rack did not answer within five minutes.", finishedAt: now })
    .where(
      and(
        eq(promoPhoneActions.rackId, rack.id),
        eq(promoPhoneActions.status, "running"),
        lt(promoPhoneActions.startedAt, new Date(now.getTime() - PHONE_ACTION_TIMEOUT_MS))
      )
    )

  const claimed = await db
    .update(promoPhoneActions)
    .set({ status: "running", startedAt: now })
    .where(
      eq(
        promoPhoneActions.id,
        sql`(SELECT ${promoPhoneActions.id} FROM ${promoPhoneActions}
              WHERE ${promoPhoneActions.rackId} = ${rack.id} AND ${promoPhoneActions.status} = 'queued'
              ORDER BY ${promoPhoneActions.createdAt} ASC
              LIMIT 1 FOR UPDATE SKIP LOCKED)`
      )
    )
    .returning()
  const action = claimed[0]
  if (!action) return null
  const [phone] = await db
    .select({ serial: promoPhones.serial })
    .from(promoPhones)
    .where(eq(promoPhones.id, action.phoneId))
    .limit(1)
  return { id: action.id, serial: phone?.serial ?? "", action: action.action, args: action.args }
}

export type ActionResultInput = {
  id: string
  ok: boolean
  result: Record<string, unknown> | null
  error: string
  screenshots: string[]
}

/** At most this many pictures per action, each at most about 1.5MB of base64. */
const MAX_SCREENSHOTS = 4
const MAX_SCREENSHOT_CHARS = 2_000_000

/**
 * The rack's answer to an action. Only the rack the action was handed to can
 * answer it, and only while it is running, so a late answer to a cancelled
 * action changes nothing.
 */
export async function finishAction(
  rack: VerifiedRack,
  input: ActionResultInput,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<boolean> {
  const [done] = await db
    .update(promoPhoneActions)
    .set({
      status: input.ok ? "done" : "failed",
      result: input.ok ? input.result : null,
      error: input.ok ? "" : input.error.slice(0, 2_000) || "The rack gave no reason.",
      finishedAt: now,
    })
    .where(
      and(
        eq(promoPhoneActions.id, input.id),
        eq(promoPhoneActions.rackId, rack.id),
        eq(promoPhoneActions.status, "running")
      )
    )
    .returning({ id: promoPhoneActions.id, phoneId: promoPhoneActions.phoneId })
  if (!done) return false
  const shots = input.screenshots
    .slice(0, MAX_SCREENSHOTS)
    .filter((shot) => shot.length <= MAX_SCREENSHOT_CHARS && /^[A-Za-z0-9+/=]+$/.test(shot))
  if (shots.length) {
    await db
      .insert(promoPhoneScreenshots)
      .values(shots.map((imageBase64) => ({ id: uuid(), actionId: done.id, imageBase64, createdAt: now })))
    await trimScreenshots(done.phoneId, db)
  }
  return true
}

/**
 * Pictures are kept for a phone's newest twenty actions only, the ones the
 * dashboard can show, so the table does not grow with every check ever run.
 */
const KEEP_SCREENSHOT_ACTIONS = 20

async function trimScreenshots(phoneId: string, db: CustomShellDb): Promise<void> {
  await db.execute(sql`
    DELETE FROM ${promoPhoneScreenshots}
    WHERE ${promoPhoneScreenshots.actionId} IN (
      SELECT ${promoPhoneActions.id} FROM ${promoPhoneActions}
      WHERE ${promoPhoneActions.phoneId} = ${phoneId}
      ORDER BY ${promoPhoneActions.createdAt} DESC
      OFFSET ${KEEP_SCREENSHOT_ACTIONS}
    )`)
}

/**
 * Writes a named action for one phone, because a person pressed a button.
 * Refused for a name not on the list, a held phone, and a phone with no
 * connected rack. A second press while the same action is waiting adds
 * nothing.
 */
export async function queuePhoneAction(
  userId: string,
  phoneId: string,
  action: PhoneAction,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string> {
  if (!(PHONE_ACTIONS as readonly string[]).includes(action)) throw new Error("That is not an action a phone runs.")
  const [row] = await db
    .select({ phone: promoPhones, rackDisconnectedAt: promoRacks.disconnectedAt, rackSeenAt: promoRacks.seenAt })
    .from(promoPhones)
    .leftJoin(promoRacks, eq(promoRacks.id, promoPhones.rackId))
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That phone does not exist.")
  const { phone } = row
  if (phone.held) throw new Error("That phone is held. Release it first.")
  if (!phone.rackId || row.rackDisconnectedAt) throw new Error("That phone is not on a connected rack.")
  if (!row.rackSeenAt || now.getTime() - row.rackSeenAt.getTime() > PHONE_STALE_MS) {
    throw new Error("The rack has not checked in for a minute. Check the computer the phones are plugged into.")
  }
  if (phone.adbState !== "device" || !phone.lastSeenAt || now.getTime() - phone.lastSeenAt.getTime() > PHONE_STALE_MS) {
    throw new Error("That phone is offline. Plug it in and allow USB debugging on its screen.")
  }

  const [waiting] = await db
    .select({ id: promoPhoneActions.id })
    .from(promoPhoneActions)
    .where(
      and(
        eq(promoPhoneActions.phoneId, phoneId),
        eq(promoPhoneActions.action, action),
        inArray(promoPhoneActions.status, ["queued", "running"])
      )
    )
    .limit(1)
  if (waiting) return waiting.id

  const id = uuid()
  await db.insert(promoPhoneActions).values({ id, userId, rackId: phone.rackId, phoneId, action, createdAt: now })
  return id
}

export type PhoneActionView = {
  id: string
  action: string
  status: string
  /** A finished check's answer in words, or empty. */
  answer: string
  error: string
  createdAt: Date
  finishedAt: Date | null
  /** JPEG pictures as data addresses, newest action's first. */
  screenshots: string[]
}

/** The phone's last ten actions, newest first, with their pictures. */
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
    .limit(10)
  if (!actions.length) return []
  const shots = await db
    .select({ actionId: promoPhoneScreenshots.actionId, imageBase64: promoPhoneScreenshots.imageBase64 })
    .from(promoPhoneScreenshots)
    .where(inArray(promoPhoneScreenshots.actionId, actions.map((action) => action.id)))
    .orderBy(asc(promoPhoneScreenshots.createdAt))
  return actions.map((action) => ({
    id: action.id,
    action: action.action,
    status: action.status,
    answer: action.status === "done" && action.result ? resultWords(action.action, action.result) : "",
    error: action.error,
    createdAt: action.createdAt,
    finishedAt: action.finishedAt,
    screenshots: shots
      .filter((shot) => shot.actionId === action.id)
      .map((shot) => `data:image/jpeg;base64,${shot.imageBase64}`),
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
  await db
    .update(promoPhoneActions)
    .set({ status: "cancelled", error: "The rack was disconnected.", finishedAt: now })
    .where(and(eq(promoPhoneActions.rackId, rackId), inArray(promoPhoneActions.status, ["queued", "running"])))
}
