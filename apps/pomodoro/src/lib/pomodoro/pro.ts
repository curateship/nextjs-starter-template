import type { PlanFeatures } from "@/lib/billing/plan-features"

/**
 * The Pro perks, as one browser-safe list: what each one is called, the
 * plan-feature key that unlocks it, and the sentence a locked control shows
 * (the shell's disabled-reason pattern — never a dead button).
 */

export const PRO_PERKS = {
  hostRooms: {
    key: "hostRooms",
    label: "Host focus rooms",
    lockedReason: "Hosting rooms is a Pro perk. Upgrade to open your own room.",
  },
  premiumMedia: {
    key: "premiumMedia",
    label: "Premium sounds and scenes",
    lockedReason:
      "Premium sounds and scenes are a Pro perk. Upgrade to use them.",
  },
  uploadMedia: {
    key: "uploadMedia",
    label: "Upload your own media",
    lockedReason:
      "Uploading your own backgrounds and sounds is a Pro perk. Upgrade to add yours.",
  },
  longRangeReports: {
    key: "longRangeReports",
    label: "Long history ranges",
    lockedReason:
      "History beyond two weeks is a Pro perk. Upgrade to see the long ranges.",
  },
  aiCredits: {
    key: "aiCredits",
    label: "AI credits",
    lockedReason:
      "AI generation is a Pro perk. Upgrade to get monthly credits.",
  },
} as const

export type ProPerk = keyof typeof PRO_PERKS

/** The old app's Pro numbers, used when a plan does not name its own. */
export const PAID_DEFAULTS = {
  storageLimitBytes: 2 * 1024 * 1024 * 1024,
  monthlyBackgrounds: 5,
  monthlySoundscapes: 20,
} as const

/**
 * Whether a plan's feature record unlocks a perk. An explicit value on the
 * plan wins, so a perk can be granted on a free plan or withheld from a paid
 * one, and a missing key falls back to the old app's contract: a paid plan
 * unlocks everything, a free one nothing. The server's entitlements and the
 * plans page both read this, so a card never promises what the app refuses.
 */
export function planPerkAllowed(
  features: PlanFeatures,
  isPaid: boolean,
  perk: ProPerk
) {
  const value = features[PRO_PERKS[perk].key]
  if (value === undefined) return isPaid
  return value !== false && value !== null && value !== 0 && value !== ""
}

/** A plan's own number for a limit, or the paid default, or nothing. */
export function planNumber(
  features: PlanFeatures,
  isPaid: boolean,
  key: keyof typeof PAID_DEFAULTS
) {
  const value = features[key]
  if (typeof value === "number" && Number.isFinite(value) && value >= 0)
    return value
  return isPaid ? PAID_DEFAULTS[key] : 0
}

/** What the app can and cannot do for one account, resolved server-side. */
export type PomodoroEntitlements = {
  plan: string
  isPaid: boolean
  canHostRooms: boolean
  canUsePremiumMedia: boolean
  canUploadMedia: boolean
  canUseLongRangeReports: boolean
  storageLimitBytes: number
  monthlyBackgrounds: number
  monthlySoundscapes: number
}
