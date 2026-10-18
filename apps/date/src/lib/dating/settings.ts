import { z } from "zod"

/**
 * The member's Dating settings: what the AI is told about them and what they
 * want, how it decides, and the limits that keep the account looking like a
 * person. Shown on Settings → App settings → Dating, which saves each change
 * by itself. Tyler's choices, 17 Oct 2026, are the defaults here.
 */

/**
 * The style dial. The member's own example messages set the voice; the dial
 * nudges it one way. "examples" means no nudge.
 */
export const DATING_STYLES = ["examples", "playful", "direct", "dry", "warm"] as const
export type DatingStyle = (typeof DATING_STYLES)[number]

export const DATING_STYLE_WORDS: Record<DatingStyle, string> = {
  examples: "Like my examples, no nudge",
  playful: "A bit more playful",
  direct: "A bit more direct",
  dry: "A bit drier",
  warm: "A bit warmer",
}

export const MAX_EXAMPLES = 5

export const datingSettingsShape = z.object({
  /** Facts about the member the AI may use. It never makes one up. */
  aboutMe: z.string().max(4_000).default(""),
  lookingFor: z.string().max(4_000).default(""),
  dealbreakers: z.string().max(4_000).default(""),
  ageMin: z.number().int().min(18).max(99).default(18),
  ageMax: z.number().int().min(18).max(99).default(99),
  /** Messages the member has sent, three to five, so the AI writes in their voice. */
  examples: z.array(z.string().max(500)).max(MAX_EXAMPLES).default([]),
  style: z.enum(DATING_STYLES).default("examples"),
  /** Like a card scored at this or more, out of 100. */
  likeAbove: z.number().int().min(0).max(100).default(70),
  /** Tyler, 17 Oct 2026: "AI can craft messages and I will send it, but that should be an option if I want it automated later." Off to start with. */
  automate: z.boolean().default(false),
  /** With automate on, a reply goes out this many minutes after their message, drawn at random between the two. */
  replyDelayMin: z.number().int().min(0).max(1_440).default(10),
  replyDelayMax: z.number().int().min(0).max(1_440).default(90),
  swipesPerHour: z.number().int().min(1).max(300).default(60),
  messagesPerHour: z.number().int().min(1).max(100).default(20),
  /** Nothing happens on the phone from this hour to that one, in the phone's own time. Equal hours means no quiet time. */
  quietStart: z.number().int().min(0).max(23).default(1),
  quietEnd: z.number().int().min(0).max(23).default(7),
  /** The AI stops calling once this month's spend reaches this, in dollars. */
  spendCapDollars: z.number().min(0).max(1_000).default(20),
})

export type DatingSettings = z.infer<typeof datingSettingsShape>

export const DEFAULT_DATING_SETTINGS: DatingSettings = datingSettingsShape.parse({})

/** What is wrong with a set of settings as a whole, in words, or null. */
export function datingSettingsProblem(settings: DatingSettings): string | null {
  if (settings.ageMin > settings.ageMax) return "The youngest age is above the oldest. Swap them round."
  if (settings.replyDelayMin > settings.replyDelayMax) return "The shortest reply wait is longer than the longest."
  return null
}
