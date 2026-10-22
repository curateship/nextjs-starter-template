/**
 * The fixed lists and numbers Date's phone link and Tinder walks are built
 * from, kept where both the browser and the server can read them. Nothing here
 * reaches the database; `src/server/phone/` and `src/server/tinder/` do that.
 */

/** How often the phone checks in, in seconds. The phone is told this on every answer. */
export const PHONE_CHECK_IN_SECONDS = 15

/**
 * A phone not heard from for this long reads as away. Three missed check-ins,
 * so one slow network moment does not flip the dashboard.
 */
export const PHONE_AWAY_MS = 45_000

/** A pairing code works once, for this many minutes. */
export const PAIR_CODE_MINUTES = 10

/** A signed message whose clock is further than this from the server's is refused. */
export const PHONE_CLOCK_WINDOW_SECONDS = 300

/**
 * An action still waiting for the phone after this long is cancelled with the
 * reason "phone away". Tyler, 17 Oct 2026: a phone in a pocket sleeps and
 * loses signal, which is normal and not an error.
 */
export const ACTION_WAIT_LIMIT_MS = 60 * 60_000

/** How long a phone may keep a single action before the server stops waiting, on top of the action's own limit. */
export const ACTION_ANSWER_GRACE_MS = 60_000

/** The package Tinder's Android app is installed as. */
export const TINDER_PACKAGE = "com.tinder"

/** The package Facebook's Android app is installed as. Facebook Dating lives inside it (task "facebook/01"). */
export const FACEBOOK_PACKAGE = "com.facebook.katana"

/**
 * The plain things a phone knows how to do. Everything that knows what Tinder
 * looks like is a walk on the server, built from these.
 */
export const PHONE_ACTION_KINDS = [
  "open-app",
  "read-screen",
  "tap",
  "swipe",
  "type",
  "back",
  "home",
  "screenshot",
  "close-app",
] as const
export type PhoneActionKind = (typeof PHONE_ACTION_KINDS)[number]

export const PHONE_ACTION_STATUSES = ["waiting", "running", "done", "failed", "cancelled"] as const
export type PhoneActionStatus = (typeof PHONE_ACTION_STATUSES)[number]

export const ACTION_WORDS: Record<PhoneActionKind, string> = {
  "open-app": "Open an app",
  "read-screen": "Read the screen",
  tap: "Tap",
  swipe: "Swipe",
  type: "Type",
  back: "Press back",
  home: "Go home",
  screenshot: "Take a picture",
  "close-app": "Close an app",
}

export const ACTION_STATUS_WORDS: Record<PhoneActionStatus, string> = {
  waiting: "Waiting for the phone",
  running: "On the phone now",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
}

/** The walks, each a list of plain actions run on the server's side. Each app has the ones it can do (`src/server/tinder/jobs.ts`). */
export const WALK_KINDS = [
  "who-is-signed-in",
  "read-card",
  "like",
  "super-like",
  "pass",
  "read-matches",
  "read-conversation",
  "send-message",
  "unmatch",
  "read-own-profile",
  "set-discovery",
  "reorder-photos",
  "set-bio",
  "set-prompt",
  "check-labels",
  "report",
  "set-break",
] as const
export type WalkKind = (typeof WALK_KINDS)[number]

export const WALK_WORDS: Record<WalkKind, string> = {
  "who-is-signed-in": "Checking who is signed in",
  "read-card": "Reading the card in front",
  like: "Liking",
  "super-like": "Super Liking",
  pass: "Passing",
  "read-matches": "Reading the matches",
  "read-conversation": "Reading a conversation",
  "send-message": "Sending a message",
  unmatch: "Unmatching",
  "read-own-profile": "Reading your profile",
  "set-discovery": "Setting the app's distance and ages",
  "reorder-photos": "Putting your photos in order",
  "set-bio": "Changing your bio",
  "set-prompt": "Changing a prompt's answer",
  "check-labels": "Checking the app's buttons after an update",
  report: "Reporting a scam and unmatching",
  "set-break": "Turning Facebook Dating's break on or off",
}

export const WALK_STATUSES = ["waiting", "running", "done", "failed", "cancelled"] as const
export type WalkStatus = (typeof WALK_STATUSES)[number]

/**
 * Screens that stop everything for a profile until Tyler presses Resume in
 * the Phone panel. The words are what the dashboard says about each, with the
 * profile's app named. `tinder_missing` is stored as it was first named and
 * means the profile's app is not installed, whichever app that is.
 */
export const STOP_REASONS = [
  "out_of_likes",
  "verification",
  "under_review",
  "banned",
  "update_required",
  "not_signed_in",
  "tinder_missing",
  "left_dating",
  "restricted",
  "dating_unavailable",
  "app_changed",
] as const
export type StopReason = (typeof STOP_REASONS)[number]

const STOP_REASON_TEMPLATES: Record<StopReason, (app: string) => string> = {
  out_of_likes: (app) => `${app} says you are out of likes`,
  verification: (app) => `${app} is asking you to confirm it's you`,
  under_review: (app) => `${app} says the account is under review`,
  banned: (app) => `${app} says the account is banned or disabled`,
  update_required: (app) => `${app} needs updating on the phone`,
  not_signed_in: (app) => `${app} is not signed in on the phone`,
  tinder_missing: (app) => `${app} is not installed on the phone`,
  left_dating: () => "Left Facebook Dating: a step landed somewhere else in Facebook",
  restricted: (app) => `${app} says the account is restricted`,
  dating_unavailable: () => "Facebook says your Dating profile is not available",
  app_changed: (app) => `${app} changed after an update, and some of its buttons can't be found`,
}

/** What the dashboard says about a stop, for the profile's app. */
export function stopReasonWords(reason: StopReason, app: DatingApp): string {
  return STOP_REASON_TEMPLATES[reason](DATING_APP_WORDS[app].name)
}

/**
 * What happened to a card. "super" is a Super Like, which is a like in every
 * count. Tyler, 18 Oct 2026: a card scoring 95 or more, at most one a day.
 */
export const SWIPE_DECISIONS = ["none", "like", "pass", "super"] as const
export type SwipeDecision = (typeof SWIPE_DECISIONS)[number]

/** A like or a Super Like. */
export function isLike(swipe: SwipeDecision): boolean {
  return swipe === "like" || swipe === "super"
}

/** "liked", "Super Liked" or "passed", for the middle of a sentence. */
export function swipedWord(swipe: Exclude<SwipeDecision, "none">): string {
  return swipe === "super" ? "Super Liked" : swipe === "like" ? "liked" : "passed"
}

/** Who wrote a message: them, or from our side the member or the AI. */
export const MESSAGE_SENDERS = ["them", "member", "ai"] as const
export type MessageSender = (typeof MESSAGE_SENDERS)[number]

export const MESSAGE_STATUSES = ["sending", "sent", "unsure", "failed"] as const
export type MessageStatus = (typeof MESSAGE_STATUSES)[number]

export const MESSAGE_STATUS_WORDS: Record<MessageStatus, string> = {
  sending: "Sending from the phone",
  sent: "Sent",
  unsure: "Typed on the phone, not yet confirmed as sent",
  failed: "Not sent",
}

/**
 * Why the AI wrote no draft for a match. Tyler's rules, 17 Oct 2026: it never
 * says it is an AI and never denies it, and it sends nothing sexual. A missing
 * fact about Tyler is a question for him instead of a guess.
 */
export const MATCH_FLAGS = ["asked_if_bot", "sexual", "missing_fact", "scam", "asked_for_call"] as const
export type MatchFlag = (typeof MATCH_FLAGS)[number]

export const MATCH_FLAG_WORDS: Record<MatchFlag, string> = {
  asked_if_bot: "They asked whether this is a bot or an AI. Reply yourself; the AI will not draft here until you let it again.",
  sexual: "The chat turned sexual. The AI will not draft here until you let it again.",
  missing_fact: "The AI needs a fact about you to answer. Answer the question below and it drafts again.",
  scam: "This looks like a scam: money, gift cards, crypto, a quick move to another app, or a link. The AI will not draft here until you let it again.",
  asked_for_call: "They asked for a video or voice call. Answer it yourself; the AI drafts again once you send a message.",
}

/**
 * The flags that stop the AI drafting until the member lets it again. A
 * missing fact clears itself once answered, and a call request once the
 * member sends a message of their own (Tyler, 22 Oct 2026: "Flag, no draft").
 */
export const STOPPING_FLAGS: readonly MatchFlag[] = ["asked_if_bot", "sexual", "scam", "asked_for_call"]

/** What a waiting draft is: an answer to their message, a first message to a new match, or the one follow-up on a quiet chat. */
export const DRAFT_KINDS = ["reply", "opener", "nudge"] as const
export type DraftKind = (typeof DRAFT_KINDS)[number]

/** The kinds of first message the AI writes, so Date can count which get replies. */
export const OPENER_STYLES = ["prompt_question", "photo_comment", "joke", "simple_hello", "other"] as const
export type OpenerStyle = (typeof OPENER_STYLES)[number]

export const OPENER_STYLE_WORDS: Record<OpenerStyle, string> = {
  prompt_question: "A question about their profile",
  photo_comment: "A comment on a photo",
  joke: "A joke",
  simple_hello: "A simple hello",
  other: "Something else",
}

/** The tone buttons beside Regenerate. */
export const DRAFT_TONES = ["shorter", "funnier", "warmer"] as const
export type DraftTone = (typeof DRAFT_TONES)[number]

/** Where a chat is heading, from how fast they answer and how long their messages are. */
export type ChatTrend = "warming" | "steady" | "cooling" | "too_early"

/**
 * The red flags a card can carry. Three are worked out from the card itself;
 * the rest are the AI's call from the photos and the words.
 */
export const CARD_FLAGS = [
  "no_bio",
  "one_photo",
  "outside_age_range",
  "photos_generated",
  "photos_filtered",
  "far_away",
  "dealbreaker",
  "ai_declined",
  "known_person",
  "mutual_friends",
  "passed_elsewhere",
] as const
export type CardFlag = (typeof CARD_FLAGS)[number]

export const CARD_FLAG_WORDS: Record<CardFlag, string> = {
  no_bio: "No bio",
  one_photo: "One photo",
  outside_age_range: "Outside your age range",
  photos_generated: "Photos look generated",
  photos_filtered: "Photos look heavily filtered",
  far_away: "Further than you want",
  dealbreaker: "Hits a dealbreaker",
  ai_declined: "The AI would not read this card",
  known_person: "On your People I know list",
  mutual_friends: "3 or more mutual friends",
  passed_elsewhere: "You passed them on another profile",
}

/** On What's working, a band of scores with fewer likes than this says "not enough yet" instead of its numbers. */
export const BAND_NEEDS_LIKES = 20

/** The three columns' remembered widths. Not in the shell's `panelLayoutKey`, which is a shell file. */
export const DATING_PANEL_LAYOUT_KEY = "date-dating-panels"

/** Where the Dating dashboard was, for the shell's `useDashboardPlace`, kept beside the layout for the same reason. */
export const DATING_PLACE_KEY = "date-dating-place"

/** How coming back from Google's screen went, as the address says it (`?google=`), and what the dashboard then says. */
export const GOOGLE_RETURN_WORDS = {
  connected: { ok: true, words: "Google Calendar is connected. Each date with a time goes there too." },
  denied: { ok: false, words: "Google Calendar was not connected: access was not allowed on Google's screen." },
  failed: { ok: false, words: "Google Calendar could not be connected. Try Connect again." },
  "not-set-up": { ok: false, words: "Google is not set up on this server, so the calendar cannot be connected yet." },
} as const
export type GoogleReturn = keyof typeof GOOGLE_RETURN_WORDS
export const GOOGLE_RETURNS = Object.keys(GOOGLE_RETURN_WORDS) as GoogleReturn[]

/**
 * The dating apps a profile can be (task "features/06-profiles"). A profile is
 * one app's account, so one phone carries at most one of each. Hinge can be
 * named but not made until its walks are built (task "features/04").
 */
export const DATING_APPS = ["tinder", "hinge", "facebook"] as const
export type DatingApp = (typeof DATING_APPS)[number]
export const DATING_APP_WORDS: Record<DatingApp, { name: string; letter: string; ready: boolean }> = {
  tinder: { name: "Tinder", letter: "T", ready: true },
  hinge: { name: "Hinge", letter: "H", ready: false },
  facebook: { name: "Facebook Dating", letter: "F", ready: true },
}

/**
 * Facebook Dating's pace, Tyler's choice of 22 Oct 2026 ("50 a day"): a ban
 * there loses the whole Facebook account, so it is a third of Tinder's. The
 * profile's own settings can only go lower.
 */
export const FACEBOOK_PACE = { swipesPerDay: 50, swipesPerHour: 20, gapMs: { min: 8_000, max: 20_000 } } as const

/** A Facebook like carries a comment the AI wrote only this many points or more over the like line ("High scores only"). */
export const LIKE_COMMENT_OVER = 10

/** This many mutual friends or more on a card means the AI passes, like People I know ("Pass at 3 or more"). */
export const MUTUAL_FRIENDS_PASS = 3

/** Second Look lists cards the AI passed this many points or fewer under the like line ("You decide"). */
export const SECOND_LOOK_POINTS = 5

/** Where a card came from: the cards in front, Facebook's Likes you list, or Facebook's weekly surprise match. */
export const CARD_SOURCES = ["card", "likes_you", "weekly"] as const
export type CardSource = (typeof CARD_SOURCES)[number]

/** What a message is. Anything but text is shown, and given to the AI, as what it was, such as "a photo". */
export const MESSAGE_KINDS = ["text", "photo", "voice", "sticker", "video", "gif"] as const
export type MessageKind = (typeof MESSAGE_KINDS)[number]

export const MESSAGE_KIND_WORDS: Record<Exclude<MessageKind, "text">, string> = {
  photo: "Sent a photo",
  voice: "Sent a voice note",
  sticker: "Sent a sticker",
  video: "Sent a video",
  gif: "Sent a GIF",
}

/** A profile's name, as typed in New profile. */
export const PROFILE_NAME_MAX = 60

/** Why a paused profile refuses to swipe, walk or call the AI. */
export const PROFILE_PAUSED_WORDS = "This profile is paused. Resume it in the Dating settings first."
