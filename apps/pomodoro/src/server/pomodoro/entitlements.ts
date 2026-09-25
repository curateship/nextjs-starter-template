import {
  loadEntitlements,
  type Entitlements,
} from "@/server/billing/entitlements"
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

export function resolvePomodoroEntitlements(
  entitlements: Entitlements
): PomodoroEntitlements {
  return {
    plan: entitlements.planSlug,
    isPaid: entitlements.isPaid,
    canHostRooms: perkAllowed(entitlements, "hostRooms"),
    canUsePremiumMedia: perkAllowed(entitlements, "premiumMedia"),
    canUploadMedia: perkAllowed(entitlements, "uploadMedia"),
    canUseLongRangeReports: perkAllowed(entitlements, "longRangeReports"),
    storageLimitBytes: numericFeature(entitlements, "storageLimitBytes"),
    monthlyBackgrounds: numericFeature(entitlements, "monthlyBackgrounds"),
    monthlySoundscapes: numericFeature(entitlements, "monthlySoundscapes"),
  }
}

export async function loadPomodoroEntitlements(
  userId: string
): Promise<PomodoroEntitlements> {
  const { entitlements } = await loadEntitlements(userId)
  return resolvePomodoroEntitlements(entitlements)
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
export async function requirePomodoroPerk(userId: string, perk: ProPerk) {
  const entitlements = await loadPomodoroEntitlements(userId)
  if (!entitlements[PERK_FLAGS[perk]])
    throw new Error(`UPGRADE_REQUIRED:${perk}`)
  return entitlements
}
