/**
 * The limits and the wording for private focus groups.
 *
 * Shared by the browser and the server. The server enforces every number here;
 * the browser uses the same ones so a box stops accepting before a save is
 * refused.
 */

import { PRO_PERKS } from "@/lib/pomodoro/pro"

/**
 * How many groups one person may be in, their own included.
 *
 * Five, Tyler's call on 29 Sep 2026. The cap is what keeps a group board worth
 * looking at: a person in thirty groups is back on a leaderboard they scroll.
 */
export const MAX_GROUPS_PER_PERSON = 5

/**
 * How many people one group holds.
 *
 * A private group is where competition works because everyone on the board is
 * someone you know. Fifty is well past that and still bounds what one board
 * reads.
 */
export const MAX_GROUP_MEMBERS = 50

export const MIN_GROUP_NAME_LENGTH = 2
export const MAX_GROUP_NAME_LENGTH = 60

/** The owner's line under the group's name (groups task 01, part 5). */
export const MAX_GROUP_DESCRIPTION_LENGTH = 120

/**
 * How long an invite link keeps working (part 8). "week" stops it 7 days
 * after it is set, "ten" after ten more joins. New link starts the same
 * choice again.
 */
export const GROUP_LINK_LIFETIMES = ["never", "week", "ten"] as const
export type GroupLinkLifetime = (typeof GROUP_LINK_LIFETIMES)[number]
export const GROUP_LINK_LIFETIME_LABELS: Record<GroupLinkLifetime, string> = {
  never: "Never",
  week: "After 7 days",
  ten: "After 10 joins",
}
export const GROUP_LINK_DAYS = 7
export const GROUP_LINK_JOINS = 10

/** Invites one person may send in the bell in a day (part 7). */
export const GROUP_INVITES_PER_DAY = 20

/** The weekly goal's limits, in whole hours (part 18). */
export const MIN_GROUP_GOAL_HOURS = 1
export const MAX_GROUP_GOAL_HOURS = 1000

/** Combined hours a group celebrates reaching (part 22). */
export const GROUP_MILESTONE_HOURS = [10, 50, 100, 500, 1000] as const

/** How many finished weeks the Past weeks panel lists (part 21). */
export const GROUP_PAST_WEEKS = 8

/** What decides a group board's order (part 17). Hours is the default. */
export const GROUP_BOARD_ORDERS = ["hours", "sessions", "days"] as const
export type GroupBoardOrder = (typeof GROUP_BOARD_ORDERS)[number]
export const GROUP_BOARD_ORDER_LABELS: Record<GroupBoardOrder, string> = {
  hours: "Hours",
  sessions: "Sessions",
  days: "Days",
}

/**
 * The owner's Activity panel, one line per thing that happened (part 23).
 * `name` is the person, or the new name for a rename.
 */
export const GROUP_EVENT_KINDS = [
  "joined",
  "left",
  "removed",
  "kept_out",
  "let_back_in",
  "renamed",
  "new_link",
  "paused",
  "unpaused",
  "handed_over",
] as const
export type GroupEventKind = (typeof GROUP_EVENT_KINDS)[number]

/** How many lines the Activity panel keeps per group. */
export const GROUP_EVENTS_KEPT = 50

export function groupEventLine(kind: string, name: string | null) {
  const who = name ?? "Somebody"
  switch (kind as GroupEventKind) {
    case "joined":
      return `${who} joined.`
    case "left":
      return `${who} left.`
    case "removed":
      return `${who} was removed.`
    case "kept_out":
      return `${who} was removed and kept out.`
    case "let_back_in":
      return `${who} was let back in.`
    case "renamed":
      return name ? `The group was renamed ${name}.` : "The group was renamed."
    case "new_link":
      return "A new invite link was made."
    case "paused":
      return "The invite link was paused."
    case "unpaused":
      return "The invite link was switched back on."
    case "handed_over":
      return `The group was handed to ${who}.`
    default:
      return "Something changed."
  }
}

/** How long an invite link's secret is, as `randomBytes(32).toString("base64url")` writes it. */
export const GROUP_JOIN_TOKEN_LENGTH = 43

/** The address an invite link points at. */
export function groupInviteLink(origin: string, token: string) {
  return `${origin}/groups/join/${token}`
}

/**
 * What each refusal from the groups endpoints says to a person.
 * The team page's settings share it, because they sit beside the group on Groups.
 *
 * The server throws a bare code so no endpoint ever writes a sentence; this
 * turns the code into one. An unknown code gets the general line rather than
 * the code itself, which would show a stranger the app's internals.
 */
export function groupErrorMessage(cause: unknown) {
  const code = cause instanceof Error ? cause.message : ""
  if (code.includes("GROUP_LIMIT_REACHED"))
    return `You are already in ${MAX_GROUPS_PER_PERSON} groups, which is the most one account may hold. Leave one to join another.`
  if (code.includes("GROUP_FULL"))
    return `That group is full at ${MAX_GROUP_MEMBERS} people.`
  if (code.includes("GROUP_NOT_FOUND"))
    return "That invite link does not point at a group any more. Ask for a new one."
  if (code.includes("GROUP_JOINS_PAUSED"))
    return "That group isn't taking new people right now."
  if (code.includes("GROUP_INVITE_LIMIT"))
    return `You can send ${GROUP_INVITES_PER_DAY} invites a day. Try again tomorrow.`
  if (code.includes("GROUP_INVITE_GONE"))
    return "That invite isn't there any more."
  if (code.includes("GROUP_REQUEST_GONE"))
    return "That request isn't waiting any more."
  if (code.includes("GROUP_TIMEZONE"))
    return "That timezone isn't one this app knows."
  if (code.includes("GROUP_ROOM_MEMBERS_ONLY"))
    return "Only the group's members can join that room."
  if (code.includes("GROUP_NOT_MEMBER"))
    return "You are not in that group."
  if (code.includes("GROUP_NOT_OWNER"))
    return "Only the group's owner can do that."
  if (code.includes("GROUP_OWNER_CANNOT_LEAVE"))
    return "You own this group, so you cannot leave it. Hand it to somebody else first, or delete it."
  if (code.includes("TEAM_HANDLE_SHAPE"))
    return "A page address is 3 to 30 characters: lowercase letters, digits, hyphens and underscores, and not a word the app keeps for itself."
  if (code.includes("TEAM_HANDLE_NEEDED"))
    return "Pick an address for the page before switching it on."
  if (code.includes("TEAM_HANDLE_TAKEN"))
    return "Another group already has that address. Pick another one."
  if (code.includes("UPGRADE_REQUIRED:teamPage"))
    return PRO_PERKS.teamPage.lockedReason
  return "That did not work. Try again in a moment."
}
