import { eq } from "drizzle-orm"

import {
  loadEntitlements,
  type Entitlements,
} from "@/server/billing/entitlements"
import { db, type CustomShellDb } from "@/server/db"
import { customShellUsers } from "@/server/schema"
import {
  PRO_PERKS,
  type PomodoroEntitlements,
  type ProPerk,
} from "@/lib/pomodoro/pro"

/**
 * The one module that answers every can-do question about Pro perks.
 * Nothing else in the app reads plan or subscription rows.
 *
 * It builds on the shell's billing: plans, checkout, the portal and the
 * webhooks all stay the shell's, and a plan's free-form feature record is
 * where the perks live. The rule per perk: an explicit value on the plan
 * wins (so a perk can be granted on a free plan or withheld from a paid
 * one), and a missing key falls back to the old app's contract — a paid
 * plan unlocks everything, a free one nothing.
 */

function perkAllowed(entitlements: Entitlements, perk: ProPerk): boolean {
  const value = entitlements.features[PRO_PERKS[perk].key]
  if (value === undefined) return entitlements.isPaid
  return value !== false && value !== null && value !== 0 && value !== ""
}

/** The old app's Pro numbers, used when a plan does not name its own. */
const PAID_DEFAULTS = {
  storageLimitBytes: 2 * 1024 * 1024 * 1024,
  monthlyBackgrounds: 5,
  monthlySoundscapes: 20,
} as const

function numericFeature(
  entitlements: Entitlements,
  key: keyof typeof PAID_DEFAULTS
): number {
  const value = entitlements.features[key]
  if (typeof value === "number" && Number.isFinite(value) && value >= 0)
    return value
  return entitlements.isPaid ? PAID_DEFAULTS[key] : 0
}

/**
 * `admin` is the one thing outside the plan that can turn a perk on.
 *
 * An operator of the deployment is not a customer of it, so they are never
 * asked to buy their own product to host a room or upload a background. An
 * admin reads as paid, and nothing else about them changes: their plan's own
 * feature record still applies on top, so a plan that hands out 100 monthly
 * backgrounds still hands the admin 100 rather than the paid default, and a
 * plan that deliberately switches a perk off still switches it off for
 * whoever is on it. Being an admin answers "have they paid", not "what did
 * they buy".
 */
export function resolvePomodoroEntitlements(
  entitlements: Entitlements,
  { admin = false }: { admin?: boolean } = {}
): PomodoroEntitlements {
  const paidEntitlements = admin
    ? { ...entitlements, isPaid: true }
    : entitlements
  return {
    plan: entitlements.planSlug,
    isPaid: paidEntitlements.isPaid,
    canHostRooms: perkAllowed(paidEntitlements, "hostRooms"),
    canUsePremiumMedia: perkAllowed(paidEntitlements, "premiumMedia"),
    canUploadMedia: perkAllowed(paidEntitlements, "uploadMedia"),
    canUseLongRangeReports: perkAllowed(paidEntitlements, "longRangeReports"),
    storageLimitBytes: numericFeature(paidEntitlements, "storageLimitBytes"),
    monthlyBackgrounds: numericFeature(paidEntitlements, "monthlyBackgrounds"),
    monthlySoundscapes: numericFeature(paidEntitlements, "monthlySoundscapes"),
  }
}

export async function loadPomodoroEntitlements(
  userId: string,
  database: CustomShellDb = db
): Promise<PomodoroEntitlements> {
  const [{ entitlements }, admin] = await Promise.all([
    loadEntitlements(userId, database),
    userIsAdmin(userId, database),
  ])
  return resolvePomodoroEntitlements(entitlements, { admin })
}

async function userIsAdmin(userId: string, database: CustomShellDb) {
  const [row] = await database
    .select({ role: customShellUsers.role })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
    .limit(1)
  return row?.role === "admin"
}

const PERK_FLAGS: Record<
  ProPerk,
  keyof Pick<
    PomodoroEntitlements,
    | "canHostRooms"
    | "canUsePremiumMedia"
    | "canUploadMedia"
    | "canUseLongRangeReports"
    | "isPaid"
  >
> = {
  hostRooms: "canHostRooms",
  premiumMedia: "canUsePremiumMedia",
  uploadMedia: "canUploadMedia",
  longRangeReports: "canUseLongRangeReports",
  aiCredits: "isPaid",
}

/**
 * The one way an endpoint gates a perk. Throws UPGRADE_REQUIRED:<perk> so
 * the client can show that perk's own locked sentence.
 */
export async function requirePomodoroPerk(
  userId: string,
  perk: ProPerk,
  database: CustomShellDb = db
) {
  const entitlements = await loadPomodoroEntitlements(userId, database)
  if (!entitlements[PERK_FLAGS[perk]])
    throw new Error(`UPGRADE_REQUIRED:${perk}`)
  return entitlements
}
