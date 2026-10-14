/**
 * The phone farm's fixed lists and numbers, shared by the server, the
 * dashboard and the tests. The rack program keeps its own copy of the action
 * names in `rack/promo_rack.py`; a name on one list and not the other is
 * refused by whichever side does not know it.
 */

export type PhoneConnection = "sim" | "wifi"

export type PhoneActionStatus = "queued" | "running" | "done" | "failed" | "cancelled"

/**
 * What the dashboard says about a phone, worked out from the rows:
 * held by a person, offline, busy running an action, or connected and idle.
 */
export type PhoneStatus = "connected" | "offline" | "busy" | "held"

export const PHONE_STATUS_WORDS: Record<PhoneStatus, string> = {
  connected: "Connected",
  offline: "Offline",
  busy: "Busy",
  held: "Held",
}

/**
 * The actions Promo may ask the rack for by name. Nothing else is written or
 * run. The network routines (`reddit/search` and the rest) are written by a
 * job's own steps (`src/server/phones/dispatch.ts`) and join the rack's list
 * in the later phone farm steps.
 */
export const PHONE_ACTIONS = [
  "phone/list",
  "phone/health",
  "phone/android-version",
  "phone/self-test",
  "phone/check-updates",
  "phone/update-app",
] as const

export type PhoneAction = (typeof PHONE_ACTIONS)[number]

/** The checks a person may run from a phone's window. The rest are Promo's own. */
export const MANUAL_PHONE_ACTIONS = ["phone/android-version", "phone/health"] as const

const PHONE_ACTION_WORDS: Record<PhoneAction, string> = {
  "phone/list": "List the phones",
  "phone/health": "Health check",
  "phone/android-version": "Read the Android version from Settings",
  "phone/self-test": "Daily self-test",
  "phone/check-updates": "Look for app updates in the Play Store",
  "phone/update-app": "Update an app",
}

/** An action's name in words, for any action the rack ran, including a job's steps. */
export function actionWords(action: string): string {
  return PHONE_ACTION_WORDS[action as PhoneAction] ?? action
}

/**
 * The rack checks in every 15 seconds. A phone not seen for 45 seconds, three
 * missed check-ins, is offline, so a phone pulled out or a rack switched off
 * shows within a minute.
 */
export const RACK_CHECK_IN_SECONDS = 15
export const PHONE_STALE_MS = 45_000

/** How long a pairing code works. */
export const RACK_CODE_MINUTES = 15

/** How far a signed message's clock may be from the server's, either way. */
export const RACK_CLOCK_WINDOW_SECONDS = 300

/** "slot 4", or empty when no slot was typed. */
export function slotWords(shelfSlot: string): string {
  const slot = shelfSlot.trim()
  return slot ? `slot ${slot}` : ""
}

/** The bounds Settings → Phones allows. Here because the tab draws them too. */
export const MAX_WORKING_RANGE = { min: 1, max: 50 } as const
export const SCREENSHOT_DAYS_RANGE = { min: 1, max: 90 } as const

/** A forgotten screen window with control on lets the phone go after this long without a tap. */
export const CONTROL_HOLD_MS = 15 * 60_000

/** A phone job's lane: `phone:` and the phone's id, so it never shares a profile's lane. */
export const PHONE_LANE_PREFIX = "phone:"

export function phoneLane(phoneId: string): string {
  return `${PHONE_LANE_PREFIX}${phoneId}`
}

/** The bell notice's heading while the rack is paused. */
export const RACK_PAUSED_NOTICE = "The rack is paused"

/**
 * The apps Promo keeps an eye on, by their Play Store package. The rack keeps
 * the same list in `rack/promo_rack.py`. TikTok's package keeps its old
 * Musical.ly name.
 */
export const TRACKED_APPS = ["reddit", "instagram", "tiktok"] as const

export type TrackedApp = (typeof TRACKED_APPS)[number]

export const APP_WORDS: Record<TrackedApp, string> = {
  reddit: "Reddit",
  instagram: "Instagram",
  tiktok: "TikTok",
}

/**
 * Where an app update stands. `available`: the Play Store on the test phone
 * shows Update. `updating`: the test phone is updating. `testing`: the
 * self-test is running on the new version. `passed`: the other phones may
 * update. `failed`: the update or the self-test failed, and the rest of the
 * rack stays where it is.
 */
export type RolloutStatus = "available" | "updating" | "testing" | "passed" | "failed"

/** The lines of a phone's history (part 18 of the phone farm). */
export type PhoneEventKind =
  | "plugged_in"
  | "unplugged"
  | "restarted"
  | "app_updated"
  | "account_moved"
  | "account_signed_in"
  | "ran_hot"
  | "notice_raised"
  | "notice_cleared"

export const PHONE_EVENT_WORDS: Record<PhoneEventKind, string> = {
  plugged_in: "Plugged in",
  unplugged: "Unplugged",
  restarted: "Restarted",
  app_updated: "App updated",
  account_moved: "Account moved",
  account_signed_in: "Account signed in",
  ran_hot: "Ran hot",
  notice_raised: "Notice raised",
  notice_cleared: "Notice cleared",
}

/**
 * When a phone's health rings the bell (part 14). Each problem has one notice
 * per phone, which goes away when the problem does.
 */
export const OFFLINE_NOTICE_MS = 5 * 60_000
/** The rack itself not checking in for this long rings once for the rack, not once per phone. */
export const RACK_SILENT_NOTICE_MS = 5 * 60_000
/** A battery hotter than this rings; it clears once it is back down to `COOL_AGAIN_C`. */
export const HOT_C = 45
/**
 * Two degrees under the alarm, so a phone sitting right at 45 does not ring
 * and clear over and over.
 */
export const COOL_AGAIN_C = 43
export const NO_SIGNAL_NOTICE_MS = 10 * 60_000
/** Storage more full than this, out of 100, rings. */
export const STORAGE_FULL_PERCENT = 90

/** Battery and heat are kept for the chart this often, and for this long. */
export const READING_GAP_MS = 10 * 60_000
export const READING_KEEP_DAYS = 28

/** The self-test and the Play Store look run once a day. */
export const SELF_TEST_GAP_MS = 24 * 60 * 60_000
