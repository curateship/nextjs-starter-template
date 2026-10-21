import { z } from "zod"

/**
 * The member's Dating settings: what the AI is told about them and what they
 * want, how it decides, and the limits that keep the account looking like a
 * person. Shown in the Dating settings window, which saves each change
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

/** At most this many people on the People I know list. */
export const MAX_KNOWN_PEOPLE = 200

/** Someone the member knows, passed without an AI call when a card has this name and age. */
export const knownPersonShape = z.object({
  name: z.string().trim().min(1).max(120),
  age: z.number().int().min(18).max(99),
})
export type KnownPerson = z.infer<typeof knownPersonShape>

export const datingSettingsShape = z.object({
  /** Facts about the member the AI may use. It never makes one up. */
  aboutMe: z.string().max(4_000).default(""),
  lookingFor: z.string().max(4_000).default(""),
  dealbreakers: z.string().max(4_000).default(""),
  ageMin: z.number().int().min(18).max(99).default(18),
  ageMax: z.number().int().min(18).max(99).default(99),
  /** Tinder's own distance filter, in kilometres. The phone copies it and the ages into Tinder. Tyler's choice, 18 Oct 2026: 25 to start with. */
  maxDistanceKm: z.number().int().min(2).max(160).default(25),
  /** Cards with one of these names and ages are passed without an AI call. Tyler, 18 Oct 2026: typed as "Sarah, 31". */
  knownPeople: z.array(knownPersonShape).max(MAX_KNOWN_PEOPLE).default([]),
  /** Messages the member has sent, three to five, so the AI writes in their voice. */
  examples: z.array(z.string().max(500)).max(MAX_EXAMPLES).default([]),
  style: z.enum(DATING_STYLES).default("examples"),
  /** The member's last ten own messages, written or changed by them, are also examples of their voice. On to start with (18 Oct 2026). */
  learnFromSends: z.boolean().default(true),
  /** Like a card scored at this or more, out of 100. */
  likeAbove: z.number().int().min(0).max(100).default(70),
  /** Tyler, 17 Oct 2026: "AI can craft messages and I will send it, but that should be an option if I want it automated later." Off to start with. */
  automate: z.boolean().default(false),
  /** With automate on, a reply goes out this many minutes after their message, drawn at random between the two. */
  replyDelayMin: z.number().int().min(0).max(1_440).default(10),
  replyDelayMax: z.number().int().min(0).max(1_440).default(90),
  swipesPerHour: z.number().int().min(1).max(300).default(60),
  /** Swipes from midnight to midnight on the phone's clock. Tyler's choice, 18 Oct 2026: 150. */
  swipesPerDay: z.number().int().min(1).max(2_000).default(150),
  /**
   * The swiping window, in the phone's own hours: Start runs by itself at the
   * first and stops at the second. Both empty means no schedule. Tyler, 18 Oct
   * 2026: one window, every day, such as 7pm to 10pm.
   */
  scheduleStart: z.number().int().min(0).max(23).nullable().default(null),
  scheduleEnd: z.number().int().min(0).max(23).nullable().default(null),
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
  if ((settings.scheduleStart === null) !== (settings.scheduleEnd === null)) return "The swiping schedule needs both a start and an end hour, or neither."
  if (settings.scheduleStart !== null && settings.scheduleStart === settings.scheduleEnd) return "The swiping schedule starts and ends at the same hour."
  return null
}

/** Whether an hour of the day falls in a window from one hour to another, which may run past midnight. */
export function inHourWindow(start: number, end: number, hour: number): boolean {
  if (start === end) return false
  return start < end ? hour >= start && hour < end : hour >= start || hour < end
}

/** "Sarah, 31" for each person, one a line, as the People I know box shows them. */
export function knownPeopleText(people: KnownPerson[]): string {
  return people.map((person) => `${person.name}, ${person.age}`).join("\n")
}

/**
 * The People I know box read back: one person a line, a name then an age.
 * Empty lines are skipped. A line that is not a name and an age from 18 to 99
 * is the problem, in words.
 */
export function parseKnownPeople(text: string): { people: KnownPerson[] } | { problem: string } {
  const people: KnownPerson[] = []
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    const parsed = /^(.+?)[,\s]+(\d{1,3})$/.exec(line)
    const person = parsed ? knownPersonShape.safeParse({ name: parsed[1].replace(/,\s*$/, ""), age: Number(parsed[2]) }) : null
    if (!person?.success) return { problem: `"${line}" is not a name and an age, such as "Sarah, 31". Ages run from 18 to 99.` }
    people.push(person.data)
  }
  if (people.length > MAX_KNOWN_PEOPLE) return { problem: `The list holds ${MAX_KNOWN_PEOPLE} people at most.` }
  return { people }
}
