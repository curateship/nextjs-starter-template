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
  // The schema's own defaults on user_preferences, so nothing changes until
  // an admin says so.
  "rooms.limits": { maxPeople: null, maxRepeatsPerHost: 5, maxInvitesPerRoom: 20 },
  "chat.blockedWords": { words: [], rule: "hold" },
  // Today's CHAT_LIMIT in rooms.ts, so nothing changes until an admin says so.
  "chat.speed": { messagesPerMinute: 20 },
  "safety.pause": { newRooms: false, chat: false },
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
  pixabay: "pomodoro-pixabay",
} as const
