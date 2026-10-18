import { and, asc, eq, inArray, sql } from "drizzle-orm"

import {
  OLDEST_IOS,
  PHONE_STALE_MS,
  slotWords,
  type PhoneConnection,
  type PhoneKind,
  type PhoneStatus,
  type TrackedApp,
} from "@/lib/phones/options"
import type { SetupCheck } from "@/lib/phones/setup-check"
import { uuid } from "@/server/auth/security"
import { cleanTags } from "@/server/browser/profiles"
import { Refusal } from "@/server/browser/refusal"
import { promoProfileFolders, promoProfileLabels, promoProxies } from "@/server/browser/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { refuseSharedProxy } from "@/server/social/apart"
import { promoAccounts } from "@/server/social/schema"

import { clearProblem } from "./notices"
import { removePhonePictures } from "./trail"

import { promoPhoneActions, promoPhones, promoPhoneSettings, promoRacks } from "./schema"

/**
 * Phones as records: everything the Phones dashboard does with them except
 * talking to the rack, which is `rack.ts`.
 *
 * Every query is scoped by the person's id, and that filter is the ownership
 * check: a foreign id finds nothing, changes nothing and is reported as
 * skipped. Folders, labels and tags are the browser profiles' own, so one
 * folder can hold profiles and phones together.
 */

export type PhoneInput = {
  name: string
  kind: PhoneKind
  model: string
  /** The system version, Android's or iOS's. */
  androidVersion: string
  serial: string
  simCarrier: string
  simNumber: string
  connection: PhoneConnection
  proxyId: string | null
  notes: string
  folderId: string | null
  labelId: string | null
  tags: string[]
  shelfSlot: string
}

/** Refuses a proxy, folder or label id that is not this person's. */
async function assertOwned(
  userId: string,
  input: Pick<PhoneInput, "proxyId" | "folderId" | "labelId">,
  db: CustomShellDb
): Promise<void> {
  const checks = [
    [input.proxyId, promoProxies, "That proxy does not exist."],
    [input.folderId, promoProfileFolders, "That folder does not exist."],
    [input.labelId, promoProfileLabels, "That label does not exist."],
  ] as const
  for (const [id, table, message] of checks) {
    if (!id) continue
    const [row] = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, id), eq(table.userId, userId)))
      .limit(1)
    if (!row) throw new Error(message)
  }
}

function cleanInput(input: PhoneInput) {
  return {
    name: input.name.trim().slice(0, 120) || "Phone",
    kind: input.kind,
    model: input.model.trim().slice(0, 120),
    androidVersion: input.androidVersion.trim().slice(0, 40),
    serial: input.serial.trim().slice(0, 120),
    simCarrier: input.simCarrier.trim().slice(0, 120),
    simNumber: input.simNumber.trim().slice(0, 40),
    connection: input.connection,
    // A proxy only means something on Wi-Fi. A SIM goes out over its own line.
    proxyId: input.connection === "wifi" ? input.proxyId : null,
    notes: input.notes.trim().slice(0, 4_000),
    folderId: input.folderId,
    labelId: input.labelId,
    tags: cleanTags(input.tags),
    shelfSlot: input.shelfSlot.trim().slice(0, 20),
  }
}

/** A unique-serial refusal, in words. */
function serialTaken(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : ""
  if (`${message} ${cause}`.includes("ux_promo_phones_user_serial")) {
    return new Error("Another phone already has that serial number.")
  }
  return error instanceof Error ? error : new Error(message)
}

export async function createPhone(
  userId: string,
  input: PhoneInput,
  db: CustomShellDb = defaultDb
): Promise<string> {
  await assertOwned(userId, input, db)
  const clean = cleanInput(input)
  await refuseSharedProxy(userId, clean.proxyId, "phone", db)
  const id = uuid()
  try {
    await db.insert(promoPhones).values({ id, userId, ...clean })
  } catch (error) {
    throw serialTaken(error)
  }
  return id
}

export async function updatePhone(
  userId: string,
  phoneId: string,
  input: PhoneInput,
  db: CustomShellDb = defaultDb
): Promise<void> {
  await assertOwned(userId, input, db)
  const clean = cleanInput(input)
  await refuseSharedProxy(userId, clean.proxyId, "phone", db)
  let updated: Array<{ id: string }>
  try {
    updated = await db
      .update(promoPhones)
      .set({ ...clean, updatedAt: new Date() })
      .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
      .returning({ id: promoPhones.id })
  } catch (error) {
    throw serialTaken(error)
  }
  if (!updated.length) throw new Error("That phone does not exist.")
}

export type BulkResult = { done: string[]; skipped: string[] }

const PHONE_NOTICE_KINDS = ["phone_offline", "phone_hot", "phone_signal", "phone_storage", "phone_address"] as const

/**
 * Deletes phone records. The accounts on them are left with nowhere to run,
 * never deleted; the database does that through the foreign key. Waiting and
 * running actions go with the phone, its step pictures are deleted from R2
 * first, and its health notices leave the bell. Nothing on the phone itself
 * changes.
 */
export async function deletePhones(
  userId: string,
  ids: string[],
  db: CustomShellDb = defaultDb
): Promise<BulkResult> {
  if (!ids.length) return { done: [], skipped: [] }
  const owned = (
    await db
      .select({ id: promoPhones.id })
      .from(promoPhones)
      .where(and(inArray(promoPhones.id, ids), eq(promoPhones.userId, userId)))
  ).map((row) => row.id)
  await removePhonePictures(owned, db)
  for (const id of owned) {
    for (const kind of PHONE_NOTICE_KINDS) await clearProblem(userId, kind, id, null, db)
  }
  const deleted = await db
    .delete(promoPhones)
    .where(and(inArray(promoPhones.id, ids), eq(promoPhones.userId, userId)))
    .returning({ id: promoPhones.id })
  const done = deleted.map((row) => row.id)
  return { done, skipped: ids.filter((id) => !done.includes(id)) }
}

/**
 * Takes phones out of use by hand, or puts them back. Holding one also
 * cancels the checks still waiting for it; one already running finishes.
 */
export async function holdPhones(
  userId: string,
  ids: string[],
  held: boolean,
  db: CustomShellDb = defaultDb
): Promise<BulkResult> {
  const result = await bulkUpdate(userId, ids, { held }, db)
  if (held && result.done.length) {
    await db
      .update(promoPhoneActions)
      .set({ status: "cancelled", error: "The phone was held.", finishedAt: new Date() })
      .where(and(inArray(promoPhoneActions.phoneId, result.done), eq(promoPhoneActions.status, "queued")))
  }
  return result
}

export async function movePhones(
  userId: string,
  ids: string[],
  folderId: string | null,
  db: CustomShellDb = defaultDb
): Promise<BulkResult> {
  await assertOwned(userId, { proxyId: null, folderId, labelId: null }, db)
  return bulkUpdate(userId, ids, { folderId }, db)
}

export async function labelPhones(
  userId: string,
  ids: string[],
  labelId: string | null,
  db: CustomShellDb = defaultDb
): Promise<BulkResult> {
  await assertOwned(userId, { proxyId: null, folderId: null, labelId }, db)
  return bulkUpdate(userId, ids, { labelId }, db)
}

/** Adds a tag, the profiles' rule: a phone that has it, or has twenty, is left alone. */
export async function tagPhones(
  userId: string,
  ids: string[],
  tag: string,
  db: CustomShellDb = defaultDb
): Promise<BulkResult> {
  const [clean] = cleanTags([tag])
  if (!clean) throw new Error("A tag needs a word in it.")
  return bulkUpdate(
    userId,
    ids,
    {
      tags: sql`CASE
        WHEN jsonb_array_length(${promoPhones.tags}) >= 20 THEN ${promoPhones.tags}
        WHEN EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(${promoPhones.tags}) AS "existing"
          WHERE lower("existing") = lower(${clean})
        ) THEN ${promoPhones.tags}
        ELSE ${promoPhones.tags} || to_jsonb(${clean}::text)
      END`,
    },
    db
  )
}

async function bulkUpdate(
  userId: string,
  ids: string[],
  set:
    | { held: boolean }
    | Partial<Record<"folderId" | "labelId", string | null>>
    | { tags: ReturnType<typeof sql> },
  db: CustomShellDb
): Promise<BulkResult> {
  if (!ids.length) return { done: [], skipped: [] }
  const updated = await db
    .update(promoPhones)
    .set({ ...set, updatedAt: new Date() })
    .where(and(inArray(promoPhones.id, ids), eq(promoPhones.userId, userId)))
    .returning({ id: promoPhones.id })
  const done = updated.map((row) => row.id)
  return { done, skipped: ids.filter((id) => !done.includes(id)) }
}

/**
 * What the dashboard says about a phone. Held wins, because a person chose
 * it, by the hold button or by taking control in its screen window. Then
 * offline: never seen, not seen for three check-ins, missing from
 * its rack's last list, waiting for a tap on its screen, or on a rack that
 * was disconnected. Then busy, while an action runs on it.
 */
export function phoneStatus(
  phone: { held: boolean; controlUntil?: Date | null; adbState: string; lastSeenAt: Date | null },
  rackLive: boolean,
  running: boolean,
  now: Date = new Date()
): PhoneStatus {
  if (phone.held || inUse(phone, now)) return "held"
  const seen = phone.lastSeenAt && now.getTime() - phone.lastSeenAt.getTime() < PHONE_STALE_MS
  if (!rackLive || !seen || phone.adbState !== "device") return "offline"
  return running ? "busy" : "connected"
}

/** True while a person controls the phone from its screen window. */
export function inUse(phone: { controlUntil?: Date | null }, now: Date = new Date()): boolean {
  return Boolean(phone.controlUntil && phone.controlUntil > now)
}

/**
 * Why an offline phone is offline, in words a person can act on, or empty.
 * "restarting" is the rack's own word while it restarts a frozen phone.
 * The shelf slot is not in here: the dashboard shows it beside the status.
 */
export function offlineReason(
  phone: { kind: PhoneKind; adbState: string; lastSeenAt: Date | null; rackId: string | null },
  rackLive: boolean
): string {
  if (!phone.lastSeenAt || !phone.rackId) return "Never seen by the rack"
  if (!rackLive) return "Its rack is not connected"
  if (phone.adbState === "unauthorized") {
    return phone.kind === "iphone" ? "Tap Trust this computer on its screen" : "Allow USB debugging on its screen"
  }
  if (phone.adbState === "too_old") return `Its iOS is too old for the rack; ${OLDEST_IOS} or newer`
  if (phone.adbState === "no_driver") return "WebDriverAgent is not running on the rack; see the Rack window"
  if (phone.adbState === "restarting") return "Restarting"
  if (phone.adbState === "gone") return "Not plugged in"
  return "Not seen for a minute"
}

export type PhoneRecord = {
  id: string
  name: string
  kind: PhoneKind
  model: string
  /** The system version, Android's or iOS's; `systemWords` says which. */
  androidVersion: string
  serial: string
  simCarrier: string
  simNumber: string
  connection: PhoneConnection
  proxy: { id: string; label: string; host: string } | null
  held: boolean
  notes: string
  folderId: string | null
  labelId: string | null
  tags: string[]
  shelfSlot: string
  usbPort: string
  status: PhoneStatus
  /** Why it is offline, or empty when it is not. */
  offlineReason: string
  /** Held because a person controls it from its screen window. */
  inUse: boolean
  lastSeenAt: Date | null
  accounts: Array<{ id: string; platform: string; handle: string; blocked: boolean }>
  /** What the rack last read off it, or nulls before the first reading. */
  vitals: {
    batteryPercent: number | null
    temperatureC: number | null
    storageUsedPercent: number | null
    signal: string
    at: Date | null
  }
  /** Each tracked app's version on it. */
  apps: Partial<Record<TrackedApp, string>>
  /** The last setup check, line by line, or null before the first (part 23). */
  setupCheck: SetupCheck | null
  /** When an account left it, so it needs wiping, or null (part 26). */
  needsWipeAt: Date | null
  /** When the rack last wiped it, or null. */
  wipedAt: Date | null
  /** When an important account was first on it since its last wipe, or null (part 22). */
  heldImportantAt: Date | null
  /** Stopped for showing the wrong address, with what was seen, or null (part 28). */
  addressStop: { at: Date; words: string } | null
  /** A setup check is waiting for the rack or running. */
  setupChecking: boolean
  createdAt: Date
}

/** Every phone the person has, by name, with its status and the accounts on it. */
export async function listPhones(
  userId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<PhoneRecord[]> {
  const rows = await db
    .select({
      phone: promoPhones,
      proxyLabel: promoProxies.label,
      proxyHost: promoProxies.host,
      rackDisconnectedAt: promoRacks.disconnectedAt,
    })
    .from(promoPhones)
    .leftJoin(promoProxies, eq(promoProxies.id, promoPhones.proxyId))
    .leftJoin(promoRacks, eq(promoRacks.id, promoPhones.rackId))
    .where(eq(promoPhones.userId, userId))
    .orderBy(asc(promoPhones.name), asc(promoPhones.id))
  if (!rows.length) return []
  const ids = rows.map((row) => row.phone.id)

  const running = new Set(
    (
      await db
        .select({ phoneId: promoPhoneActions.phoneId })
        .from(promoPhoneActions)
        .where(and(inArray(promoPhoneActions.phoneId, ids), eq(promoPhoneActions.status, "running")))
    ).map((row) => row.phoneId)
  )
  const accounts = await accountsByPhone(userId, ids, db)
  const checking = new Set(
    (
      await db
        .select({ phoneId: promoPhoneActions.phoneId })
        .from(promoPhoneActions)
        .where(
          and(
            inArray(promoPhoneActions.phoneId, ids),
            eq(promoPhoneActions.action, "phone/setup-check"),
            inArray(promoPhoneActions.status, ["queued", "running"])
          )
        )
    ).map((row) => row.phoneId)
  )

  return rows.map(({ phone, proxyLabel, proxyHost, rackDisconnectedAt }) => {
    const rackLive = Boolean(phone.rackId) && !rackDisconnectedAt
    const status = phoneStatus(phone, rackLive, running.has(phone.id), now)
    return {
      id: phone.id,
      name: phone.name,
      kind: phone.kind,
      model: phone.model,
      androidVersion: phone.androidVersion,
      serial: phone.serial,
      simCarrier: phone.simCarrier,
      simNumber: phone.simNumber,
      connection: phone.connection,
      proxy: phone.proxyId && proxyHost !== null ? { id: phone.proxyId, label: proxyLabel ?? "", host: proxyHost } : null,
      held: phone.held,
      notes: phone.notes,
      folderId: phone.folderId,
      labelId: phone.labelId,
      tags: phone.tags,
      shelfSlot: phone.shelfSlot,
      usbPort: phone.usbPort,
      status,
      offlineReason: status === "offline" ? offlineReason(phone, rackLive) : "",
      inUse: inUse(phone, now),
      lastSeenAt: phone.lastSeenAt,
      accounts: accounts.get(phone.id) ?? [],
      vitals: {
        batteryPercent: phone.batteryPercent,
        temperatureC: phone.temperatureC,
        storageUsedPercent: phone.storageUsedPercent,
        signal: phone.signal,
        at: phone.vitalsAt,
      },
      apps: phone.apps,
      setupCheck: phone.setupCheck,
      needsWipeAt: phone.needsWipeAt,
      wipedAt: phone.wipedAt,
      heldImportantAt: phone.heldImportantAt,
      addressStop: phone.addressStopAt ? { at: phone.addressStopAt, words: phone.addressStopWords } : null,
      setupChecking: checking.has(phone.id),
      createdAt: phone.createdAt,
    }
  })
}

/** The accounts on each phone, from rows. No phone is asked. */
export async function accountsByPhone(
  userId: string,
  phoneIds: string[],
  db: CustomShellDb = defaultDb
): Promise<Map<string, Array<{ id: string; platform: string; handle: string; blocked: boolean }>>> {
  const out = new Map<string, Array<{ id: string; platform: string; handle: string; blocked: boolean }>>()
  if (!phoneIds.length) return out
  const rows = await db
    .select({
      id: promoAccounts.id,
      phoneId: promoAccounts.phoneId,
      platform: promoAccounts.platform,
      handle: promoAccounts.handle,
      blocked: promoAccounts.blocked,
    })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), inArray(promoAccounts.phoneId, phoneIds)))
  for (const row of rows) {
    if (!row.phoneId) continue
    const list = out.get(row.phoneId) ?? []
    list.push({ id: row.id, platform: row.platform, handle: row.handle, blocked: row.blocked })
    out.set(row.phoneId, list)
  }
  return out
}

/** Whether the phone is this person's. */
export async function ownsPhone(
  userId: string,
  phoneId: string,
  db: CustomShellDb = defaultDb
): Promise<boolean> {
  const [row] = await db
    .select({ id: promoPhones.id })
    .from(promoPhones)
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .limit(1)
  return Boolean(row)
}

/**
 * The phones an account on `platform` could move to: every phone with no
 * other account of that network on it, by name, except the self-test phone,
 * which carries only its test account. One phone may carry a Reddit, an
 * Instagram and a TikTok account, as one person's phone would. `accountId`
 * is the account asking, whose own phone stays on the list.
 *
 * A phone that needs wiping, or was wiped and has not passed its setup check
 * since, is listed with a note saying so, and picking it is refused with how
 * to get it ready (`wipe.ts`); the note is empty for a ready phone. So is a
 * phone that held an important account, which only an important one may take.
 */
export async function phonesFreeFor(
  userId: string,
  accountId: string | null,
  db: CustomShellDb = defaultDb,
  platform: string = "reddit"
): Promise<Array<{ id: string; name: string; note: string }>> {
  const phones = await db
    .select({
      id: promoPhones.id,
      name: promoPhones.name,
      needsWipeAt: promoPhones.needsWipeAt,
      wipedAt: promoPhones.wipedAt,
      heldImportantAt: promoPhones.heldImportantAt,
      setupPassed: sql<boolean>`coalesce((${promoPhones.setupCheck}->>'passed')::boolean, false)`,
      setupCheckedAt: promoPhones.setupCheckedAt,
    })
    .from(promoPhones)
    // An iPhone under iOS 17 is too old for the rack and takes no account (part 48).
    .where(and(eq(promoPhones.userId, userId), sql`${promoPhones.adbState} <> 'too_old'`))
    .orderBy(asc(promoPhones.name), asc(promoPhones.id))
  const holders = await accountsByPhone(userId, phones.map((phone) => phone.id), db)
  // The test phones of both kinds never take a real account.
  const [settings] = await db
    .select({ testPhoneId: promoPhoneSettings.testPhoneId, testPhoneIphoneId: promoPhoneSettings.testPhoneIphoneId })
    .from(promoPhoneSettings)
    .where(eq(promoPhoneSettings.id, "default"))
    .limit(1)
  return phones
    .filter(
      (phone) =>
        phone.id !== settings?.testPhoneId &&
        phone.id !== settings?.testPhoneIphoneId &&
        (holders.get(phone.id) ?? []).every((other) => other.platform !== platform || other.id === accountId)
    )
    .map((phone) => {
      const own = (holders.get(phone.id) ?? []).some((other) => other.id === accountId)
      const setUpSince = phone.wipedAt && phone.setupPassed && phone.setupCheckedAt && phone.setupCheckedAt > phone.wipedAt
      const note = own
        ? ""
        : phone.needsWipeAt
          ? "needs wiping"
          : phone.wipedAt && !setUpSince
            ? "wiped, set it up again"
            : phone.heldImportantAt
              ? "held an important account"
              : ""
      return { id: phone.id, name: phone.name, note }
    })
}

/**
 * The phone a job is about to run on, as a target for its Reddit steps, or a
 * refusal a person can act on. Offline fails at once, the way a dead proxy
 * does for a browser: a comment is then never tried again, and nothing waits
 * on a phone that is not there. A held phone, or one a person is using from
 * its screen window, puts the job back to wait; that only happens when the
 * hold came in after the job was taken, because the queue skips held phones.
 */
export async function phoneForJob(
  userId: string,
  phoneId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<
  | { ready: true; target: { phone: { id: string; userId: string; rackId: string; name: string; kind: PhoneKind } }; timeZone: string }
  | { ready: false; held: true }
> {
  const [row] = await db
    .select({ phone: promoPhones, rackDisconnectedAt: promoRacks.disconnectedAt })
    .from(promoPhones)
    .leftJoin(promoRacks, eq(promoRacks.id, promoPhones.rackId))
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .limit(1)
  if (!row) throw new Refusal("The phone this account runs on is not there any more. Pick another on the Accounts dashboard.")
  const { phone } = row
  if (phone.held || inUse(phone, now)) return { ready: false, held: true }
  const rackLive = Boolean(phone.rackId) && !row.rackDisconnectedAt
  if (phoneStatus(phone, rackLive, false, now) === "offline" || !phone.rackId) {
    const slot = slotWords(phone.shelfSlot)
    throw new Refusal(
      `${phone.name}${slot ? ` in ${slot}` : ""} is offline: ${offlineReason(phone, rackLive)}. Nothing was sent. Check it on the Phones dashboard.`
    )
  }
  return {
    ready: true,
    target: { phone: { id: phone.id, userId, rackId: phone.rackId, name: phone.name, kind: phone.kind } },
    timeZone: phone.timeZone,
  }
}

/**
 * What the Post button needs to say about the phone an account comments
 * from (part 30 of the phone farm): its shelf slot, whether it is offline or
 * held and why, and a stop for showing the wrong address. Null when there is
 * no such phone.
 */
export type PostPhone = {
  id: string
  name: string
  shelfSlot: string
  status: PhoneStatus
  /** Why it is offline, or empty. */
  offlineReason: string
  /** Held because a person controls it from its screen window. */
  inUse: boolean
  /** Why every job on it is refused, or empty. */
  addressStop: string
}

export async function postPhone(
  userId: string,
  phoneId: string | null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<PostPhone | null> {
  if (!phoneId) return null
  const [row] = await db
    .select({ phone: promoPhones, rackDisconnectedAt: promoRacks.disconnectedAt })
    .from(promoPhones)
    .leftJoin(promoRacks, eq(promoRacks.id, promoPhones.rackId))
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .limit(1)
  if (!row) return null
  const { phone } = row
  const rackLive = Boolean(phone.rackId) && !row.rackDisconnectedAt
  const status = phoneStatus(phone, rackLive, false, now)
  return {
    id: phone.id,
    name: phone.name,
    shelfSlot: phone.shelfSlot,
    status,
    offlineReason: status === "offline" ? offlineReason(phone, rackLive) : "",
    inUse: inUse(phone, now),
    addressStop: phone.addressStopAt ? phone.addressStopWords : "",
  }
}
