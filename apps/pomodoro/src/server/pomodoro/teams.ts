import { and, eq, sql } from "drizzle-orm"

import {
  LEADERBOARD_WINDOWS,
  leaderboardStartDate,
  type LeaderboardWindow,
} from "@/lib/pomodoro/leaderboard-windows"
import { isHandleAvailableShape } from "@/lib/pomodoro/public-profile"
import { db } from "@/server/db"
import { blockedUserIdsFor } from "@/server/pomodoro/blocks"
import {
  loadPomodoroEntitlements,
  requirePomodoroPerk,
} from "@/server/pomodoro/entitlements"
import {
  readLeaderboardRows,
  type LeaderboardRow,
} from "@/server/pomodoro/leaderboard"
import { localDateFor } from "@/server/pomodoro/productivity"
import {
  pomodoroGroupMembers,
  pomodoroGroups,
  pomodoroProfiles,
} from "@/server/pomodoro/schema"

/**
 * A focus group's public page, `/team/<handle>` (public profile task 05).
 *
 * Tyler's calls on 12 Oct 2026: a team is a focus group whose owner switched a
 * public page on, not a new kind of thing; only an owner on Pro can; and the
 * page shows only what each member already publishes on their own profile,
 * with no exception for the owner.
 *
 * So a member appears in one of three ways, decided by their own switches:
 *
 * - **Ranked with hours** when their public page reads and its "Hours and
 *   streaks" switch is on. The figures are the leaderboard query filtered to
 *   them, so they match the person's own page.
 * - **Named with no figures** when their public page reads but hours are off.
 * - **Counted, never named** when they have no public page. Naming them would
 *   publish a name they never chose to publish.
 *
 * The page is the same for every reader and is held for 30 seconds, so a
 * visit costs nothing once held and a fresh build costs a fixed handful of
 * queries however many people are in the group. User ids are held beside the
 * page for the block check and never leave this file.
 */

const TEAM_CACHE_MS = 30_000
const CACHE_LIMIT = 500

/** A member with a public page, as the team page draws them. */
type TeamPageMember = {
  name: string
  handle: string
}

export type TeamPageView = {
  name: string
  handle: string
  memberCount: number
  /** Members with no public page. Counted so the total adds up, never named. */
  unnamedCount: number
  /** Each window's ranking of the members who publish their hours. */
  boards: Record<LeaderboardWindow, LeaderboardRow[]>
  /** Members whose public page reads but whose hours are switched off. */
  quiet: TeamPageMember[]
  isOwner: boolean
  /** The group's id, only for its owner, so Edit can open the right group. */
  groupId: string | null
}

type HeldTeam = {
  view: Omit<TeamPageView, "isOwner" | "groupId"> | null
  groupId: string | null
  ownerUserId: string | null
  /** Handle to account, for blocks and "You". Never returned. */
  userIdByHandle: Map<string, string>
}

const teamCache = new Map<string, { value: HeldTeam; expiresAt: number }>()
/**
 * Moves on every clear. A build that started before a clear read the old
 * members and switches, so it is handed to its own reader but never held,
 * or somebody who just left would stay on the page for 30 seconds.
 */
let cacheGeneration = 0

/**
 * Drops every held team page. Called when anybody joins, leaves or is taken
 * out of a group, when a group or its page changes, and when a member saves
 * their own public page, so a switch turned off is gone from every team page
 * on the next request. Membership and profile saves are rare, and one map
 * clear is cheaper than working out which teams a person is in.
 */
export function forgetTeamPages() {
  cacheGeneration += 1
  teamCache.clear()
}

/**
 * The team page for one handle as one reader sees it, or null.
 *
 * Null covers a handle that is not handle-shaped, one nobody holds, a page
 * switched off, and an owner no longer on Pro, so nobody can tell from the
 * answer which it was.
 */
export async function readTeamPage(
  handle: string,
  viewerUserId: string | null,
  now = Date.now()
): Promise<TeamPageView | null> {
  if (!isHandleAvailableShape(handle)) return null

  let held = teamCache.get(handle)
  if (!held || held.expiresAt <= now) {
    const generation = cacheGeneration
    const value = await buildTeamPage(handle, new Date(now))
    held = { value, expiresAt: now + TEAM_CACHE_MS }
    if (generation === cacheGeneration) {
      if (teamCache.size >= CACHE_LIMIT) {
        const oldest = teamCache.keys().next()
        if (!oldest.done) teamCache.delete(oldest.value)
      }
      teamCache.set(handle, held)
    }
  }
  const { view, groupId, ownerUserId, userIdByHandle } = held.value
  if (!view) return null

  // A signed-out reader has blocked nobody, so the common path asks nothing.
  const blocked = viewerUserId
    ? await blockedUserIdsFor(viewerUserId)
    : new Set<string>()
  const visible = (memberHandle: string | null) => {
    const userId = memberHandle ? userIdByHandle.get(memberHandle) : undefined
    return !userId || !blocked.has(userId)
  }

  const boards = Object.fromEntries(
    LEADERBOARD_WINDOWS.map((window) => [
      window,
      view.boards[window].filter((row) => visible(row.handle)).map((row) => ({
        ...row,
        isYou:
          viewerUserId !== null &&
          row.handle !== null &&
          userIdByHandle.get(row.handle) === viewerUserId,
      })),
    ])
  ) as Record<LeaderboardWindow, LeaderboardRow[]>

  const isOwner = viewerUserId !== null && viewerUserId === ownerUserId
  return {
    ...view,
    boards,
    quiet: view.quiet.filter((member) => visible(member.handle)),
    isOwner,
    groupId: isOwner ? groupId : null,
  }
}

async function buildTeamPage(handle: string, now: Date): Promise<HeldTeam> {
  const nothing: HeldTeam = {
    view: null,
    groupId: null,
    ownerUserId: null,
    userIdByHandle: new Map(),
  }
  const [group] = await db
    .select({
      id: pomodoroGroups.id,
      name: pomodoroGroups.name,
      ownerUserId: pomodoroGroups.ownerUserId,
    })
    .from(pomodoroGroups)
    .where(
      and(eq(pomodoroGroups.handle, handle), eq(pomodoroGroups.pagePublic, true))
    )
    .limit(1)
  if (!group) return nothing

  // One day for everybody, because the page is one page for everybody. A
  // reader's own timezone would make the held copy wrong for the next reader.
  const today = localDateFor("UTC", now)

  const [entitlements, roster, ...windowBoards] = await Promise.all([
    loadPomodoroEntitlements(group.ownerUserId),
    readRoster(group.id),
    ...LEADERBOARD_WINDOWS.map((window) =>
      readLeaderboardRows({
        start: leaderboardStartDate(window, today),
        viewerUserId: null,
        teamGroupId: group.id,
      })
    ),
  ])
  // A lapsed plan turns the page off without touching the owner's switch, so
  // paying again brings back exactly what they had.
  if (!entitlements.canPublishTeamPage) return nothing

  const userIdByHandle = new Map<string, string>()
  const nameByHandle = new Map<string, string>()
  let unnamedCount = 0
  for (const member of roster) {
    if (!member.publicHandle) {
      unnamedCount += 1
      continue
    }
    userIdByHandle.set(member.publicHandle, member.userId)
    // The same name the person's own page shows.
    nameByHandle.set(
      member.publicHandle,
      member.displayName?.trim() || member.publicHandle
    )
  }

  const boards = Object.fromEntries(
    LEADERBOARD_WINDOWS.map((window, index) => [
      window,
      windowBoards[index].map((row) => ({
        ...row,
        name: (row.handle && nameByHandle.get(row.handle)) ?? row.name,
      })),
    ])
  ) as Record<LeaderboardWindow, LeaderboardRow[]>

  // Ranked members publish their hours; everybody else with a page is quiet.
  const ranked = new Set(boards.all.map((row) => row.handle))
  const quiet = roster
    .filter(
      (member) => member.publicHandle && !ranked.has(member.publicHandle)
    )
    .map((member) => ({
      name: nameByHandle.get(member.publicHandle!)!,
      handle: member.publicHandle!,
    }))

  return {
    groupId: group.id,
    ownerUserId: group.ownerUserId,
    userIdByHandle,
    view: {
      name: group.name,
      handle,
      memberCount: roster.length,
      unnamedCount,
      boards,
      quiet,
    },
  }
}

/**
 * Everybody in the group in one query, with a handle only when their public
 * page actually reads, so a switched-off or hidden profile is never named.
 */
function readRoster(groupId: string) {
  return db
    .select({
      userId: pomodoroGroupMembers.userId,
      displayName: pomodoroProfiles.publicDisplayName,
      publicHandle: sql<string | null>`case
        when ${pomodoroProfiles.profilePublic} and ${pomodoroProfiles.hiddenAt} is null
        then ${pomodoroProfiles.handle} end`,
    })
    .from(pomodoroGroupMembers)
    .leftJoin(
      pomodoroProfiles,
      eq(pomodoroProfiles.userId, pomodoroGroupMembers.userId)
    )
    .where(eq(pomodoroGroupMembers.groupId, groupId))
    .orderBy(pomodoroGroupMembers.joinedAt)
}

export type TeamPageSettings = {
  handle: string | null
  pagePublic: boolean
  /** Whether the owner's plan lets them switch the page on. */
  canPublish: boolean
}

/** The owner's own view of the page's two settings. */
export async function loadTeamPageSettings(
  userId: string,
  groupId: string
): Promise<TeamPageSettings> {
  const [[group], entitlements] = await Promise.all([
    db
      .select({
        handle: pomodoroGroups.handle,
        pagePublic: pomodoroGroups.pagePublic,
      })
      .from(pomodoroGroups)
      .where(
        and(
          eq(pomodoroGroups.id, groupId),
          eq(pomodoroGroups.ownerUserId, userId)
        )
      )
      .limit(1),
    loadPomodoroEntitlements(userId),
  ])
  // One answer for "not your group" and "no such group", as everywhere else.
  if (!group) throw new Error("GROUP_NOT_OWNER")
  return { ...group, canPublish: entitlements.canPublishTeamPage }
}

/**
 * Saves the page's address and switch.
 *
 * Switching on needs an address and Pro. Switching off and changing the
 * address of a page that is off need neither, so a lapsed owner can always
 * take the page down.
 */
export async function saveTeamPageSettings(
  userId: string,
  groupId: string,
  changes: { handle: string | null; pagePublic: boolean }
): Promise<TeamPageSettings> {
  const handle = changes.handle?.trim().toLowerCase() || null
  if (handle && !isHandleAvailableShape(handle))
    throw new Error("TEAM_HANDLE_SHAPE")
  if (changes.pagePublic && !handle) throw new Error("TEAM_HANDLE_NEEDED")
  const entitlements = changes.pagePublic
    ? await requirePomodoroPerk(userId, "teamPage")
    : await loadPomodoroEntitlements(userId)

  let saved
  try {
    ;[saved] = await db
      .update(pomodoroGroups)
      .set({ handle, pagePublic: changes.pagePublic, updatedAt: new Date() })
      .where(
        and(
          eq(pomodoroGroups.id, groupId),
          eq(pomodoroGroups.ownerUserId, userId)
        )
      )
      .returning({
        handle: pomodoroGroups.handle,
        pagePublic: pomodoroGroups.pagePublic,
      })
  } catch (error) {
    if (isDuplicateTeamHandle(error)) throw new Error("TEAM_HANDLE_TAKEN")
    throw error
  }
  if (!saved) throw new Error("GROUP_NOT_OWNER")
  forgetTeamPages()
  return { ...saved, canPublish: entitlements.canPublishTeamPage }
}

/**
 * The unique index on the handle refusing a second group the same word. The
 * same walk as `isDuplicateHandle` in `public-profile.ts`, kept here because
 * that file imports this one.
 */
function isDuplicateTeamHandle(error: unknown) {
  for (let step: unknown = error, depth = 0; step && depth < 5; depth += 1) {
    if (typeof step !== "object") return false
    if ((step as { code?: string }).code === "23505") return true
    step = (step as { cause?: unknown }).cause
  }
  return false
}
