import { and, asc, desc, eq, gte, isNull } from "drizzle-orm"

import {
  APP_WORDS,
  PHONE_KINDS,
  PHONE_KIND_WORDS,
  PHONE_STALE_MS,
  SELF_TEST_GAP_MS,
  TRACKED_APPS,
  actionWords,
  storeWords,
  type PhoneKind,
  type RolloutStatus,
  type TrackedApp,
} from "@/lib/phones/options"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { ringBell } from "@/server/social/notices"
import { promoMediumFinds } from "@/server/social/medium/schema"
import { promoAccounts, promoFinds } from "@/server/social/schema"

import { brokenActionTarget } from "./action-checks"
import { phoneWords } from "./health"
import { clearProblem } from "./notices"
import { queuePhoneAction } from "./queue"
import { promoAppRollouts, promoPhoneActionChecks, promoPhones, promoPhoneSettings, promoRacks } from "./schema"

/**
 * The daily self-test (part 20 of the phone farm) and app updates one phone
 * at a time (part 21).
 *
 * Once a day the rack walks every app action it knows on the test phone, up
 * to just before the last button (Post, Send, Share), which it never
 * presses: the rack's walk refuses to (`Walk.final` in `rack/promo_rack.py`).
 * A step that cannot find its button marks that action broken, rings the
 * bell, and jobs for it are refused until it passes again.
 *
 * The test phone is a spare phone signed into a test account and never a
 * real account's phone (Tyler, 14 Oct 2026), so a rehearsal never adds odd
 * activity to an account that matters. The same day, the rack looks in the
 * Play Store on it for app updates and presses nothing. When one is out,
 * Tyler puts it on the test phone first; the self-test runs on the new
 * version; only once it passes can the other phones update.
 *
 * There is one test phone per kind of phone (Tyler, 18 Oct 2026: a spare
 * iPhone is bought as the iPhone test phone). The self-test's answers and the
 * app rollouts are kept per kind, so a step broken on an iPhone refuses
 * iPhone jobs only and leaves the Androids running; an iPhone's updates come
 * through the App Store the same way the Androids' come through the Play
 * Store.
 */

const UPDATE_SECONDS = 600

/**
 * The self-test's own time limit. It walks Reddit's, Instagram's and
 * TikTok's steps one after another, about twenty rehearsals since phone farm
 * file 06, each a few screens and up to a minute.
 */
const SELF_TEST_SECONDS = 1_800

/** The self-test walks a comment on a post found in the last week, so it rehearses on a live thread. */
const REHEARSAL_POST_DAYS = 7

/**
 * What the rehearsals walk: the comment rehearsal opens a post found in the
 * last week, up to its Post button, which it never presses. With no post
 * found lately, the rack opens the first post of the test account's feed.
 * The Medium response rehearsal opens a story found in the last week the
 * same way, up to Respond; with none, it only opens the app.
 */
async function rehearsalArgs(userId: string, db: CustomShellDb, now: Date): Promise<Record<string, unknown>> {
  const since = new Date(now.getTime() - REHEARSAL_POST_DAYS * 86_400_000)
  const [find] = await db
    .select({ permalink: promoFinds.permalink, subreddit: promoFinds.subreddit })
    .from(promoFinds)
    .where(and(eq(promoFinds.userId, userId), gte(promoFinds.firstSeenAt, since)))
    .orderBy(desc(promoFinds.firstSeenAt))
    .limit(1)
  const [story] = await db
    .select({ storyId: promoMediumFinds.storyId })
    .from(promoMediumFinds)
    .where(and(eq(promoMediumFinds.userId, userId), gte(promoMediumFinds.firstSeenAt, since)))
    .orderBy(desc(promoMediumFinds.firstSeenAt))
    .limit(1)
  const rehearsals: Record<string, Record<string, unknown>> = {}
  if (find) rehearsals["reddit/comment"] = { permalink: find.permalink, subreddit: find.subreddit, text: "" }
  if (story) rehearsals["medium/respond"] = { storyId: story.storyId, text: "", line: "", tags: [] }
  return Object.keys(rehearsals).length ? { rehearsals } : {}
}

type SettingsRow = {
  testPhoneId: string | null
  testPhoneIphoneId: string | null
  selfTestAt: Date | null
  selfTestIphoneAt: Date | null
  pausedAt: Date | null
}

async function settingsRow(db: CustomShellDb): Promise<SettingsRow> {
  const [row] = await db
    .select({
      testPhoneId: promoPhoneSettings.testPhoneId,
      testPhoneIphoneId: promoPhoneSettings.testPhoneIphoneId,
      selfTestAt: promoPhoneSettings.selfTestAt,
      selfTestIphoneAt: promoPhoneSettings.selfTestIphoneAt,
      pausedAt: promoPhoneSettings.pausedAt,
    })
    .from(promoPhoneSettings)
    .where(eq(promoPhoneSettings.id, "default"))
    .limit(1)
  return row ?? { testPhoneId: null, testPhoneIphoneId: null, selfTestAt: null, selfTestIphoneAt: null, pausedAt: null }
}

/** Each kind's slot on the settings row: its test phone and when its self-test was last asked for. */
function slot(settings: SettingsRow, kind: PhoneKind): { phoneId: string | null; askedAt: Date | null } {
  return kind === "iphone"
    ? { phoneId: settings.testPhoneIphoneId, askedAt: settings.selfTestIphoneAt }
    : { phoneId: settings.testPhoneId, askedAt: settings.selfTestAt }
}

/** The kind a phone is the test phone of, or null when it is neither. */
function testKindOf(settings: SettingsRow, phoneId: string): PhoneKind | null {
  if (settings.testPhoneId === phoneId) return "android"
  if (settings.testPhoneIphoneId === phoneId) return "iphone"
  return null
}

async function markAsked(kind: PhoneKind, db: CustomShellDb, now: Date): Promise<void> {
  await db
    .update(promoPhoneSettings)
    .set(kind === "iphone" ? { selfTestIphoneAt: now } : { selfTestAt: now })
    .where(eq(promoPhoneSettings.id, "default"))
}

/** "Pick a self-test iPhone in Settings → Phones first." */
function noTestPhone(kind: PhoneKind): Error {
  return new Error(`Pick a self-test ${kind === "iphone" ? "iPhone" : "phone"} in Settings → Phones first.`)
}

/**
 * Picks the test phone of one kind, or none. A phone with an account on it
 * is refused: the test phone carries only its own test account, which Promo
 * does not run jobs for. A phone of the other kind is refused too, since
 * each kind's self-test rehearses that kind's screens.
 */
export async function setTestPhone(
  userId: string,
  phoneId: string | null,
  kind: PhoneKind,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (phoneId) {
    const [phone] = await db
      .select({ id: promoPhones.id, kind: promoPhones.kind })
      .from(promoPhones)
      .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
      .limit(1)
    if (!phone) throw new Error("That phone does not exist.")
    if (phone.kind !== kind) {
      throw new Error(
        `That phone is an ${PHONE_KIND_WORDS[phone.kind]}, and this slot is for the ${PHONE_KIND_WORDS[kind]} self-test. Pick it in the other slot.`
      )
    }
    const accounts = await db
      .select({ handle: promoAccounts.handle, platform: promoAccounts.platform })
      .from(promoAccounts)
      .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.phoneId, phoneId)))
    const [incoming] = await db
      .select({ handle: promoAccounts.handle })
      .from(promoAccounts)
      .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.movingToPhoneId, phoneId), isNull(promoAccounts.retiredAt)))
      .limit(1)
    if (incoming) {
      throw new Error(
        `u/${incoming.handle} is being moved onto that phone. The self-test phone must be a spare one with only its test account; cancel the move first.`
      )
    }
    if (accounts.length) {
      const names = accounts.map((account) => (account.platform === "reddit" ? `u/${account.handle}` : account.handle))
      throw new Error(
        `That phone runs ${names.join(", ")}. The self-test phone must be a spare one with only its test account; move the account to another phone first.`
      )
    }
  }
  const set = kind === "iphone" ? { testPhoneIphoneId: phoneId } : { testPhoneId: phoneId }
  await db
    .insert(promoPhoneSettings)
    .values({ id: "default", ...set })
    .onConflictDoUpdate({ target: promoPhoneSettings.id, set: { ...set, updatedAt: new Date() } })
}

/** True when this is a test phone of either kind, which never takes a real account. */
export async function isTestPhone(phoneId: string, db: CustomShellDb = defaultDb): Promise<boolean> {
  return testKindOf(await settingsRow(db), phoneId) !== null
}

/**
 * Asks for the self-test and the store look once a day, on the 15-second
 * ticker, for each kind's test phone on its own clock. Waits while the rack
 * is paused, or that test phone is offline or held, and tries again on a
 * later tick; the other kind's test phone is not held up by it. True when
 * either was asked for.
 */
export async function queueDailySelfTest(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<boolean> {
  const settings = await settingsRow(db)
  if (settings.pausedAt) return false
  let queued = false
  for (const kind of PHONE_KINDS) {
    const { phoneId, askedAt } = slot(settings, kind)
    if (!phoneId) continue
    if (askedAt && now.getTime() - askedAt.getTime() < SELF_TEST_GAP_MS) continue
    const [row] = await db
      .select({ phone: promoPhones, rackSeenAt: promoRacks.seenAt, rackGone: promoRacks.disconnectedAt })
      .from(promoPhones)
      .innerJoin(promoRacks, eq(promoRacks.id, promoPhones.rackId))
      .where(eq(promoPhones.id, phoneId))
      .limit(1)
    if (!row || row.rackGone || row.phone.held || row.phone.adbState !== "device") continue
    const fresh = (at: Date | null) => at !== null && now.getTime() - at.getTime() < PHONE_STALE_MS
    if (!fresh(row.rackSeenAt) || !fresh(row.phone.lastSeenAt)) continue
    await queuePhoneAction(row.phone.userId, row.phone.id, "phone/self-test", db, now, {
      timeoutSeconds: SELF_TEST_SECONDS,
      args: await rehearsalArgs(row.phone.userId, db, now),
    })
    await queuePhoneAction(row.phone.userId, row.phone.id, "phone/check-updates", db, now, { timeoutSeconds: 300 })
    await markAsked(kind, db, now)
    queued = true
  }
  return queued
}

/** The Run it now button: the self-test on one kind's test phone straight away. */
export async function runSelfTestNow(
  userId: string,
  kind: PhoneKind,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const { phoneId } = slot(await settingsRow(db), kind)
  if (!phoneId) throw noTestPhone(kind)
  await queuePhoneAction(userId, phoneId, "phone/self-test", db, now, {
    timeoutSeconds: SELF_TEST_SECONDS,
    args: await rehearsalArgs(userId, db, now),
  })
  // The day's store look goes with it, since this run counts as the day's.
  await queuePhoneAction(userId, phoneId, "phone/check-updates", db, now, { timeoutSeconds: 300 })
  await markAsked(kind, db, now)
}

type SelfTestLine = { action: string; passed: boolean; step: string; error: string }

function selfTestLines(result: Record<string, unknown> | null): SelfTestLine[] {
  const lines = Array.isArray(result?.actions) ? result.actions : []
  return lines
    .filter((line): line is Record<string, unknown> => typeof line === "object" && line !== null)
    .map((line) => ({
      action: String(line.action ?? "").slice(0, 60),
      passed: line.passed === true,
      step: String(line.step ?? "").slice(0, 200),
      error: String(line.error ?? "").slice(0, 1_000),
    }))
    .filter((line) => line.action)
}

/**
 * Writes the self-test's answer for the kind of phone that ran it: each
 * action passed or broken, the bell for each broken one, the bell taken away
 * for each that passes again, and an update on trial on that kind's test
 * phone passed or failed.
 */
export async function recordSelfTest(
  userId: string,
  phoneId: string,
  actionId: string,
  result: Record<string, unknown> | null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const lines = selfTestLines(result)
  const [phone] = await db
    .select({ name: promoPhones.name, shelfSlot: promoPhones.shelfSlot, kind: promoPhones.kind })
    .from(promoPhones)
    .where(eq(promoPhones.id, phoneId))
    .limit(1)
  if (!phone) throw new Error("That phone does not exist.")
  const kind = phone.kind
  for (const line of lines) {
    const values = {
      passed: line.passed,
      step: line.passed ? "" : line.step,
      error: line.passed ? "" : line.error,
      phoneActionId: actionId,
      checkedAt: now,
    }
    await db
      .insert(promoPhoneActionChecks)
      .values({ userId, action: line.action, kind, ...values })
      .onConflictDoUpdate({
        target: [promoPhoneActionChecks.userId, promoPhoneActionChecks.action, promoPhoneActionChecks.kind],
        set: values,
      })
    if (line.passed) {
      await clearProblem(userId, "action_broken", brokenActionTarget(userId, line.action, kind), null, db, now)
      continue
    }
    await ringBell(
      userId,
      {
        kind: "action_broken",
        // The person is in it, because an action's name is the same for everyone.
        targetId: brokenActionTarget(userId, line.action, kind),
        message: `Self-test failed${kind === "iphone" ? " on iPhone" : ""}: ${actionWords(line.action)}`,
        detail: [
          `It stopped at "${line.step || "the first step"}"${line.error ? `: ${line.error.replace(/\.$/, "")}` : ""}.`,
          "Jobs that need it are refused until the self-test passes again.",
          phone ? `The picture of where it stopped is on the Actions tab of ${phoneWords(phone)}.` : "",
        ]
          .filter(Boolean)
          .join(" "),
        href: `/admin/phones?open=${encodeURIComponent(phoneId)}`,
      },
      db,
      now
    )
  }

  // An update on trial passes only when every action the rack walked passed.
  const allPassed = lines.length > 0 && lines.every((line) => line.passed)
  const broken = lines.filter((line) => !line.passed).map((line) => actionWords(line.action))
  const trials = await db
    .select()
    .from(promoAppRollouts)
    .where(and(eq(promoAppRollouts.userId, userId), eq(promoAppRollouts.kind, kind), eq(promoAppRollouts.status, "testing")))
  for (const trial of trials) {
    await setRollout(
      userId,
      trial.app,
      kind,
      allPassed ? "passed" : "failed",
      {
        note: allPassed
          ? ""
          : broken.length
            ? `The self-test on the new version failed: ${broken.join(", ")}.`
            : "The self-test came back with nothing walked.",
      },
      db,
      now
    )
  }
}

async function setRollout(
  userId: string,
  app: TrackedApp,
  kind: PhoneKind,
  status: RolloutStatus,
  values: { fromVersion?: string; toVersion?: string; note?: string },
  db: CustomShellDb,
  now: Date
): Promise<void> {
  const set = { status, changedAt: now, ...values }
  await db
    .insert(promoAppRollouts)
    .values({ userId, app, kind, ...set })
    .onConflictDoUpdate({ target: [promoAppRollouts.userId, promoAppRollouts.app, promoAppRollouts.kind], set })
}

async function rollout(userId: string, app: TrackedApp, kind: PhoneKind, db: CustomShellDb) {
  const [row] = await db
    .select()
    .from(promoAppRollouts)
    .where(and(eq(promoAppRollouts.userId, userId), eq(promoAppRollouts.app, app), eq(promoAppRollouts.kind, kind)))
    .limit(1)
  return row ?? null
}

/** The bell's id for an update, one per app per kind; the Android one keeps its first shape. */
function updateTarget(userId: string, app: TrackedApp, kind: PhoneKind): string {
  return kind === "iphone" ? `${userId}:${app}:iphone` : `${userId}:${app}`
}

/**
 * The store look's answer, from the Play Store on the Android test phone or
 * the App Store on the iPhone test phone. An app whose page shows Update
 * starts a new round for that kind, unless one is already going or the last
 * one failed (its Update button tries again), and rings the bell once for it.
 */
export async function recordStoreCheck(
  userId: string,
  phoneId: string,
  result: Record<string, unknown> | null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [phone] = await db.select({ kind: promoPhones.kind }).from(promoPhones).where(eq(promoPhones.id, phoneId)).limit(1)
  if (!phone) throw new Error("That phone does not exist.")
  const kind = phone.kind
  const apps = (result?.apps ?? {}) as Record<string, { version?: unknown; update?: unknown } | undefined>
  for (const app of TRACKED_APPS) {
    const seen = apps[app]
    if (!seen || seen.update !== true) continue
    const current = await rollout(userId, app, kind, db)
    if (current && current.status !== "passed") continue
    await setRollout(userId, app, kind, "available", { fromVersion: String(seen.version ?? "").slice(0, 60), toVersion: "", note: "" }, db, now)
    await ringBell(
      userId,
      {
        kind: "app_update",
        targetId: updateTarget(userId, app, kind),
        message: `App update out: ${APP_WORDS[app]}${kind === "iphone" ? " on iPhone" : ""}`,
        detail: `${storeWords(kind).replace(/^the/, "The")} has a newer ${APP_WORDS[app]} than ${String(seen.version ?? `the one on the ${PHONE_KIND_WORDS[kind]} test phone`)}. Put it on the ${PHONE_KIND_WORDS[kind]} test phone first from Self-test on the Phones dashboard; the other ${PHONE_KIND_WORDS[kind]}s can follow once it passes.`,
        href: "/admin/phones",
      },
      db,
      now
    )
  }
}

/** The Update button for one kind's test phone: starts that kind's round. */
export async function updateTestPhone(
  userId: string,
  app: TrackedApp,
  kind: PhoneKind,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const { phoneId } = slot(await settingsRow(db), kind)
  if (!phoneId) throw noTestPhone(kind)
  const current = await rollout(userId, app, kind, db)
  if (current?.status === "updating" || current?.status === "testing") {
    throw new Error(`${APP_WORDS[app]} is already being tried on the ${PHONE_KIND_WORDS[kind]} test phone.`)
  }
  const [phone] = await db
    .select({ apps: promoPhones.apps })
    .from(promoPhones)
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .limit(1)
  if (!phone?.apps[app]) throw new Error(`${APP_WORDS[app]} is not on the ${PHONE_KIND_WORDS[kind]} test phone.`)
  await queuePhoneAction(userId, phoneId, "phone/update-app", db, now, { args: { app }, timeoutSeconds: UPDATE_SECONDS })
  await setRollout(userId, app, kind, "updating", { fromVersion: phone.apps[app], toVersion: "", note: "" }, db, now)
}

/**
 * An update finished on a phone. On a test phone, during its kind's round,
 * it moves the round on: the self-test runs on the new version, or the round
 * fails. An update on any other phone changes no round.
 */
export async function recordAppUpdate(
  userId: string,
  phoneId: string,
  args: Record<string, unknown>,
  outcome: { ok: boolean; result: Record<string, unknown> | null; error: string },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const app = String(args.app ?? "") as TrackedApp
  if (!TRACKED_APPS.includes(app)) return
  const kind = testKindOf(await settingsRow(db), phoneId)
  if (!kind) return
  const current = await rollout(userId, app, kind, db)
  if (current?.status !== "updating") return
  if (!outcome.ok) {
    await setRollout(userId, app, kind, "failed", { note: outcome.error || "The update did not finish." }, db, now)
    return
  }
  const toVersion = String(outcome.result?.to ?? "").slice(0, 60)
  if (!toVersion) {
    // Without the new version, "the others" could not be told from the updated.
    await setRollout(userId, app, kind, "failed", { note: "The rack did not say which version it updated to." }, db, now)
    return
  }
  await setRollout(userId, app, kind, "testing", { toVersion }, db, now)
  try {
    await queuePhoneAction(userId, phoneId, "phone/self-test", db, now, {
      timeoutSeconds: SELF_TEST_SECONDS,
      args: await rehearsalArgs(userId, db, now),
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await setRollout(userId, app, kind, "failed", { note: `The self-test could not start: ${reason}` }, db, now)
  }
}

/**
 * The button that puts a passed update on every other phone of that kind
 * with the app, one action per phone. Refused until that kind's test phone
 * passed the self-test on the new version. A phone that is offline or held
 * is skipped and named.
 */
export async function updateOtherPhones(
  userId: string,
  app: TrackedApp,
  kind: PhoneKind,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ queued: string[]; skipped: string[] }> {
  const current = await rollout(userId, app, kind, db)
  if (current?.status !== "passed") {
    throw new Error(
      `The ${PHONE_KIND_WORDS[kind]} test phone has to pass the self-test on the new ${APP_WORDS[app]} before the other ${PHONE_KIND_WORDS[kind]}s update. Put it on the test phone first.`
    )
  }
  const { phoneId: testPhoneId } = slot(await settingsRow(db), kind)
  const phones = await db
    .select({ id: promoPhones.id, name: promoPhones.name, apps: promoPhones.apps })
    .from(promoPhones)
    .where(and(eq(promoPhones.userId, userId), eq(promoPhones.kind, kind)))
    .orderBy(asc(promoPhones.name))
  const queued: string[] = []
  const skipped: string[] = []
  for (const phone of phones) {
    const version = phone.apps[app]
    if (phone.id === testPhoneId || !version || version === current.toVersion) continue
    try {
      await queuePhoneAction(userId, phone.id, "phone/update-app", db, now, { args: { app }, timeoutSeconds: UPDATE_SECONDS })
      queued.push(phone.name)
    } catch {
      skipped.push(phone.name)
    }
  }
  return { queued, skipped }
}

/** One kind's side of the Self-test window: its test phone, its answers and its rollouts. */
export type SelfTestKindPage = {
  testPhone: { id: string; name: string } | null
  lastAskedAt: Date | null
  checks: Array<{ action: string; passed: boolean; step: string; error: string; checkedAt: Date; phoneActionId: string | null }>
  rollouts: Array<{ app: TrackedApp; status: RolloutStatus; fromVersion: string; toVersion: string; note: string; changedAt: Date }>
}

export type SelfTestPage = Record<PhoneKind, SelfTestKindPage>

/** What the Self-test window shows, one side per kind of phone. Each phone's versions come with the phone list. */
export async function selfTestPage(userId: string, db: CustomShellDb = defaultDb): Promise<SelfTestPage> {
  const settings = await settingsRow(db)
  const checks = await db
    .select()
    .from(promoPhoneActionChecks)
    .where(eq(promoPhoneActionChecks.userId, userId))
    .orderBy(asc(promoPhoneActionChecks.action))
  const rollouts = await db
    .select()
    .from(promoAppRollouts)
    .where(eq(promoAppRollouts.userId, userId))
    .orderBy(asc(promoAppRollouts.app))
  const pages = {} as SelfTestPage
  for (const kind of PHONE_KINDS) {
    const { phoneId, askedAt } = slot(settings, kind)
    const [testPhone] = phoneId
      ? await db
          .select({ id: promoPhones.id, name: promoPhones.name })
          .from(promoPhones)
          .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
          .limit(1)
      : []
    pages[kind] = {
      testPhone: testPhone ?? null,
      lastAskedAt: askedAt,
      checks: checks
        .filter((check) => check.kind === kind)
        .map(({ action, passed, step, error, checkedAt, phoneActionId }) => ({ action, passed, step, error, checkedAt, phoneActionId })),
      rollouts: rollouts
        .filter((rollout) => rollout.kind === kind)
        .map(({ app, status, fromVersion, toVersion, note, changedAt }) => ({ app, status, fromVersion, toVersion, note, changedAt })),
    }
  }
  return pages
}
