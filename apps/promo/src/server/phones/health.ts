import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm"

import {
  APP_WORDS,
  COOL_AGAIN_C,
  HOT_C,
  NO_SIGNAL_NOTICE_MS,
  OFFLINE_NOTICE_MS,
  PHONE_LANE_PREFIX,
  PHONE_STALE_MS,
  RACK_SILENT_NOTICE_MS,
  READING_GAP_MS,
  READING_KEEP_DAYS,
  STORAGE_FULL_PERCENT,
  TRACKED_APPS,
  slotWords,
  type TrackedApp,
} from "@/lib/phones/options"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import type { PromoNoticeKind } from "@/lib/social/notice-words"
import { noticeId, ringBell, type PromoNotice } from "@/server/social/notices"
import { settleFailedMediumJob } from "@/server/social/medium/settle"
import { promoAccounts, promoJobs, promoNotices } from "@/server/social/schema"
import { settleFailedXJob } from "@/server/social/x/settle"

import { recordPhoneEvent } from "./history"
import { clearProblem, raiseProblem } from "./notices"
import { offlineReason } from "./phones"
import { promoPhoneReadings, promoPhones, promoRacks } from "./schema"

/**
 * A phone's health: what the rack reads off it about once a minute, the bell
 * when something is wrong (part 14 of the phone farm), the battery and heat
 * chart (part 19), and an account stopped by a ban screen (part 15).
 */

type PhoneRow = typeof promoPhones.$inferSelect

/** What the rack read off one phone, sent with a check-in once a minute. */
export type ReportedVitals = {
  batteryPercent: number | null
  temperatureC: number | null
  storageUsedPercent: number | null
  /** Android's word for the SIM's service, or empty when it could not be read. */
  signal: string
  upSeconds: number | null
  /** Each tracked app's version, read every ten minutes; null when not read this time. */
  apps: Partial<Record<TrackedApp, string>> | null
  /** Why the rack restarted the phone, sent once with the first reading after. */
  restartWhy: string
}

const NO_SIGNAL = new Set(["out_of_service", "emergency_only", "power_off"])

/** "Pixel 8a in slot 4", so a notice names the phone the way the shelf does. */
export function phoneWords(phone: { name: string; shelfSlot: string }): string {
  const slot = slotWords(phone.shelfSlot)
  return `${phone.name}${slot ? ` in ${slot}` : ""}`
}

function phoneHref(phoneId: string): string {
  return `/admin/phones?open=${encodeURIComponent(phoneId)}`
}

/**
 * Writes one minute's reading: the newest figures on the phone's row, a
 * restart or an app update in its history, and a point on the chart every
 * ten minutes, plus every hot reading so a short spike shows when it
 * happened.
 */
export async function recordVitals(
  userId: string,
  phone: PhoneRow,
  vitals: ReportedVitals,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const signal = vitals.signal.slice(0, 20)
  const lost = NO_SIGNAL.has(signal)
  const apps = vitals.apps ? cleanApps(vitals.apps) : null

  await db
    .update(promoPhones)
    .set({
      batteryPercent: vitals.batteryPercent,
      temperatureC: vitals.temperatureC,
      storageUsedPercent: vitals.storageUsedPercent,
      signal,
      // An unread signal keeps whatever was known; a read one moves it.
      ...(signal ? { signalLostAt: lost ? (phone.signalLostAt ?? now) : null } : {}),
      upSeconds: vitals.upSeconds,
      vitalsAt: now,
      ...(apps ? { apps } : {}),
    })
    .where(eq(promoPhones.id, phone.id))

  // A phone that has been on for less time than at the last reading was
  // restarted in between, by the rack, a person, or itself.
  if (phone.upSeconds !== null && vitals.upSeconds !== null && vitals.upSeconds < phone.upSeconds) {
    const why = vitals.restartWhy.trim().slice(0, 300) || "Nobody in Promo asked it to. It restarted by itself or by hand."
    await recordPhoneEvent(userId, phone.id, "restarted", why, db, now)
  }

  // Only a change between two known versions is an update. The first
  // reading of a phone, or an app newly put on, is not.
  if (apps) {
    for (const app of TRACKED_APPS) {
      const before = phone.apps[app]
      const after = apps[app]
      if (before && after && before !== after) {
        await recordPhoneEvent(userId, phone.id, "app_updated", `${APP_WORDS[app]} went from ${before} to ${after}.`, db, now)
      }
    }
  }

  if (vitals.batteryPercent === null && vitals.temperatureC === null) return
  const hot = vitals.temperatureC !== null && vitals.temperatureC >= HOT_C
  // The ten-minute rhythm is kept by the regular points only, so a hot
  // reading is an extra point rather than moving the next one along.
  const [last] = await db
    .select({ at: promoPhoneReadings.at })
    .from(promoPhoneReadings)
    .where(
      and(
        eq(promoPhoneReadings.phoneId, phone.id),
        or(isNull(promoPhoneReadings.temperatureC), lt(promoPhoneReadings.temperatureC, HOT_C))
      )
    )
    .orderBy(desc(promoPhoneReadings.at))
    .limit(1)
  if (hot || !last || now.getTime() - last.at.getTime() >= READING_GAP_MS) {
    await db
      .insert(promoPhoneReadings)
      .values({ phoneId: phone.id, at: now, batteryPercent: vitals.batteryPercent, temperatureC: vitals.temperatureC })
      .onConflictDoNothing()
  }
}

function cleanApps(apps: Partial<Record<TrackedApp, string>>): Partial<Record<TrackedApp, string>> {
  const out: Partial<Record<TrackedApp, string>> = {}
  for (const app of TRACKED_APPS) {
    const version = String(apps[app] ?? "").trim().slice(0, 60)
    if (version) out[app] = version
  }
  return out
}

/**
 * The sweep behind the bell, every fifteen seconds. Each problem below has
 * one notice per phone, raised when it starts and taken away when it ends:
 *
 * - offline for more than five minutes. A phone waiting for someone to allow
 *   USB debugging rings at once, because nothing will change until a person
 *   taps its screen. A held phone never rings: someone took it out of use.
 * - a battery above 45 degrees, cleared at 43 so a phone sitting at 45 does
 *   not ring and clear over and over.
 * - a SIM phone with no signal for ten minutes.
 * - storage more than 90 out of 100 full.
 * - the rack not checking in for five minutes, once for the rack. Its phones
 *   are left as they are meanwhile, because nothing new is known about them.
 *
 * A phone on a disconnected rack never rings for being offline: someone
 * disconnected it on purpose.
 *
 * Which notices are up is read once per sweep, so a quiet rack costs a few
 * reads every fifteen seconds, not a write per phone per problem.
 */
export async function sweepPhoneHealth(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const up = new Set(
    (
      await db
        .select({ id: promoNotices.id })
        .from(promoNotices)
        .where(inArray(promoNotices.kind, HEALTH_KINDS))
    ).map((row) => row.id)
  )
  const sweep: Sweep = {
    now,
    raise: async (userId, notice, history) => {
      if (!up.has(noticeId(notice.kind, notice.targetId))) await raiseProblem(userId, notice, history, db, now)
    },
    clear: async (userId, kind, targetId, history) => {
      if (up.has(noticeId(kind, targetId))) await clearProblem(userId, kind, targetId, history, db, now)
    },
  }

  const racks = await db
    .select({
      id: promoRacks.id,
      userId: promoRacks.userId,
      name: promoRacks.name,
      seenAt: promoRacks.seenAt,
      wdaExpiresAt: promoRacks.wdaExpiresAt,
    })
    .from(promoRacks)
    .where(isNull(promoRacks.disconnectedAt))
  const silent = new Set<string>()
  for (const rack of racks) {
    await sweepWebDriverAgent(sweep, rack)
    const quiet = !rack.seenAt || now.getTime() - rack.seenAt.getTime() > RACK_SILENT_NOTICE_MS
    if (quiet) silent.add(rack.id)
    // A rack that never checked in is still being installed; nothing to say yet.
    if (quiet && rack.seenAt) {
      await sweep.raise(rack.userId, {
        kind: "rack_silent",
        targetId: rack.id,
        message: `Rack not checking in: ${rack.name || "the rack"}`,
        detail:
          "It has not checked in for five minutes, so its phones are offline and their jobs fail. Check that the computer the phones are plugged into is on and online.",
        href: "/admin/phones",
      })
    } else if (!quiet) {
      await sweep.clear(rack.userId, "rack_silent", rack.id)
    }
  }
  const connected = new Set(racks.map((rack) => rack.id))

  const phones = await db.select().from(promoPhones).where(isNotNull(promoPhones.rackId))
  for (const phone of phones) {
    if (!phone.rackId || silent.has(phone.rackId)) continue
    const online = await sweepOffline(sweep, phone, connected.has(phone.rackId))
    // The last reading of a phone that is gone is old news: it may clear a
    // notice, never raise one beside "Phone offline".
    await sweepHeat(sweep, phone, online)
    await sweepSignal(sweep, phone, online)
    await sweepStorage(sweep, phone, online)
  }
}

const HEALTH_KINDS: PromoNoticeKind[] = ["phone_offline", "phone_hot", "phone_signal", "phone_storage", "rack_silent", "rack_wda"]

/** The bell warns this long before the rack's WebDriverAgent signature runs out. */
const WDA_WARN_MS = 24 * 60 * 60_000

/** What to do on the rack Mac, in the notice. */
const WDA_RESIGN_WORDS =
  "On the rack Mac, run `bash ~/Library/Application Support/PromoRack/wda.sh` and follow its prompts; the Rack window on the Phones dashboard has the same steps."

/**
 * WebDriverAgent, the tool the rack taps iPhones through, is signed with a
 * free Apple ID and dies every 7 days (Tyler, 18 Oct 2026). The rack reports
 * when its signature runs out on every check-in. One notice a day before,
 * and one once it has run out; each rings once, and both go when a later
 * check-in moves the date on. A rack without iPhone tools reports no date
 * and never rings.
 */
async function sweepWebDriverAgent(
  sweep: Sweep,
  rack: { id: string; userId: string; name: string; wdaExpiresAt: Date | null }
): Promise<void> {
  const { now } = sweep
  const soonId = `${rack.id}:soon`
  const outId = `${rack.id}:out`
  const name = rack.name || "the rack"
  const left = rack.wdaExpiresAt ? rack.wdaExpiresAt.getTime() - now.getTime() : null
  if (left === null || left > WDA_WARN_MS) {
    await sweep.clear(rack.userId, "rack_wda", soonId)
    await sweep.clear(rack.userId, "rack_wda", outId)
    return
  }
  if (left > 0) {
    await sweep.clear(rack.userId, "rack_wda", outId)
    await sweep.raise(rack.userId, {
      kind: "rack_wda",
      targetId: soonId,
      message: `WebDriverAgent on the rack runs out tomorrow; re-sign it in Xcode`,
      detail: `${name}'s WebDriverAgent signature runs out at ${rack.wdaExpiresAt!.toISOString().slice(0, 16).replace("T", " ")} UTC. After that its iPhones are offline until it is signed again. ${WDA_RESIGN_WORDS}`,
      href: "/admin/phones",
    })
    return
  }
  await sweep.clear(rack.userId, "rack_wda", soonId)
  await sweep.raise(rack.userId, {
    kind: "rack_wda",
    targetId: outId,
    message: `WebDriverAgent on the rack has run out; its iPhones are offline until it is re-signed`,
    detail: `${name}'s WebDriverAgent signature ran out, so the rack cannot tap its iPhones and their jobs fail. ${WDA_RESIGN_WORDS}`,
    href: "/admin/phones",
  })
}

type HistoryLine = Parameters<typeof raiseProblem>[2]

/** One sweep's raise and clear, which skip a notice already in the state asked for. */
type Sweep = {
  now: Date
  raise: (userId: string, notice: PromoNotice, history?: HistoryLine) => Promise<void>
  clear: (userId: string, kind: PromoNoticeKind, targetId: string, history?: HistoryLine) => Promise<void>
}

/** Rings or clears the offline notice, and says whether the phone is online. */
async function sweepOffline(sweep: Sweep, phone: PhoneRow, rackConnected: boolean): Promise<boolean> {
  const { now } = sweep
  const seenRecently = phone.lastSeenAt !== null && now.getTime() - phone.lastSeenAt.getTime() < PHONE_STALE_MS
  const online = rackConnected && phone.adbState === "device" && seenRecently
  // An iPhone too old for the rack is offline by design and never "comes
  // back", so it gets no bell: its row says why.
  if (online || phone.held || !rackConnected || phone.adbState === "too_old") {
    await sweep.clear(phone.userId, "phone_offline", phone.id, {
      phoneId: phone.id,
      kind: "notice_cleared",
      detail: online
        ? "Offline: it is back."
        : phone.held
          ? "Offline: it is held."
          : phone.adbState === "too_old"
            ? "Offline: its iOS is too old for the rack."
            : "Offline: its rack was disconnected.",
    })
    return online
  }
  const since =
    phone.adbState === "device" ? phone.lastSeenAt : (phone.stateSince ?? phone.lastSeenAt ?? phone.createdAt)
  const longEnough = !since || now.getTime() - since.getTime() > OFFLINE_NOTICE_MS
  if (!longEnough && phone.adbState !== "unauthorized") return false
  const reason = offlineReason(phone, rackConnected)
  await sweep.raise(
    phone.userId,
    {
      kind: "phone_offline",
      targetId: phone.id,
      message: `Phone offline: ${phoneWords(phone)}`,
      detail: [
        `${reason}.`,
        phone.adbState === "unauthorized" ? "" : "Its jobs fail until it is back.",
        phone.usbPort ? `It was on USB port ${phone.usbPort}.` : "",
        phone.shelfSlot ? "" : "Type its shelf slot on the Phones dashboard so the notice can say where it is.",
      ]
        .filter(Boolean)
        .join(" "),
      href: phoneHref(phone.id),
    },
    { phoneId: phone.id, kind: "notice_raised", detail: `Offline: ${reason}.` }
  )
  return false
}

async function sweepHeat(sweep: Sweep, phone: PhoneRow, online: boolean): Promise<void> {
  if (phone.temperatureC === null) return
  if (phone.temperatureC > HOT_C) {
    if (!online) return
    await sweep.raise(
      phone.userId,
      {
        kind: "phone_hot",
        targetId: phone.id,
        message: `Phone running hot: ${phoneWords(phone)} is at ${phone.temperatureC.toFixed(1)}°C`,
        detail: `Its battery is above ${HOT_C}°C. A battery kept this hot swells; unplug it or give it air. Its chart is on its Health tab.`,
        href: phoneHref(phone.id),
      },
      { phoneId: phone.id, kind: "ran_hot", detail: `The battery reached ${phone.temperatureC.toFixed(1)}°C.` }
    )
  } else if (phone.temperatureC <= COOL_AGAIN_C) {
    await sweep.clear(phone.userId, "phone_hot", phone.id, {
      phoneId: phone.id,
      kind: "notice_cleared",
      detail: `Running hot: cooled to ${phone.temperatureC.toFixed(1)}°C.`,
    })
  }
}

async function sweepSignal(sweep: Sweep, phone: PhoneRow, online: boolean): Promise<void> {
  const { now } = sweep
  const lostLong =
    phone.connection === "sim" &&
    phone.signalLostAt !== null &&
    now.getTime() - phone.signalLostAt.getTime() > NO_SIGNAL_NOTICE_MS
  if (lostLong) {
    if (!online) return
    await sweep.raise(
      phone.userId,
      {
        kind: "phone_signal",
        targetId: phone.id,
        message: `Phone has no signal: ${phoneWords(phone)}`,
        detail: `Its SIM${phone.simCarrier ? ` (${phone.simCarrier})` : ""} has had no service for ten minutes, so nothing it sends gets out. Check the SIM and that the plan is paid.`,
        href: phoneHref(phone.id),
      },
      { phoneId: phone.id, kind: "notice_raised", detail: "No signal for ten minutes." }
    )
  } else if (phone.signalLostAt === null || phone.connection !== "sim") {
    await sweep.clear(phone.userId, "phone_signal", phone.id, {
      phoneId: phone.id,
      kind: "notice_cleared",
      detail: "No signal: it has a signal again.",
    })
  }
}

async function sweepStorage(sweep: Sweep, phone: PhoneRow, online: boolean): Promise<void> {
  if (phone.storageUsedPercent === null) return
  if (phone.storageUsedPercent > STORAGE_FULL_PERCENT) {
    if (!online) return
    await sweep.raise(
      phone.userId,
      {
        kind: "phone_storage",
        targetId: phone.id,
        message: `Phone storage nearly full: ${phoneWords(phone)}`,
        detail: `Its storage is ${phone.storageUsedPercent} out of 100 full. Apps stop updating and can crash when it fills; clear old photos and app caches.`,
        href: phoneHref(phone.id),
      },
      { phoneId: phone.id, kind: "notice_raised", detail: `Storage ${phone.storageUsedPercent} out of 100 full.` }
    )
  } else {
    await sweep.clear(phone.userId, "phone_storage", phone.id, {
      phoneId: phone.id,
      kind: "notice_cleared",
      detail: `Storage: down to ${phone.storageUsedPercent} out of 100 full.`,
    })
  }
}

export type PhoneReading = { at: Date; batteryPercent: number | null; temperatureC: number | null }

/** The last four weeks of battery and heat, oldest first, for the chart. */
export async function phoneReadings(
  userId: string,
  phoneId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<PhoneReading[]> {
  const [owned] = await db
    .select({ id: promoPhones.id })
    .from(promoPhones)
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .limit(1)
  if (!owned) throw new Error("That phone does not exist.")
  return db
    .select({
      at: promoPhoneReadings.at,
      batteryPercent: promoPhoneReadings.batteryPercent,
      temperatureC: promoPhoneReadings.temperatureC,
    })
    .from(promoPhoneReadings)
    .where(
      and(
        eq(promoPhoneReadings.phoneId, phoneId),
        gte(promoPhoneReadings.at, new Date(now.getTime() - READING_KEEP_DAYS * 86_400_000))
      )
    )
    .orderBy(asc(promoPhoneReadings.at))
}

/** Readings older than four weeks go. The chart never shows them. */
export async function tidyPhoneReadings(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const removed = await db
    .delete(promoPhoneReadings)
    .where(lt(promoPhoneReadings.at, new Date(now.getTime() - READING_KEEP_DAYS * 86_400_000)))
    .returning({ phoneId: promoPhoneReadings.phoneId })
  return removed.length
}

/** What the rack found on screen: the app, which kind of screen, and its own words. */
export type BanScreen = { app: string; kind: string; words: string }

const BAN_KIND_WORDS: Record<string, string> = {
  suspended: "suspended",
  locked: "locked",
  confirm: "asking to confirm it's you",
}

/**
 * Stops the accounts a ban screen is about (part 15). Each account of that
 * app on the phone is marked blocked with the screen's own words, so the
 * Reddit accounts dashboard shows them; its waiting jobs on the phone are
 * dropped; and the bell rings with where the picture is. From then on its
 * jobs are refused (`runner.ts`) until a person lets it run again.
 */
export async function stopForBanScreen(
  userId: string,
  phoneId: string,
  ban: BanScreen,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const app = ban.app.slice(0, 20)
  const words = ban.words.trim().slice(0, 500) || "The app showed a screen that stops the account."
  const [phone] = await db
    .select({ id: promoPhones.id, name: promoPhones.name, shelfSlot: promoPhones.shelfSlot })
    .from(promoPhones)
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .limit(1)
  if (!phone) return
  const accounts = await db
    .update(promoAccounts)
    .set({ blocked: true, blockedReason: words, banScreenAt: now, updatedAt: now })
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.phoneId, phoneId), eq(promoAccounts.platform, app)))
    .returning({ id: promoAccounts.id, handle: promoAccounts.handle, platform: promoAccounts.platform })

  for (const account of accounts) {
    // Jobs that name the account, and for Reddit the older ones that name
    // none and so fall to the Reddit account (`jobAccount`).
    const dropped = await db
      .delete(promoJobs)
      .where(
        and(
          eq(promoJobs.userId, userId),
          eq(promoJobs.status, "queued"),
          eq(promoJobs.lane, `${PHONE_LANE_PREFIX}${phoneId}`),
          or(
            sql`${promoJobs.payload}->>'accountId' = ${account.id}`,
            account.platform === "reddit" ? sql`${promoJobs.payload}->>'accountId' IS NULL` : sql`false`
          )
        )
      )
      .returning({ id: promoJobs.id, kind: promoJobs.kind })
    // A Medium or X row the job carried says why, or it would stay "on its way" for good.
    for (const job of dropped) {
      const why = `Not sent: the app showed a screen that stops the account ("${words}").`
      await settleFailedMediumJob(job, why, db)
      await settleFailedXJob(job, why, db)
    }
    const name = account.handle ? (account.platform === "reddit" ? `u/${account.handle}` : `@${account.handle}`) : "The account"
    const appName = APP_WORDS[account.platform as TrackedApp] ?? account.platform
    await ringBell(
      userId,
      {
        kind: "ban_screen",
        targetId: account.id,
        message: `Ban screen: ${name} on ${phoneWords(phone)}`,
        detail: [
          `${appName} showed it ${BAN_KIND_WORDS[ban.kind] ?? "stopped"}: "${words}".`,
          `Promo stopped the account${dropped.length ? ` and dropped its ${dropped.length} waiting ${dropped.length === 1 ? "job" : "jobs"}` : ""}.`,
          "The picture is on the phone's Actions tab. Let it run again from its settings on the Accounts dashboard once it is sorted.",
        ].join(" "),
        href: phoneHref(phoneId),
      },
      db,
      now
    )
  }
}

/** Lets an account stopped by a ban screen take jobs again, and takes its notice away. */
export async function clearBanScreen(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const updated = await db
    .update(promoAccounts)
    .set({ blocked: false, blockedReason: "", banScreenAt: null, updatedAt: now })
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId), isNotNull(promoAccounts.banScreenAt)))
    .returning({ id: promoAccounts.id })
  if (!updated.length) throw new Error("That account was not stopped by a ban screen.")
  await clearProblem(userId, "ban_screen", accountId, null, db, now)
}

