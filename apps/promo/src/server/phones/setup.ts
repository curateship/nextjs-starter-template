import { and, count, eq, gte, max } from "drizzle-orm"

import {
  addressVerdict,
  buildSetupCheck,
  readSetupFacts,
  type OutsideReading,
  type SetupCheck,
} from "@/lib/phones/setup-check"
import type { ProxyTestResult } from "@/lib/social/options"
import { Refusal } from "@/server/browser/refusal"
import { testAndRecordProxy } from "@/server/browser/proxies"
import { promoProxies } from "@/server/browser/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { callPhone, type PhoneTarget } from "./dispatch"
import { phoneWords } from "./health"
import { recordPhoneEvent } from "./history"
import { clearProblem, raiseProblem } from "./notices"
import { queuePhoneAction } from "./queue"
import { promoPhoneReadings, promoPhones } from "./schema"

/**
 * A phone's setup check and what the platform sees (part 23 of the phone
 * farm), and the Wi-Fi phone's address guard (part 28).
 *
 * The rack reads the facts off the phone; `src/lib/phones/setup-check.ts`
 * turns them into lines. The check is saved on the phone, a line goes in its
 * history, and a passing check after a wipe is what lets the phone take an
 * account again (`wipe.ts`).
 *
 * A Wi-Fi phone goes out through a static residential proxy, forced by a
 * VPN-style app on the phone. Before every job on one, the rack reads the
 * address apps see and Promo tests the proxy at the same moment. The house's
 * address, or any address that is not the proxy's, stops every job on the
 * phone and rings the bell, until a check finds the proxy's address again.
 */

/** Reading the Play Store and opening a browser page on the phone take a while. */
const SETUP_TIMEOUT_SECONDS = 240
const ADDRESS_TIMEOUT_MS = 90_000

type PhoneRow = typeof promoPhones.$inferSelect

function phoneHref(phoneId: string): string {
  return `/admin/phones?open=${encodeURIComponent(phoneId)}`
}

/** Asks the rack for a setup check, from Check now in the phone's window. */
export function queueSetupCheck(
  userId: string,
  phoneId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string> {
  return queuePhoneAction(userId, phoneId, "phone/setup-check", db, now, { timeoutSeconds: SETUP_TIMEOUT_SECONDS })
}

/** The proxy a Wi-Fi phone goes out through, with the address its last test saw. */
async function proxyOf(phone: PhoneRow, db: CustomShellDb) {
  if (phone.connection !== "wifi" || !phone.proxyId) return null
  const [proxy] = await db.select().from(promoProxies).where(eq(promoProxies.id, phone.proxyId)).limit(1)
  return proxy ?? null
}

/**
 * Saves the rack's answer to a setup check. The battery line is read from
 * the last day's readings, because a charging limit shows in what the
 * battery does, whatever each maker calls the setting.
 */
export async function recordSetupCheck(
  userId: string,
  phoneId: string,
  result: Record<string, unknown> | null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<SetupCheck | null> {
  const [phone] = await db
    .select()
    .from(promoPhones)
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .limit(1)
  if (!phone) return null
  const facts = readSetupFacts(result)
  const proxy = await proxyOf(phone, db)
  // Tested now, so the address the phone saw is compared with the proxy's
  // at the same moment, never with an old test.
  const tested = proxy ? await testAndRecordProxy(proxy, db) : null
  const [battery] = await db
    .select({ highest: max(promoPhoneReadings.batteryPercent), readings: count() })
    .from(promoPhoneReadings)
    .where(and(eq(promoPhoneReadings.phoneId, phoneId), gte(promoPhoneReadings.at, new Date(now.getTime() - 86_400_000))))
  const check = buildSetupCheck(
    facts,
    {
      kind: phone.kind,
      connection: phone.connection,
      proxy: proxyReference(proxy, tested),
      battery: { highest: battery?.highest ?? null, readings: Number(battery?.readings ?? 0) },
    },
    now
  )
  await db
    .update(promoPhones)
    .set({ setupCheck: check, setupCheckedAt: now })
    .where(eq(promoPhones.id, phoneId))
  const failing = check.lines.filter((line) => line.verdict !== "passes")
  await recordPhoneEvent(
    userId,
    phoneId,
    "setup_checked",
    check.passed
      ? "Every line passed."
      : `${failing.length} of ${check.lines.length} lines did not pass: ${failing.map((line) => line.label).join(", ")}.`,
    db,
    now
  )
  if (phone.connection === "wifi") {
    await judgeAddress(userId, phone, facts.outside, facts.home, proxyReference(proxy, tested), db, now)
  } else {
    // Now a SIM phone: the Wi-Fi address stop no longer applies.
    await liftAddressStop(userId, phone, "it goes out over its SIM now", db, now)
  }
  return check
}

/** The proxy as the address checks compare with it: its name, the address its test saw, and its country. */
function proxyReference(proxy: typeof promoProxies.$inferSelect | null, tested: ProxyTestResult | null) {
  if (!proxy) return null
  return {
    name: proxy.label || proxy.host,
    ip: tested?.ok ? (tested.ip ?? "") : "",
    country: proxy.country || tested?.country || "",
  }
}

/** Lets a phone stopped for the wrong address take jobs again, and takes its notice away. */
async function liftAddressStop(
  userId: string,
  phone: PhoneRow,
  why: string,
  db: CustomShellDb,
  now: Date
): Promise<void> {
  if (!phone.addressStopAt) return
  await db.update(promoPhones).set({ addressStopAt: null, addressStopWords: "" }).where(eq(promoPhones.id, phone.id))
  await clearProblem(userId, "phone_address", phone.id, { phoneId: phone.id, kind: "notice_cleared", detail: `Wrong address: ${why}.` }, db, now)
}

/**
 * Stops a Wi-Fi phone showing the wrong address, or lets it run again when
 * the right one shows. An address that could not be read changes nothing.
 * Returns the verdict's words when the phone is stopped.
 */
async function judgeAddress(
  userId: string,
  phone: PhoneRow,
  seen: OutsideReading,
  home: OutsideReading,
  proxy: { name: string; ip: string; country: string } | null,
  db: CustomShellDb,
  now: Date
): Promise<string | null> {
  const verdict = addressVerdict(seen.ip, home.ip, { connection: "wifi", proxy })
  if (verdict.ok === null) return null
  if (verdict.ok) {
    await liftAddressStop(userId, phone, verdict.words.replace(/\.$/, ""), db, now)
    return null
  }
  await db
    .update(promoPhones)
    .set({ addressStopAt: phone.addressStopAt ?? now, addressStopWords: verdict.words.slice(0, 500) })
    .where(eq(promoPhones.id, phone.id))
  await raiseProblem(
    userId,
    {
      kind: "phone_address",
      targetId: phone.id,
      message: `Wrong address showing: ${phoneWords(phone)}`,
      detail: `${verdict.words} Every job on it is refused until a check finds the proxy's address. Turn the proxy app on the phone back on, then run its setup check from its window on the Phones dashboard.`,
      href: phoneHref(phone.id),
    },
    { phoneId: phone.id, kind: "notice_raised", detail: `Wrong address: ${verdict.words}` },
    db,
    now
  )
  return verdict.words
}

/**
 * Before a job on a phone: refused while the phone is stopped for showing
 * the wrong address, and on a Wi-Fi phone, the address apps see is read now
 * and compared with the proxy tested at the same moment. Anything but the
 * proxy's address refuses the job and stops the phone; an address that
 * could not be read refuses this job only. A refusal is final, so a comment
 * is never tried again.
 */
export async function guardPhoneAddress(
  userId: string,
  phoneId: string,
  target: PhoneTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [phone] = await db
    .select()
    .from(promoPhones)
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .limit(1)
  if (!phone) return
  // A phone switched from Wi-Fi to its SIM is not held to the Wi-Fi rule.
  if (phone.addressStopAt && phone.connection !== "wifi") {
    await liftAddressStop(userId, phone, "it goes out over its SIM now", db, now)
    return
  }
  if (phone.addressStopAt) {
    throw new Refusal(
      `${phone.name} was stopped for showing the wrong address: ${phone.addressStopWords} Nothing was sent. Run its setup check from its window on the Phones dashboard once the proxy app is on.`
    )
  }
  if (phone.connection !== "wifi") return
  const proxy = await proxyOf(phone, db)
  if (!proxy) {
    throw new Refusal(
      `${phone.name} is on the house Wi-Fi with no proxy, so apps would see the house's address. Nothing was sent. Pick its proxy on the Phones dashboard.`
    )
  }

  const [answer, tested] = await Promise.all([
    callPhone(target, "phone/outside-address", {}, ADDRESS_TIMEOUT_MS),
    testAndRecordProxy(proxy, db),
  ])
  const read = (answer ?? {}) as Record<string, unknown>
  const facts = readSetupFacts({ outside: read.phone, home: read.home })
  if (!facts.outside.ip) {
    throw new Refusal(
      `The address apps see on ${phone.name} could not be read${facts.outside.error ? ` (${facts.outside.error.replace(/\.$/, "")})` : ""}, so nothing was sent.`
    )
  }
  const stopped = await judgeAddress(
    userId,
    phone,
    facts.outside,
    facts.home,
    proxyReference(proxy, tested),
    db,
    now
  )
  if (stopped) throw new Refusal(`${stopped} Nothing was sent, and every job on ${phone.name} is refused until a check finds the proxy's address.`)
  if (!tested.ok) {
    throw new Refusal(
      `The proxy ${proxy.label || proxy.host} did not answer its own test (${(tested.error ?? "no answer").replace(/\.$/, "")}), so the address apps see on ${phone.name} could not be checked. Nothing was sent.`
    )
  }
}
