import { z } from "zod"

/**
 * Every Pomoder admin setting: its shape, its default and its limits, in one
 * browser-safe file the settings page, the server functions and the readers
 * all use. See `workspace/docs/admin-settings.md`.
 *
 * A stored value that no longer fits its shape reads as the default rather
 * than breaking a page, and the next save writes a good one.
 */

/** `curated:<key>` or `scene:<key>`: a default is always one catalogue item. */
const soundKeySchema = z.string().regex(/^curated:[a-z0-9][a-z0-9-]{0,39}$/)
const sceneKeySchema = z.string().regex(/^scene:[a-z0-9][a-z0-9-]{0,39}$/)
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** The longest break message an admin may write. */
export const BREAK_MESSAGE_MAX = 600

/** The most made-up members the card allows, and the highest hours-a-day cap. */
export const SIMULATED_TARGET_MAX = 200
export const SIMULATED_HOURS_MAX = 6
/** The longest style brief the voice card takes. */
export const VOICE_BRIEF_MAX = 1000

export const appSettingSchemas = {
  /**
   * Tyler, 8 Oct 2026: "Add in app settings to checkbox shuffling sounds and
   * themes for anon users and users that have not set their own custom themes
   * and sounds."
   */
  "media.shuffleUnset": z.boolean(),
  /** What a new account and a guest start with, when shuffle is off. */
  "media.defaults": z.object({
    sound: soundKeySchema.nullable(),
    background: sceneKeySchema.nullable(),
  }),
  /** A pair that replaces the defaults between two dates, such as December. */
  "media.seasons": z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(60),
        starts: dateSchema,
        ends: dateSchema,
        sound: soundKeySchema.nullable(),
        background: sceneKeySchema.nullable(),
      })
    )
    .max(24),
  /**
   * Tyler, 9 Oct 2026: "Add a feature for admin to choose a theme that changes
   * to it for break timer and an area for text so I can put some encourgement
   * text or tips." The theme replaces everybody's own while a break is on;
   * null leaves each person's theme alone. The message shows on the break card.
   */
  "break.look": z.object({
    background: sceneKeySchema.nullable(),
    message: z.string().max(BREAK_MESSAGE_MAX),
  }),
  /** The timer a new account and a guest start with. */
  "timer.newAccount": z.object({
    focusMinutes: z.number().int().min(1).max(90),
    shortBreakMinutes: z.number().int().min(1).max(30),
    longBreakMinutes: z.number().int().min(1).max(60),
    sessionsBeforeLongBreak: z.number().int().min(2).max(8),
    dailyGoalSessions: z.number().int().min(1).max(20),
  }),
  /**
   * Room limits (admin task 04). `maxPeople` null means no limit, which is how
   * rooms worked before. The other two were fixed in code at 5 and 20.
   */
  "rooms.limits": z.object({
    maxPeople: z.number().int().min(2).max(500).nullable(),
    maxRepeatsPerHost: z.number().int().min(1).max(50),
    maxInvitesPerRoom: z.number().int().min(1).max(200),
  }),
  /**
   * Words that hold a room message for an admin, or turn into stars (admin
   * task 05). Whole words only, ignoring case. Empty until an admin adds some.
   */
  "chat.blockedWords": z.object({
    words: z.array(z.string().trim().min(1).max(40)).max(300),
    rule: z.enum(["hold", "replace"]),
  }),
  /** How many messages one person may send in one room per minute. */
  "chat.speed": z.object({
    messagesPerMinute: z.number().int().min(1).max(120),
  }),
  /** For a spam wave: no new rooms, or no chat anywhere, until switched off. */
  "safety.pause": z.object({
    newRooms: z.boolean(),
    chat: z.boolean(),
  }),
  /**
   * The made-up members (live activity task 01). Tyler, 9 Oct 2026: "We just
   * need real accounts that mimic live activities." `target` is how many there
   * should be, `hoursCap` the most any of them focuses in a day, and `paused`
   * stops the worker starting anything new.
   */
  "simulated.accounts": z.object({
    target: z.number().int().min(0).max(SIMULATED_TARGET_MAX),
    hoursCap: z.number().int().min(1).max(SIMULATED_HOURS_MAX),
    paused: z.boolean(),
  }),
  /**
   * How the made-up members sound in rooms (live activity task 03). Tyler,
   * 9 Oct 2026: "There should be options to adjust how the ai sounds too so it
   * doesnt sound like ai." A never-say entry of "!" means no line may end in
   * an exclamation mark.
   */
  "simulated.voice": z.object({
    brief: z.string().max(VOICE_BRIEF_MAX),
    chattiness: z.enum(["quiet", "normal", "talkative"]),
    length: z.enum(["few", "one", "two"]),
    lowercase: z.boolean(),
    emoji: z.boolean(),
    typo: z.enum(["off", "1in20", "1in10"]),
    neverSay: z.array(z.string().trim().min(1).max(80)).max(100),
  }),
} as const

export type AppSettingKey = keyof typeof appSettingSchemas
export type AppSettingValue<K extends AppSettingKey> = z.infer<
  (typeof appSettingSchemas)[K]
>
export type MediaSeason = AppSettingValue<"media.seasons">[number]

export const APP_SETTING_DEFAULTS: {
  [K in AppSettingKey]: AppSettingValue<K>
} = {
  "media.shuffleUnset": false,
  "media.defaults": { sound: null, background: null },
  "media.seasons": [],
  "break.look": { background: null, message: "" },
  // The schema's own defaults on user_preferences, so nothing changes until
  // an admin says so.
  "rooms.limits": { maxPeople: null, maxRepeatsPerHost: 5, maxInvitesPerRoom: 20 },
  "chat.blockedWords": { words: [], rule: "hold" },
  // Today's CHAT_LIMIT in rooms.ts, so nothing changes until an admin says so.
  "chat.speed": { messagesPerMinute: 20 },
  "safety.pause": { newRooms: false, chat: false },
  // Tyler, 9 Oct 2026: the busiest never over three hours a day so a real
  // member can reach the top. A hundred, not the forty first asked for,
  // because "at least 10 rooms open at all times" needed it: measured over a
  // simulated day, 40 fell under ten rooms a third of the time, 80 never did
  // but now and then left a room with only its host for over ten minutes, and
  // 100 did neither. The floor is six rooms now, plus three under Starting
  // soon (see `longCountdownFor`), and the day test still runs a hundred.
  // Nothing is made until an admin presses Make them now.
  "simulated.accounts": { target: 100, hoursCap: 3, paused: false },
  // The task's own defaults, 9 Oct 2026, so the first Preview already sounds
  // like somebody half-distracted by their own work.
  "simulated.voice": {
    brief:
      "casual, lowercase, short, no exclamation marks, no emoji, never cheerleads, talks like someone half-distracted by their own work",
    chattiness: "normal",
    length: "one",
    lowercase: true,
    emoji: false,
    typo: "off",
    neverSay: ["great job", "let's go", "you've got this", "stay focused", "keep it up", "!"],
  },
  "timer.newAccount": {
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    sessionsBeforeLongBreak: 4,
    dailyGoalSessions: 4,
  },
}

/** A stored value, or the default when it is missing or no longer fits. */
export function readAppSetting<K extends AppSettingKey>(
  key: K,
  stored: unknown
): AppSettingValue<K> {
  const parsed = appSettingSchemas[key].safeParse(stored)
  return parsed.success
    ? (parsed.data as AppSettingValue<K>)
    : APP_SETTING_DEFAULTS[key]
}

/** The season covering `today` (a `yyyy-mm-dd`), if any. */
export function seasonOn(seasons: MediaSeason[], today: string) {
  return seasons.find((season) => season.starts <= today && today <= season.ends) ?? null
}

/** Why a set of seasons cannot be saved, or null. Two may not overlap. */
export function seasonsProblem(seasons: MediaSeason[]) {
  for (const season of seasons) {
    if (season.ends < season.starts)
      return `"${season.name}" ends before it starts.`
  }
  const sorted = [...seasons].sort((a, b) => a.starts.localeCompare(b.starts))
  for (let index = 1; index < sorted.length; index += 1) {
    const before = sorted[index - 1]
    const after = sorted[index]
    if (after.starts <= before.ends)
      return `"${after.name}" overlaps "${before.name}". Two seasons may not share a day.`
  }
  return null
}

/** The pair a page draws for nobody's own pick: a season's, or the defaults. */
export function defaultPairOn(
  defaults: AppSettingValue<"media.defaults">,
  seasons: MediaSeason[],
  today: string
) {
  const season = seasonOn(seasons, today)
  return {
    sound: season?.sound ?? defaults.sound,
    background: season?.background ?? defaults.background,
  }
}

/**
 * A message checked against the blocked words: whole words only, ignoring
 * case, so "class" is never caught by "ass". Returns whether any matched and
 * the line with each match turned into stars.
 */
export function checkBlockedWords(body: string, words: string[]) {
  const clean = words.map((word) => word.trim().toLowerCase()).filter(Boolean)
  if (!clean.length) return { matched: false, starred: body }
  const escaped = clean.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join("|")})(?![\\p{L}\\p{N}])`, "giu")
  let matched = false
  const starred = body.replace(pattern, (found) => {
    matched = true
    return "*".repeat(found.length)
  })
  return { matched, starred }
}

/**
 * Pomoder's tabs under Settings → App settings, each at
 * `/admin/settings/<id>`. Listed in `src/app/options.ts`; links to a tab use
 * these ids so an address never drifts from the tab it points at.
 */
export const POMODORO_SETTINGS_TABS = {
  safety: "pomodoro-safety",
  media: "pomodoro-media",
  seasons: "pomodoro-seasons",
  newAccounts: "pomodoro-new-accounts",
  rooms: "pomodoro-rooms",
  chat: "pomodoro-chat",
  breaks: "pomodoro-breaks",
  pixabay: "pomodoro-pixabay",
  madeUpMembers: "pomodoro-made-up-members",
} as const
