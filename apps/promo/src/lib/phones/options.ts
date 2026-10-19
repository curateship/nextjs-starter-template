/**
 * The phone farm's fixed lists and numbers, shared by the server, the
 * dashboard and the tests. The rack program keeps its own copy of the action
 * names in `rack/promo_rack.py`; a name on one list and not the other is
 * refused by whichever side does not know it.
 */

export type PhoneConnection = "sim" | "wifi"

/**
 * Which kind of phone a record is. Every rack action, every word on screen
 * and the self-test's answers follow it. The rack reports it on check-in;
 * a phone added by hand says it on the form.
 */
export type PhoneKind = "android" | "iphone"

export const PHONE_KINDS = ["android", "iphone"] as const

export const PHONE_KIND_WORDS: Record<PhoneKind, string> = {
  android: "Android",
  iphone: "iPhone",
}

/** "Android 16" or "iOS 17.6", or empty when the version is not read yet. */
export function systemWords(kind: PhoneKind, version: string): string {
  const read = version.trim()
  if (!read) return ""
  return `${kind === "iphone" ? "iOS" : "Android"} ${read}`
}

/** Where a phone's apps come from and update: the Play Store or the App Store. */
export function storeWords(kind: PhoneKind): string {
  return kind === "iphone" ? "the App Store" : "the Play Store"
}

/**
 * The oldest iOS the rack drives (Tyler, 18 Oct 2026: used iPhone 11 to 13,
 * iOS 17 or newer). An older iPhone is listed and refused with the reason.
 */
export const OLDEST_IOS = 17

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
  "phone/setup-check",
  "phone/outside-address",
  "phone/wipe",
  // Whether an Apple ID is signed in on an iPhone, read off Settings before
  // a wipe: an iPhone erased while signed in is locked to that Apple ID.
  // The answer is `{ signedOut: boolean, appleId: string }` (part 54).
  "phone/icloud-state",
  // Who the Reddit app is signed in as, asked directly while an account is
  // being moved onto the phone (part 31). A job's own Reddit steps are
  // written by `dispatch.ts`, not from here.
  "reddit/state",
] as const

export type PhoneAction = (typeof PHONE_ACTIONS)[number]

/** The checks a person may run from a phone's window. The rest are Promo's own. */
export const MANUAL_PHONE_ACTIONS = ["phone/android-version", "phone/health"] as const

const PHONE_ACTION_WORDS: Record<PhoneAction, string> = {
  "phone/list": "List the phones",
  "phone/health": "Health check",
  "phone/android-version": "Read the system version from Settings",
  "phone/self-test": "Daily self-test",
  "phone/check-updates": "Look for app updates in the Play Store",
  "phone/update-app": "Update an app",
  "phone/setup-check": "Setup check",
  "phone/outside-address": "Read the address apps see",
  "phone/wipe": "Wipe the phone",
  "phone/icloud-state": "Read whether an Apple ID is signed in",
  "reddit/state": "Read who Reddit is signed in as",
}

/** A job's app steps, which the rack does in the Reddit, Instagram and TikTok apps, in words. */
const APP_STEP_WORDS: Record<string, string> = {
  "reddit/quick_state": "Read who Reddit is signed in as",
  "reddit/health": "Reddit health reading",
  "reddit/comment": "Post a Reddit comment",
  "reddit/inbox": "Read Reddit's messages",
  "reddit/reply_message": "Answer a Reddit message",
  "reddit/reply": "answering a reply",
  "reddit/submit": "a post of your own",
  "reddit/edit_comment": "editing a sent comment",
  "reddit/delete_comment": "deleting a sent comment",
  "reddit/warm_up": "the warm-up visit",
  "instagram/quick_state": "Read who Instagram is signed in as",
  "instagram/health": "Instagram health reading",
  "instagram/profile": "Change the Instagram profile",
  "instagram/post": "Post on Instagram",
  "instagram/inbox": "Read Instagram's messages and comments",
  "instagram/reply": "Answer on Instagram",
  "tiktok/quick_state": "Read who TikTok is signed in as",
  "tiktok/health": "TikTok health reading",
  "tiktok/profile": "Change the TikTok profile",
  "tiktok/post": "Post on TikTok",
  "tiktok/inbox": "Read TikTok's messages and comments",
  "tiktok/reply": "Answer on TikTok",
}

/** An action's name in words, for any action the rack ran, including a job's steps. */
export function actionWords(action: string): string {
  return PHONE_ACTION_WORDS[action as PhoneAction] ?? APP_STEP_WORDS[action] ?? action
}

/**
 * The app steps the rack can do. Reddit (phone farm file 05): who is signed
 * in, the health reading, the comment, and since file 06 its direct
 * messages. Searches and thread reads are not here: they run in the
 * signed-out reader browser for every account, so an account's own history
 * never shows a search (Tyler, 14 Oct 2026). Instagram and TikTok (file 06):
 * who is signed in, the health reading, the profile, a post, reading what
 * arrived and answering it. Any other app step on a phone is refused before
 * anything reaches the phone.
 */
export const PHONE_APP_ROUTINES = [
  "reddit/state",
  "reddit/quick_state",
  "reddit/health",
  "reddit/comment",
  "reddit/inbox",
  "reddit/reply_message",
  "instagram/quick_state",
  "instagram/health",
  "instagram/profile",
  "instagram/post",
  "instagram/inbox",
  "instagram/reply",
  "tiktok/quick_state",
  "tiktok/health",
  "tiktok/profile",
  "tiktok/post",
  "tiktok/inbox",
  "tiktok/reply",
] as const

const APP_PREFIXES = ["reddit/", "instagram/", "tiktok/"]

/**
 * Why a phone cannot do an app step, in words, or null when it can. Said
 * when the button is pressed for a phone account, and again where the step
 * would reach the phone, so nothing is ever queued only to fail.
 */
export function phoneStepRefusal(routine: string, phoneName: string): string | null {
  if (!APP_PREFIXES.some((prefix) => routine.startsWith(prefix))) return null
  if ((PHONE_APP_ROUTINES as readonly string[]).includes(routine)) return null
  return `${phoneName} cannot do ${actionWords(routine)} yet: on a phone, the Reddit app reads who is signed in, takes the health reading, posts comments and answers messages. Nothing was sent.`
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
/** The shelf's rows and columns for the rack map (Tyler, 18 Oct 2026: typed in Settings → Phones). */
export const SHELF_RANGE = { min: 1, max: 20 } as const

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
 * Where an app update stands, kept per kind of phone. `available`: the Play
 * Store on the Android test phone, or the App Store on the iPhone test
 * phone, shows Update. `updating`: that test phone is updating. `testing`:
 * the self-test is running on the new version. `passed`: the other phones
 * of that kind may update. `failed`: the update or the self-test failed, and
 * the rest of the rack stays where it is.
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
  | "wiped"
  | "setup_checked"

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
  wiped: "Wiped",
  setup_checked: "Setup check",
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

/**
 * The rack mix warning (part 27): more than half the phones sharing one
 * model, carrier or Android version, once the rack has four phones or more
 * (Tyler, 14 Oct 2026). A rack of two or three never warns.
 */
export const MIX_WARN_SHARE = 0.5
export const MIX_MIN_PHONES = 4
