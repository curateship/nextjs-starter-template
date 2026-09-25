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
