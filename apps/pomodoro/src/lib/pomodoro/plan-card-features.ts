import {
  describePlanFeatures,
  type PlanFeatures,
} from "@/lib/billing/plan-features"
import { formatBytes } from "@/lib/pomodoro/media-limits"
import {
  PAID_DEFAULTS,
  PRO_PERKS,
  SHARED_MEDIA_FEATURE,
  planAllowsSharedMedia,
  planNumber,
  planPerkAllowed,
} from "@/lib/pomodoro/pro"
import type { MediaCatalog } from "@/lib/pomodoro/catalog"

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

/**
 * Every account, signed in or not. The counts come from the Live catalogue,
 * so a sound an admin adds or prices is counted on the next page load.
 */
function freeLines(catalog: MediaCatalog, features: PlanFeatures) {
  const freeSounds = catalog.sounds.filter((sound) => !sound.locked).length
  const freeScenes = catalog.themes.filter((scene) => !scene.locked).length
  return [
    "Pomodoro timer with tasks, steps and projects",
    `${freeSounds} sounds and ${freeScenes} backgrounds`,
    "A personal room with your own sound and theme",
    "Join any open focus room",
    "Leaderboard, private groups and a public profile",
    // Every plan, unless a plan switches it off (task 03, part 10).
    ...(planAllowsSharedMedia(features)
      ? ["Play and save the sounds and backgrounds members share"]
      : []),
    "7 and 30 days of focus history, with CSV export",
  ]
}

/** The feature keys the lines below already speak for. */
const COVERED_KEYS = new Set<string>([
  ...Object.values(PRO_PERKS).map((perk) => perk.key),
  ...Object.keys(PAID_DEFAULTS),
  SHARED_MEDIA_FEATURE,
])

export function planCardFeatures(
  catalog: MediaCatalog,
  features: PlanFeatures,
  free: boolean
): string[] {
  const extra = describePlanFeatures(
    Object.fromEntries(
      Object.entries(features).filter(([key]) => !COVERED_KEYS.has(key))
    )
  )
  if (free) return [...freeLines(catalog, features), ...extra]

  const isPaid = true
  const allowed = (perk: keyof typeof PRO_PERKS) =>
    planPerkAllowed(features, isPaid, perk)
  const soundscapes = planNumber(features, isPaid, "monthlySoundscapes")
  const backgrounds = planNumber(features, isPaid, "monthlyBackgrounds")
  const storage = planNumber(features, isPaid, "storageLimitBytes")

  const lines: string[] = []
  if (allowed("premiumMedia"))
    lines.push(
      `All ${catalog.sounds.length} sounds and ${catalog.themes.length} backgrounds, including the Pro ones`
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
