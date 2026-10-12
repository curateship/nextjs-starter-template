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
  if (code.includes("GROUP_NOT_MEMBER"))
    return "You are not in that group."
  if (code.includes("GROUP_NOT_OWNER"))
    return "Only the person who made the group can do that."
  if (code.includes("GROUP_OWNER_CANNOT_LEAVE"))
    return "You made this group, so you cannot leave it. Delete it instead."
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
