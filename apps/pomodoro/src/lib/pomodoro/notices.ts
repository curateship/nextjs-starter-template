/**
 * The kinds of notice this app writes into the shell's bell, and the words
 * that go with each.
 *
 * Every Pomodoro notice is the shell's one `app_activity` type, because a CHECK
 * constraint on `notifications` refuses any other name. What kind it really is
 * lives beside it in `pomodoro_notice_links`, written in the same transaction.
 *
 * Pure data with nothing behind it, because `src/app/options.ts` reads it and
 * that file sits inside the app-options import circle.
 */

export const POMODORO_NOTICE_KINDS = [
  "room_join",
  "room_chat",
  "room_mention",
  "room_reaction",
  "room_invite",
  "room_open",
  "room_removed",
  "followed_room",
  "cheer",
  "group_join",
  "group_removed",
  "followed_streak",
  "badge",
  "media_ready",
  "media_failed",
  "credits_low",
  "report_new",
  "report_reviewed",
  "profile_hidden",
  "streak_reminder",
  "room_changed",
  "admin_warning",
  "rooms_suspended",
  "profile_restored",
  "profile_edited",
  "streak_restored",
  "group_deleted",
] as const

export type PomodoroNoticeKind = (typeof POMODORO_NOTICE_KINDS)[number]

/**
 * The tray's tabs beside Unread and All. A tab joins only with the first kind
 * that is filed under it, so the tray never offers a tab that is always empty.
 * Rooms is what happens in and around focus rooms; Social is other people
 * outside a room; Account is your own badges, files and credits.
 */
export const POMODORO_NOTICE_CATEGORIES = [
  { id: "rooms", label: "Rooms" },
  { id: "social", label: "Social" },
  { id: "account", label: "Account" },
] as const

export type PomodoroNoticeCategoryId =
  (typeof POMODORO_NOTICE_CATEGORIES)[number]["id"]

export const NOTICE_KIND_CATEGORY: Record<
  PomodoroNoticeKind,
  PomodoroNoticeCategoryId
> = {
  room_join: "rooms",
  room_chat: "rooms",
  room_mention: "rooms",
  room_reaction: "rooms",
  room_invite: "rooms",
  room_open: "rooms",
  room_removed: "rooms",
  followed_room: "rooms",
  cheer: "social",
  group_join: "social",
  group_removed: "social",
  followed_streak: "social",
  badge: "account",
  media_ready: "account",
  media_failed: "account",
  credits_low: "account",
  // Moderation is about your own account either way: the queue you work as
  // an admin, a report you filed, or your own page being hidden.
  report_new: "account",
  report_reviewed: "account",
  profile_hidden: "account",
  streak_reminder: "account",
  room_changed: "rooms",
  admin_warning: "account",
  rooms_suspended: "account",
  profile_restored: "account",
  profile_edited: "account",
  streak_restored: "account",
  group_deleted: "social",
}

/**
 * The kinds whose link is a person's public page, worked out when the tray is
 * read because that page can be switched off, hidden or blocked afterwards.
 * Every other kind leads to a fixed page of this app, saved with the notice.
 */
export const KINDS_LINKING_TO_THE_ACTOR: readonly PomodoroNoticeKind[] = [
  "cheer",
  "followed_streak",
]

/** The page a finished file or a credit notice leads to, by what it is for. */
export const MEDIA_PAGE = {
  background: "/backgrounds",
  sound: "/sounds",
} as const

/** The streak lengths that tell the people who follow you. */
export const STREAK_MILESTONES = [7, 30, 100, 365] as const

/** Who a notice names, from the person's public name or handle. */
export function noticeName(profile: {
  publicDisplayName: string | null
  handle: string | null
}) {
  return profile.publicDisplayName?.trim() || profile.handle || "Someone"
}

// ---------------------------------------------------------------------------
// The sentences. Each kind's heading has a shape no other kind's has, and
// `noticeKindFromWords` below reads it back. Change a sentence here and the
// reader changes with it.
// ---------------------------------------------------------------------------

const ROOM_JOIN_INFIX = " joined your room "
const ROOM_CHAT_INFIX = " wrote in "
const ROOM_CHAT_FOLDED = /^\d+ new messages in .+\.$/
const ROOM_MENTION_INFIX = " mentioned you in "
const ROOM_REACTION_INFIX = " reacted to your message in "
const ROOM_INVITE_INFIX = " invited you to "
const ROOM_OPEN_SUFFIX = " is open now."
const ROOM_REMOVED_PREFIX = "You were removed from the room "
const ROOM_BANNED_PREFIX = "You can't rejoin the room "
const FOLLOWED_ROOM_INFIX = " opened the room "
const CHEER_SUFFIX = " cheered you on."
const GROUP_JOIN_INFIX = " joined your group "
const GROUP_REMOVED_PREFIX = "You were removed from the group "
const STREAK_PATTERN = / hit a \d+-day streak\.$/
const BADGE_PREFIX = "You earned "
const READY_SUFFIX = " is ready."
const FAILED_PATTERN = / couldn't be (made|prepared)\.$/
const CREDITS_PATTERN = /^(1|No) AI (background|soundscape)s? left this month\.$/
const STREAK_REMINDER_PATTERN = /^One session today keeps your \d+-day streak\.$/
const REPORT_NEW_PREFIX = "New report: "
const REPORTS_NEW_FOLDED = /^\d+ new reports\.$/

/** "Sam" or "Sam and 2 others", the head of every folded sentence. */
function nameAndOthers(name: string, others: number) {
  return others === 0
    ? name
    : `${name} and ${others} ${others === 1 ? "other" : "others"}`
}

/** Somebody joined the room you host; later joins fold into the same line. */
export function roomJoinMessage(
  joinerName: string,
  others: number,
  roomName: string
) {
  return `${nameAndOthers(joinerName, others)}${ROOM_JOIN_INFIX}${roomName}.`
}

/**
 * Chat in a room you are in while you were not looking at it. One message
 * names who wrote it; more say how many, so a busy room is one line.
 */
export function roomChatMessage(
  writerName: string,
  messages: number,
  roomName: string
) {
  return messages === 1
    ? `${writerName}${ROOM_CHAT_INFIX}${roomName}.`
    : `${messages} new messages in ${roomName}.`
}

/** Somebody named you with @ in a room's chat. */
export function roomMentionMessage(writerName: string, roomName: string) {
  return `${writerName}${ROOM_MENTION_INFIX}${roomName}.`
}

/** People reacted to something you wrote, counted per message. */
export function roomReactionMessage(
  firstName: string,
  others: number,
  roomName: string
) {
  return `${nameAndOthers(firstName, others)}${ROOM_REACTION_INFIX}${roomName}.`
}

/** A host booked a room and asked you to it. */
export function roomInviteMessage(hostName: string, roomName: string) {
  return `${hostName}${ROOM_INVITE_INFIX}${roomName}.`
}

/** A booked room you were asked to, or that you host, has opened. */
export function roomOpenMessage(roomName: string) {
  return `${roomName}${ROOM_OPEN_SUFFIX}`
}

/** The host took you out of a room, or banned you. Never names the host. */
export function roomRemovedMessage(roomName: string, banned: boolean) {
  return `${banned ? ROOM_BANNED_PREFIX : ROOM_REMOVED_PREFIX}${roomName}.`
}

/** Somebody you follow opened a public room. */
export function followedRoomMessage(hostName: string, roomName: string) {
  return `${hostName}${FOLLOWED_ROOM_INFIX}${roomName}.`
}

/**
 * The handles a chat line names with @, lowercased and without repeats.
 * Matched against the room's members by the caller, so text that only looks
 * like a handle names nobody.
 */
export function mentionedHandles(body: string) {
  const found = new Set<string>()
  for (const match of body.matchAll(/(?:^|[^a-z0-9_@-])@([a-z0-9_-]{3,30})/gi)) {
    found.add(match[1].toLowerCase())
  }
  return [...found]
}

/** The first words of a chat line, short enough for the line under a heading. */
export function linePreview(body: string) {
  const line = body.replace(/\s+/g, " ").trim()
  return line.length > 80 ? `${line.slice(0, 80)}...` : line
}

/** The sentence a cheer arrives as. */
export function cheerNoticeMessage(senderName: string) {
  return `${senderName}${CHEER_SUFFIX}`
}

/**
 * Somebody joined a group you own. `others` is how many more joined while the
 * notice sat unread, so four joins read as one line rather than four rows.
 */
export function groupJoinMessage(
  joinerName: string,
  others: number,
  groupName: string
) {
  return `${nameAndOthers(joinerName, others)}${GROUP_JOIN_INFIX}${groupName}.`
}

/** The owner took you out of a group. It never says who did. */
export function groupRemovedMessage(groupName: string) {
  return `${GROUP_REMOVED_PREFIX}${groupName}.`
}

/** Somebody you follow reached one of the streak milestones. */
export function followedStreakMessage(name: string, days: number) {
  return `${name} hit a ${days}-day streak.`
}

/** The badges one finished focus earned, as one line however many there are. */
export function badgeMessage(badgeNames: readonly string[]) {
  return badgeNames.length === 1
    ? `${BADGE_PREFIX}the ${badgeNames[0]} badge.`
    : `${BADGE_PREFIX}${badgeNames.length} badges.`
}

/** What a finished file is called in a notice. */
export type ReadyFile = "AI background" | "AI soundscape" | "upload"

export function mediaReadyMessage(file: ReadyFile) {
  return `Your ${file}${READY_SUFFIX}`
}

/**
 * A file that will not arrive. An AI request says the credit came back,
 * because that is the first thing somebody who paid for it wants to know.
 */
export function mediaFailedMessage(file: ReadyFile) {
  return file === "upload"
    ? "Your upload couldn't be prepared."
    : `Your ${file} couldn't be made.`
}

/** One credit left, or none, for one kind of AI generation this month. */
export function creditsLowMessage(
  kind: "background" | "soundscape",
  left: 0 | 1
) {
  return left === 1
    ? `1 AI ${kind} left this month.`
    : `No AI ${kind}s left this month.`
}

/**
 * The evening streak reminder: what is at stake and what keeps it, nothing
 * more. Only ever sent while the streak is alive and today is still empty.
 */
export function streakReminderMessage(days: number) {
  return `One session today keeps your ${days}-day streak.`
}

/** What a report in the queue is about, as the admins' notice names it. */
export type ReportedThing = "profile" | "message"

/**
 * A report landed in the queue. Never names the reporter or quotes what was
 * reported; the queue shows both. More while the notice is unread fold into
 * a count.
 */
export function reportNewMessage(thing: ReportedThing, reports: number) {
  if (reports > 1) return `${reports} new reports.`
  return `${REPORT_NEW_PREFIX}${thing === "profile" ? "a profile" : "a room message"}.`
}

/**
 * What a reporter hears once their report is closed. The same words whether
 * it was resolved or dismissed, on purpose: different words would tell the
 * reporter what happened to somebody else.
 */
export const REPORT_REVIEWED_MESSAGE = "Thanks, your report was reviewed."

/**
 * An admin changed or closed the host's room (admin task 04). It never says
 * which admin.
 */
const ROOM_CHANGED_PREFIX = "An admin "
export function roomChangedMessage(roomName: string, what: "changed" | "closed") {
  return `${ROOM_CHANGED_PREFIX}${what} your room ${roomName}.`
}

/**
 * Admin task 05. A warning's own words go in the notice's detail, under this
 * heading. A suspension names its end, or says it lasts until lifted.
 */
export const ADMIN_WARNING_MESSAGE = "You have a warning from the Pomoder team."
export const PROFILE_RESTORED_MESSAGE = "Your public profile is visible again."
const SUSPENDED_PREFIX = "You can't use rooms "
export function roomsSuspendedMessage(until: string | null) {
  return until ? `${SUSPENDED_PREFIX}until ${until}.` : `${SUSPENDED_PREFIX}for now.`
}

/**
 * Admin task 06. An admin changed your public profile's handle, name or bio,
 * put back a streak day, or deleted a group you were in. None says which admin.
 */
const PROFILE_EDITED_PREFIX = "The Pomoder team changed your public profile"
export function profileEditedMessage(fields: readonly string[]) {
  return `${PROFILE_EDITED_PREFIX}: ${fields.join(", ")}.`
}
const STREAK_RESTORED_PREFIX = "We restored "
const STREAK_RESTORED_SUFFIX = " to your streak."
export function streakRestoredMessage(day: string) {
  return `${STREAK_RESTORED_PREFIX}${day}${STREAK_RESTORED_SUFFIX}`
}
const GROUP_DELETED_PREFIX = "The Pomoder team deleted the group "
export function groupDeletedMessage(groupName: string) {
  return `${GROUP_DELETED_PREFIX}${groupName}.`
}

/** An operator hid your public profile. Never says who, or who reported it. */
export const PROFILE_HIDDEN_MESSAGE =
  "Your public profile has been hidden. See Settings for what to do."

/**
 * Which kind a notice is, from its own words, for the first paint of a row.
 *
 * The bell draws a row before the server has said anything about it, and a
 * row that changes shape a moment later reads as a flash. The sentences are
 * this app's own, written by the functions above, so reading them back is the
 * app recognising its own handwriting. The saved kind in
 * `pomodoro_notice_links` stays the truth: it decides the tab and the link a
 * moment later, so a name that happens to look like one of these sentences
 * can only ever change a row's first frame.
 */
export function noticeKindFromWords(notice: {
  type: string
  message: string | null
}): PomodoroNoticeKind | null {
  const message = notice.message
  if (notice.type !== "app_activity" || !message) return null
  if (message.includes(ROOM_JOIN_INFIX)) return "room_join"
  if (message.includes(ROOM_MENTION_INFIX)) return "room_mention"
  if (message.includes(ROOM_REACTION_INFIX)) return "room_reaction"
  if (message.includes(ROOM_INVITE_INFIX)) return "room_invite"
  if (
    message.startsWith(ROOM_REMOVED_PREFIX) ||
    message.startsWith(ROOM_BANNED_PREFIX)
  )
    return "room_removed"
  if (message.includes(FOLLOWED_ROOM_INFIX)) return "followed_room"
  if (message.endsWith(ROOM_OPEN_SUFFIX)) return "room_open"
  if (message.includes(ROOM_CHAT_INFIX) || ROOM_CHAT_FOLDED.test(message))
    return "room_chat"
  if (message.endsWith(CHEER_SUFFIX)) return "cheer"
  if (message.startsWith(GROUP_REMOVED_PREFIX)) return "group_removed"
  if (message.includes(GROUP_JOIN_INFIX)) return "group_join"
  if (STREAK_PATTERN.test(message)) return "followed_streak"
  if (CREDITS_PATTERN.test(message)) return "credits_low"
  if (message.startsWith(REPORT_NEW_PREFIX) || REPORTS_NEW_FOLDED.test(message))
    return "report_new"
  if (message === REPORT_REVIEWED_MESSAGE) return "report_reviewed"
  if (message === ADMIN_WARNING_MESSAGE) return "admin_warning"
  if (message === PROFILE_RESTORED_MESSAGE) return "profile_restored"
  if (message.startsWith(SUSPENDED_PREFIX)) return "rooms_suspended"
  if (message.startsWith(PROFILE_EDITED_PREFIX)) return "profile_edited"
  if (
    message.startsWith(STREAK_RESTORED_PREFIX) &&
    message.endsWith(STREAK_RESTORED_SUFFIX)
  )
    return "streak_restored"
  if (message.startsWith(GROUP_DELETED_PREFIX)) return "group_deleted"
  if (message.startsWith(ROOM_CHANGED_PREFIX) && message.includes(" your room "))
    return "room_changed"
  if (message === PROFILE_HIDDEN_MESSAGE) return "profile_hidden"
  if (STREAK_REMINDER_PATTERN.test(message)) return "streak_reminder"
  if (message.startsWith(BADGE_PREFIX)) return "badge"
  if (FAILED_PATTERN.test(message)) return "media_failed"
  if (message.startsWith("Your ") && message.endsWith(READY_SUFFIX))
    return "media_ready"
  return null
}
