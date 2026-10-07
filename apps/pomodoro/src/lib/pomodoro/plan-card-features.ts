import {
  describePlanFeatures,
  type PlanFeatures,
} from "@/lib/billing/plan-features"
import { curatedBackgrounds } from "@/lib/pomodoro/background-catalog"
import { formatBytes } from "@/lib/pomodoro/media-limits"
import {
  PAID_DEFAULTS,
  PRO_PERKS,
  planNumber,
  planPerkAllowed,
} from "@/lib/pomodoro/pro"
import { curatedSounds } from "@/lib/pomodoro/sound-catalog"

/**
 * The ticked lines on the plans page's cards, written from what the app
 * actually does rather than typed into Settings → Plans by hand.
 *
 * The Free card lists what every account gets. A paid card lists only the
 * perks its plan really unlocks, read through the same rule the server's
 * entitlements use (`planPerkAllowed`), with the plan's own numbers. So a plan
 * that switches hosting off, or hands out 50 AI backgrounds, says so, and no
 * card can promise what the app then refuses.
 *
 * Anything else on the plan's feature record ("Priority support") follows the
 * app's own lines, worded the shell's way. The keys this file already covers
 * are left out of that, so nothing is said twice.
 */

const freeSounds = curatedSounds.filter((sound) => !sound.locked).length
const freeScenes = curatedBackgrounds.filter((scene) => !scene.locked).length

/** Every account, signed in or not. */
const FREE_LINES = [
  "Pomodoro timer with tasks, steps and projects",
  `${freeSounds} sounds and ${freeScenes} backgrounds`,
  "A personal room with your own sound and theme",
  "Join any open focus room",
  "Leaderboard, private groups and a public profile",
  "7 and 30 days of focus history, with CSV export",
]

/** The feature keys the lines below already speak for. */
const COVERED_KEYS = new Set<string>([
  ...Object.values(PRO_PERKS).map((perk) => perk.key),
  ...Object.keys(PAID_DEFAULTS),
])

export function planCardFeatures(
  features: PlanFeatures,
  free: boolean
): string[] {
  const extra = describePlanFeatures(
    Object.fromEntries(
      Object.entries(features).filter(([key]) => !COVERED_KEYS.has(key))
    )
  )
  if (free) return [...FREE_LINES, ...extra]

  const isPaid = true
  const allowed = (perk: keyof typeof PRO_PERKS) =>
    planPerkAllowed(features, isPaid, perk)
  const soundscapes = planNumber(features, isPaid, "monthlySoundscapes")
  const backgrounds = planNumber(features, isPaid, "monthlyBackgrounds")
  const storage = planNumber(features, isPaid, "storageLimitBytes")

  const lines: string[] = []
  if (allowed("premiumMedia"))
    lines.push(
      `All ${curatedSounds.length} sounds and ${curatedBackgrounds.length} backgrounds, including the Pro ones`
    )
  if (allowed("aiCredits") && soundscapes > 0)
    lines.push(`AI soundscapes, ${soundscapes} a month`)
  if (allowed("aiCredits") && backgrounds > 0)
    lines.push(`AI backgrounds, ${backgrounds} a month`)
  if (allowed("uploadMedia") && storage > 0)
    // "2 GB" rather than the uploads card's "2.0 GB": a round limit reads
    // as one.
    lines.push(
      `Upload your own loops and clips, ${formatBytes(storage).replace(".0 ", " ")}`
    )
  if (allowed("hostRooms"))
    lines.push("Host focus rooms, now or booked for later")
  if (allowed("longRangeReports"))
    lines.push("Focus history over 12 months and the whole year")
  return [...lines, ...extra]
}
