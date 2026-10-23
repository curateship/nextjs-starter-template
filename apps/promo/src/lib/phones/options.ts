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
  // The same for an X account being moved onto the phone (X task, part 46).
  "x/state",
  // And for a LinkedIn account, whose answer names its slug (LinkedIn task, part 9).
  "linkedin/state",
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
  "x/state": "Read who X is signed in as",
  "linkedin/state": "Read who LinkedIn is signed in as",
}

/** A job's app steps, which the rack does in the Reddit, Instagram, TikTok, Medium, X and LinkedIn apps, in words. */
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
  "medium/state": "Read who Medium is signed in as",
  "medium/quick_state": "Read who Medium is signed in as",
  "medium/respond": "Send a Medium response",
  "medium/warm_up": "Medium warm-up visit",
  "medium/publish": "publishing an article",
  "medium/edit": "editing on Medium",
  "medium/delete": "deleting on Medium",
  "medium/stats": "reading an article's views",
  "medium/add_to_list": "adding to a Medium list",
  "medium/publication": "checking a publication",
  "medium/sign_in": "opening a sign-in link",
  "x/state": "Read who X is signed in as",
  "x/quick_state": "Read who X is signed in as",
  "x/reply": "Post an X reply",
  "x/quote": "Post an X quote",
  "x/publish": "Post on X",
  "x/follow": "Follow an X account",
  "x/warm_up": "X warm-up visit",
  "x/inbox": "Read X's messages",
  "x/reply_message": "Answer an X message",
  "x/enter_code": "typing a sign-in code",
  "x/search": "searching X",
  "x/post": "reading an X post",
  "x/check": "reading a sent X post again",
  "x/mentions": "reading mentions",
  "x/trends": "reading what is trending",
  "x/lookup": "looking up X accounts",
  "x/community": "reading a community",
  "x/reach": "the search-ban check",
  "x/edit": "editing an X post",
  "x/delete": "deleting an X post",
  "x/list_add": "adding to an X list",
  "x/message": "answering a message the browser's way",
  "linkedin/state": "Read who LinkedIn is signed in as",
  "linkedin/quick_state": "Read who LinkedIn is signed in as",
  "linkedin/comment": "Post a LinkedIn comment",
  "linkedin/publish": "Post on LinkedIn",
  "linkedin/connect": "Send a LinkedIn connection request",
  "linkedin/invites": "Read waiting LinkedIn requests",
  "linkedin/accept": "Accept a LinkedIn request",
  "linkedin/warm_up": "LinkedIn warm-up visit",
  "linkedin/inbox": "Read LinkedIn's messages",
  "linkedin/reply_message": "Answer a LinkedIn message",
  "linkedin/enter_code": "typing an emailed code",
  "linkedin/search": "searching LinkedIn",
  "linkedin/post": "reading a LinkedIn post",
  "linkedin/check": "reading a sent LinkedIn comment or post again",
  "linkedin/lookup": "looking up LinkedIn people and pages",
  "linkedin/group": "reading a group",
  "linkedin/seen": "the look at whether comments still show",
  "linkedin/find_own": "finding where a comment or post landed",
  "linkedin/newsletter": "publishing a newsletter issue",
  "linkedin/edit": "editing on LinkedIn",
  "linkedin/delete": "deleting on LinkedIn",
  "linkedin/viewers": "reading who viewed the profile",
  "linkedin/numbers": "reading the account's numbers",
  "linkedin/feed": "reading the account's own feed",
  "linkedin/message": "answering a message the browser's way",
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
  "medium/state",
  "medium/quick_state",
  "medium/respond",
  "medium/warm_up",
  // X (X task, part 2): who is signed in, a reply, a quote, one post or a
  // thread's next piece (never into a community or with a poll), a follow,
  // the warm-up, and its direct messages through the shared inbox steps.
  "x/state",
  "x/quick_state",
  "x/reply",
  "x/quote",
  "x/publish",
  "x/follow",
  "x/warm_up",
  "x/inbox",
  "x/reply_message",
  // LinkedIn (LinkedIn task, part 2): who is signed in, a comment or a reply
  // under one (never as a company page), one post with words and at most a
  // picture, a connection request, the requests waiting and accepting one,
  // the warm-up, and its messages through the shared inbox steps.
  "linkedin/state",
  "linkedin/quick_state",
  "linkedin/comment",
  "linkedin/publish",
  "linkedin/connect",
  "linkedin/invites",
  "linkedin/accept",
  "linkedin/warm_up",
  "linkedin/inbox",
  "linkedin/reply_message",
] as const

const APP_PREFIXES = ["reddit/", "instagram/", "tiktok/", "medium/", "x/", "linkedin/"]

/**
 * Why a phone cannot do an app step, in words, or null when it can. Said
 * when the button is pressed for a phone account, and again where the step
 * would reach the phone, so nothing is ever queued only to fail.
 */
export function phoneStepRefusal(routine: string, phoneName: string): string | null {
  if (!APP_PREFIXES.some((prefix) => routine.startsWith(prefix))) return null
  if ((PHONE_APP_ROUTINES as readonly string[]).includes(routine)) return null
  if (routine.startsWith("medium/")) {
    return `${phoneName} cannot do ${actionWords(routine)}: on a phone, the Medium app reads who is signed in, sends responses and answers, and warms up. Articles, edits, deletes, lists and sign-in links need the account on a browser profile. Nothing was sent.`
  }
  if (routine.startsWith("x/")) {
    return `${phoneName} cannot do ${actionWords(routine)}: on a phone, the X app reads who is signed in, replies, quotes, posts, follows, warms up, and reads and answers messages. Searches, reading posts again, edits, deletes, lists and sign-in codes are done in a browser. Nothing was sent.`
  }
  if (routine.startsWith("linkedin/")) {
    return `${phoneName} cannot do ${actionWords(routine)}: on a phone, the LinkedIn app reads who is signed in, comments, posts with words and a picture, sends and accepts connection requests, warms up, and reads and answers messages. Who viewed the profile, the account's numbers, its own feed, searches, reading posts again, edits, deletes, newsletters and the emailed sign-in code are done in a browser. Nothing was sent.`
  }
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
export const TRACKED_APPS = ["reddit", "instagram", "tiktok", "medium", "x", "linkedin"] as const

export type TrackedApp = (typeof TRACKED_APPS)[number]

export const APP_WORDS: Record<TrackedApp, string> = {
  reddit: "Reddit",
  instagram: "Instagram",
  tiktok: "TikTok",
  medium: "Medium",
  x: "X",
  linkedin: "LinkedIn",
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
