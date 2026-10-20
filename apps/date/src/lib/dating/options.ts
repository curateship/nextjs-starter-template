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
}

export const ACTION_STATUS_WORDS: Record<PhoneActionStatus, string> = {
  waiting: "Waiting for the phone",
  running: "On the phone now",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
}

/** The Tinder walks, each a list of plain actions run on the server's side. */
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
  "set-discovery": "Setting Tinder's distance and ages",
}

export const WALK_STATUSES = ["waiting", "running", "done", "failed", "cancelled"] as const
export type WalkStatus = (typeof WALK_STATUSES)[number]

/**
 * Screens that stop everything until Tyler presses Resume on the Phone
 * screen. The words are what the dashboard says about each.
 */
export const STOP_REASONS = [
  "out_of_likes",
  "verification",
  "under_review",
  "banned",
  "update_required",
  "not_signed_in",
  "tinder_missing",
] as const
export type StopReason = (typeof STOP_REASONS)[number]

export const STOP_REASON_WORDS: Record<StopReason, string> = {
  out_of_likes: "Tinder says you are out of likes",
  verification: "Tinder is asking you to verify your profile",
  under_review: "Tinder says the account is under review",
  banned: "Tinder says the account is banned",
  update_required: "Tinder needs updating on the phone",
  not_signed_in: "Tinder is not signed in on the phone",
  tinder_missing: "Tinder is not installed on the phone",
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
export const MATCH_FLAGS = ["asked_if_bot", "sexual", "missing_fact", "scam"] as const
export type MatchFlag = (typeof MATCH_FLAGS)[number]

export const MATCH_FLAG_WORDS: Record<MatchFlag, string> = {
  asked_if_bot: "They asked whether this is a bot or an AI. Reply yourself; the AI will not draft here until you let it again.",
  sexual: "The chat turned sexual. The AI will not draft here until you let it again.",
  missing_fact: "The AI needs a fact about you to answer. Answer the question below and it drafts again.",
  scam: "This looks like a scam: money, gift cards, crypto, a quick move to another app, or a link. The AI will not draft here until you let it again.",
}

/** The flags that stop the AI drafting until the member lets it again. A missing fact clears itself once answered. */
export const STOPPING_FLAGS: readonly MatchFlag[] = ["asked_if_bot", "sexual", "scam"]

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
}

/** On What's working, a band of scores with fewer likes than this says "not enough yet" instead of its numbers. */
export const BAND_NEEDS_LIKES = 20

/** Which cards the dashboard's left column lists. */
export const PROFILE_FILTERS = ["all", "liked", "passed", "unswiped"] as const
export type ProfileFilter = (typeof PROFILE_FILTERS)[number]

/** The left column's tabs: cards, chats, and the chats where a date was agreed. */
export const LIST_TABS = ["profiles", "matches", "dates"] as const
export type ListTab = (typeof LIST_TABS)[number]

/** The three columns' remembered widths. Not in the shell's `panelLayoutKey`, which is a shell file. */
export const DATING_PANEL_LAYOUT_KEY = "date-dating-workspace"
