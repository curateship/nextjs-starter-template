import { and, asc, desc, eq, gte, isNull } from "drizzle-orm"

import {
  APP_WORDS,
  PHONE_STALE_MS,
  SELF_TEST_GAP_MS,
  TRACKED_APPS,
  actionWords,
  type RolloutStatus,
  type TrackedApp,
} from "@/lib/phones/options"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { ringBell } from "@/server/social/notices"
import { promoAccounts, promoFinds } from "@/server/social/schema"

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
 */
async function rehearsalArgs(userId: string, db: CustomShellDb, now: Date): Promise<Record<string, unknown>> {
  const [find] = await db
    .select({ permalink: promoFinds.permalink, subreddit: promoFinds.subreddit })
    .from(promoFinds)
    .where(and(eq(promoFinds.userId, userId), gte(promoFinds.firstSeenAt, new Date(now.getTime() - REHEARSAL_POST_DAYS * 86_400_000))))
    .orderBy(desc(promoFinds.firstSeenAt))
    .limit(1)
  if (!find) return {}
  return { rehearsals: { "reddit/comment": { permalink: find.permalink, subreddit: find.subreddit, text: "" } } }
}

async function settingsRow(db: CustomShellDb) {
  const [row] = await db
    .select({
      testPhoneId: promoPhoneSettings.testPhoneId,
      selfTestAt: promoPhoneSettings.selfTestAt,
      pausedAt: promoPhoneSettings.pausedAt,
    })
    .from(promoPhoneSettings)
    .where(eq(promoPhoneSettings.id, "default"))
    .limit(1)
  return row ?? { testPhoneId: null, selfTestAt: null, pausedAt: null }
}

/**
 * Picks the test phone, or none. A phone with an account on it is refused:
 * the test phone carries only its own test account, which Promo does not
 * run jobs for.
 */
export async function setTestPhone(
  userId: string,
  phoneId: string | null,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (phoneId) {
    const [phone] = await db
      .select({ id: promoPhones.id })
      .from(promoPhones)
      .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
      .limit(1)
    if (!phone) throw new Error("That phone does not exist.")
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
  await db
    .insert(promoPhoneSettings)
    .values({ id: "default", testPhoneId: phoneId })
    .onConflictDoUpdate({ target: promoPhoneSettings.id, set: { testPhoneId: phoneId, updatedAt: new Date() } })
}

/** True when this is the test phone, which never takes a real account. */
export async function isTestPhone(phoneId: string, db: CustomShellDb = defaultDb): Promise<boolean> {
  return (await settingsRow(db)).testPhoneId === phoneId
}

/**
 * Asks for the self-test and the Play Store look once a day, on the 15-second
 * ticker. Waits while the rack is paused, or the test phone is offline or
 * held, and tries again on a later tick.
 */
export async function queueDailySelfTest(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<boolean> {
  const settings = await settingsRow(db)
  if (!settings.testPhoneId || settings.pausedAt) return false
  if (settings.selfTestAt && now.getTime() - settings.selfTestAt.getTime() < SELF_TEST_GAP_MS) return false
  const [row] = await db
    .select({ phone: promoPhones, rackSeenAt: promoRacks.seenAt, rackGone: promoRacks.disconnectedAt })
    .from(promoPhones)
    .innerJoin(promoRacks, eq(promoRacks.id, promoPhones.rackId))
    .where(eq(promoPhones.id, settings.testPhoneId))
    .limit(1)
  if (!row || row.rackGone || row.phone.held || row.phone.adbState !== "device") return false
  const fresh = (at: Date | null) => at !== null && now.getTime() - at.getTime() < PHONE_STALE_MS
  if (!fresh(row.rackSeenAt) || !fresh(row.phone.lastSeenAt)) return false
  await queuePhoneAction(row.phone.userId, row.phone.id, "phone/self-test", db, now, {
    timeoutSeconds: SELF_TEST_SECONDS,
    args: await rehearsalArgs(row.phone.userId, db, now),
  })
  await queuePhoneAction(row.phone.userId, row.phone.id, "phone/check-updates", db, now, { timeoutSeconds: 300 })
  await db.update(promoPhoneSettings).set({ selfTestAt: now }).where(eq(promoPhoneSettings.id, "default"))
  return true
}

/** The Run now button: the self-test on the test phone straight away. */
export async function runSelfTestNow(userId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const { testPhoneId } = await settingsRow(db)
  if (!testPhoneId) throw new Error("Pick a self-test phone in Settings → Phones first.")
  await queuePhoneAction(userId, testPhoneId, "phone/self-test", db, now, {
    timeoutSeconds: SELF_TEST_SECONDS,
    args: await rehearsalArgs(userId, db, now),
  })
  // The day's Play Store look goes with it, since this run counts as the day's.
  await queuePhoneAction(userId, testPhoneId, "phone/check-updates", db, now, { timeoutSeconds: 300 })
  await db.update(promoPhoneSettings).set({ selfTestAt: now }).where(eq(promoPhoneSettings.id, "default"))
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
 * Writes the self-test's answer: each action passed or broken, the bell for
 * each broken one, the bell taken away for each that passes again, and an
 * update on trial on the test phone passed or failed.
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
    .select({ name: promoPhones.name, shelfSlot: promoPhones.shelfSlot })
    .from(promoPhones)
    .where(eq(promoPhones.id, phoneId))
    .limit(1)
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
      .values({ userId, action: line.action, ...values })
      .onConflictDoUpdate({ target: [promoPhoneActionChecks.userId, promoPhoneActionChecks.action], set: values })
    if (line.passed) {
      await clearProblem(userId, "action_broken", `${userId}:${line.action}`, null, db, now)
      continue
    }
    await ringBell(
      userId,
      {
        kind: "action_broken",
        // The person is in it, because an action's name is the same for everyone.
        targetId: `${userId}:${line.action}`,
        message: `Self-test failed: ${actionWords(line.action)}`,
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
    .where(and(eq(promoAppRollouts.userId, userId), eq(promoAppRollouts.status, "testing")))
  for (const trial of trials) {
    await setRollout(
      userId,
      trial.app,
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
  status: RolloutStatus,
  values: { fromVersion?: string; toVersion?: string; note?: string },
  db: CustomShellDb,
  now: Date
): Promise<void> {
  const set = { status, changedAt: now, ...values }
  await db
    .insert(promoAppRollouts)
    .values({ userId, app, ...set })
    .onConflictDoUpdate({ target: [promoAppRollouts.userId, promoAppRollouts.app], set })
}

async function rollout(userId: string, app: TrackedApp, db: CustomShellDb) {
  const [row] = await db
    .select()
    .from(promoAppRollouts)
    .where(and(eq(promoAppRollouts.userId, userId), eq(promoAppRollouts.app, app)))
    .limit(1)
  return row ?? null
}

/**
 * The Play Store look's answer. An app whose page shows Update starts a new
 * round, unless one is already going or the last one failed (its Update
 * button tries again), and rings the bell once for it.
 */
export async function recordStoreCheck(
  userId: string,
  result: Record<string, unknown> | null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const apps = (result?.apps ?? {}) as Record<string, { version?: unknown; update?: unknown } | undefined>
  for (const app of TRACKED_APPS) {
    const seen = apps[app]
    if (!seen || seen.update !== true) continue
    const current = await rollout(userId, app, db)
    if (current && current.status !== "passed") continue
    await setRollout(userId, app, "available", { fromVersion: String(seen.version ?? "").slice(0, 60), toVersion: "", note: "" }, db, now)
    await ringBell(
      userId,
      {
        kind: "app_update",
        targetId: `${userId}:${app}`,
        message: `App update out: ${APP_WORDS[app]}`,
        detail: `The Play Store has a newer ${APP_WORDS[app]} than ${String(seen.version ?? "the one on the test phone")}. Put it on the test phone first from Self-test on the Phones dashboard; the others can follow once it passes.`,
        href: "/admin/phones",
      },
      db,
      now
    )
  }
}

/** The Update button for the test phone: starts the round's first step. */
export async function updateTestPhone(
  userId: string,
  app: TrackedApp,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const { testPhoneId } = await settingsRow(db)
  if (!testPhoneId) throw new Error("Pick a self-test phone in Settings → Phones first.")
  const current = await rollout(userId, app, db)
  if (current?.status === "updating" || current?.status === "testing") {
    throw new Error(`${APP_WORDS[app]} is already being tried on the test phone.`)
  }
  const [phone] = await db
    .select({ apps: promoPhones.apps })
    .from(promoPhones)
    .where(and(eq(promoPhones.id, testPhoneId), eq(promoPhones.userId, userId)))
    .limit(1)
  if (!phone?.apps[app]) throw new Error(`${APP_WORDS[app]} is not on the test phone.`)
  await queuePhoneAction(userId, testPhoneId, "phone/update-app", db, now, { args: { app }, timeoutSeconds: UPDATE_SECONDS })
  await setRollout(userId, app, "updating", { fromVersion: phone.apps[app], toVersion: "", note: "" }, db, now)
}

/**
 * An update finished on a phone. On the test phone, during a round, it moves
 * the round on: the self-test runs on the new version, or the round fails.
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
  const { testPhoneId } = await settingsRow(db)
  const current = await rollout(userId, app, db)
  if (phoneId !== testPhoneId || current?.status !== "updating") return
  if (!outcome.ok) {
    await setRollout(userId, app, "failed", { note: outcome.error || "The update did not finish." }, db, now)
    return
  }
  const toVersion = String(outcome.result?.to ?? "").slice(0, 60)
  if (!toVersion) {
    // Without the new version, "the others" could not be told from the updated.
    await setRollout(userId, app, "failed", { note: "The rack did not say which version it updated to." }, db, now)
    return
  }
  await setRollout(userId, app, "testing", { toVersion }, db, now)
  try {
    await queuePhoneAction(userId, phoneId, "phone/self-test", db, now, {
      timeoutSeconds: SELF_TEST_SECONDS,
      args: await rehearsalArgs(userId, db, now),
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await setRollout(userId, app, "failed", { note: `The self-test could not start: ${reason}` }, db, now)
  }
}

/**
 * The button that puts a passed update on every other phone with the app,
 * one action per phone. Refused until the test phone passed the self-test on
 * the new version. A phone that is offline or held is skipped and named.
 */
export async function updateOtherPhones(
  userId: string,
  app: TrackedApp,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ queued: string[]; skipped: string[] }> {
  const current = await rollout(userId, app, db)
  if (current?.status !== "passed") {
    throw new Error(
      `The test phone has to pass the self-test on the new ${APP_WORDS[app]} before the other phones update. Put it on the test phone first.`
    )
  }
  const { testPhoneId } = await settingsRow(db)
  const phones = await db
    .select({ id: promoPhones.id, name: promoPhones.name, apps: promoPhones.apps })
    .from(promoPhones)
    .where(eq(promoPhones.userId, userId))
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

export type SelfTestPage = {
  testPhone: { id: string; name: string } | null
  lastAskedAt: Date | null
  checks: Array<{ action: string; passed: boolean; step: string; error: string; checkedAt: Date; phoneActionId: string | null }>
  rollouts: Array<{ app: TrackedApp; status: RolloutStatus; fromVersion: string; toVersion: string; note: string; changedAt: Date }>
}

/** What the Self-test window shows. Each phone's versions come with the phone list. */
export async function selfTestPage(userId: string, db: CustomShellDb = defaultDb): Promise<SelfTestPage> {
  const settings = await settingsRow(db)
  const [testPhone] = settings.testPhoneId
    ? await db
        .select({ id: promoPhones.id, name: promoPhones.name })
        .from(promoPhones)
        .where(and(eq(promoPhones.id, settings.testPhoneId), eq(promoPhones.userId, userId)))
        .limit(1)
    : []
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
  return {
    testPhone: testPhone ?? null,
    lastAskedAt: settings.selfTestAt,
    checks: checks.map(({ action, passed, step, error, checkedAt, phoneActionId }) => ({
      action,
      passed,
      step,
      error,
      checkedAt,
      phoneActionId,
    })),
    rollouts: rollouts.map(({ app, status, fromVersion, toVersion, note, changedAt }) => ({
      app,
      status,
      fromVersion,
      toVersion,
      note,
      changedAt,
    })),
  }
}
