import { randomBytes } from "node:crypto"
import { and, asc, eq, sql } from "drizzle-orm"

import {
  MAX_GROUPS_PER_PERSON,
  MAX_GROUP_MEMBERS,
} from "@/lib/pomodoro/groups"
import {
  leaderboardStartDate,
  type LeaderboardWindow,
} from "@/lib/pomodoro/leaderboard-windows"
import { groupRemovedMessage, noticeName } from "@/lib/pomodoro/notices"
import { db } from "@/server/db"
import { isBlockedBetween } from "@/server/pomodoro/blocks"
import { readLeaderboardRows } from "@/server/pomodoro/leaderboard"
import { localDateFor } from "@/server/pomodoro/productivity"
import { noteGroupJoin, writeNotices } from "@/server/pomodoro/notices"
import { loadOrCreateProfile } from "@/server/pomodoro/profile"
import {
  pomodoroGroupMembers,
  pomodoroGroups,
  pomodoroProfiles,
} from "@/server/pomodoro/schema"

/**
 * Private focus groups: making one, inviting into it, joining, leaving, and the
 * board of just that group.
 *
 * Every function here takes the acting account's id as its first argument and
 * proves that account's standing before it touches anything. None of them
 * trusts an id from the browser to say who is asking, and none of them hands a
 * user id back: a member is identified outwards by their membership row's own
 * uuid, which is what the owner's Remove button sends.
 *
 * Group membership is a separate opt-in from the global leaderboard. Nothing
 * here reads or writes `pomodoro_profiles.leaderboard_opt_in`, so joining a
 * group never lists anybody publicly, and somebody listed publicly is not in
 * any group because of it.
 */

/**
 * 32 bytes of randomness, written as 43 url-safe characters — the same secret
 * the streak badge's address uses, for the same reason: the link is the only
 * thing keeping strangers out of the group.
 */
function newJoinToken() {
  return randomBytes(32).toString("base64url")
}

/** How many groups this account is in, which the cap is counted from. */
async function countMemberships(userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pomodoroGroupMembers)
    .where(eq(pomodoroGroupMembers.userId, userId))
  return row?.count ?? 0
}

async function countMembers(groupId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pomodoroGroupMembers)
    .where(eq(pomodoroGroupMembers.groupId, groupId))
  return row?.count ?? 0
}

export type GroupSummary = {
  id: string
  name: string
  memberCount: number
  /** True when this account made the group, which is who may rename or delete it. */
  isOwner: boolean
  /**
   * The secret in the invite link. Every member gets it, because growing a
   * group is what a member does; only the owner can replace it, which is how a
   * leaked link is killed.
   */
  joinToken: string
}

/** Every group this account is in, oldest joined first. */
export async function listGroupsFor(userId: string): Promise<GroupSummary[]> {
  const rows = await db
    .select({
      id: pomodoroGroups.id,
      name: pomodoroGroups.name,
      ownerUserId: pomodoroGroups.ownerUserId,
      joinToken: pomodoroGroups.joinToken,
      memberCount: sql<number>`(
        select count(*)::int from ${pomodoroGroupMembers}
        where ${pomodoroGroupMembers.groupId} = ${pomodoroGroups.id}
      )`,
    })
    .from(pomodoroGroupMembers)
    .innerJoin(
      pomodoroGroups,
      eq(pomodoroGroups.id, pomodoroGroupMembers.groupId)
    )
    .where(eq(pomodoroGroupMembers.userId, userId))
    .orderBy(asc(pomodoroGroupMembers.joinedAt))

  return rows.map(({ ownerUserId, ...group }) => ({
    ...group,
    isOwner: ownerUserId === userId,
  }))
}

/**
 * Makes a group and puts its owner in it, in one transaction so a group can
 * never exist with nobody in it.
 */
export async function createGroupFor(userId: string, name: string) {
  if ((await countMemberships(userId)) >= MAX_GROUPS_PER_PERSON)
    throw new Error("GROUP_LIMIT_REACHED")

  return db.transaction(async (tx) => {
    const [group] = await tx
      .insert(pomodoroGroups)
      .values({ ownerUserId: userId, name, joinToken: newJoinToken() })
      .returning({ id: pomodoroGroups.id })
    await tx
      .insert(pomodoroGroupMembers)
      .values({ groupId: group.id, userId })
    return group.id
  })
}

/** Replaces the invite link's secret, which stops the old link working. */
export async function resetGroupInvite(userId: string, groupId: string) {
  const token = newJoinToken()
  const [updated] = await db
    .update(pomodoroGroups)
    .set({ joinToken: token, updatedAt: new Date() })
    .where(
      and(eq(pomodoroGroups.id, groupId), eq(pomodoroGroups.ownerUserId, userId))
    )
    .returning({ joinToken: pomodoroGroups.joinToken })
  // One answer for "not your group" and "no such group": an owner check that
  // says which is which tells a stranger the group exists.
  if (!updated) throw new Error("GROUP_NOT_OWNER")
  return updated.joinToken
}

/** What an invite link points at, before anybody commits to following it. */
export async function lookupGroupInvite(token: string) {
  const [group] = await db
    .select({ id: pomodoroGroups.id, name: pomodoroGroups.name })
    .from(pomodoroGroups)
    .where(eq(pomodoroGroups.joinToken, token))
    .limit(1)
  if (!group) throw new Error("GROUP_NOT_FOUND")
  return { id: group.id, name: group.name, memberCount: await countMembers(group.id) }
}

/**
 * Follows an invite link.
 *
 * Both caps are checked before the insert, and the insert itself drops a repeat
 * on the unique pair, so following the same link twice ends up in the group
 * once rather than failing at a person.
 */
export async function joinGroupByToken(userId: string, token: string) {
  const [group] = await db
    .select({
      id: pomodoroGroups.id,
      name: pomodoroGroups.name,
      ownerUserId: pomodoroGroups.ownerUserId,
    })
    .from(pomodoroGroups)
    .where(eq(pomodoroGroups.joinToken, token))
    .limit(1)
  if (!group) throw new Error("GROUP_NOT_FOUND")

  const [existing] = await db
    .select({ id: pomodoroGroupMembers.id })
    .from(pomodoroGroupMembers)
    .where(
      and(
        eq(pomodoroGroupMembers.groupId, group.id),
        eq(pomodoroGroupMembers.userId, userId)
      )
    )
    .limit(1)
  if (existing) return { id: group.id, name: group.name }

  if ((await countMemberships(userId)) >= MAX_GROUPS_PER_PERSON)
    throw new Error("GROUP_LIMIT_REACHED")
  if ((await countMembers(group.id)) >= MAX_GROUP_MEMBERS)
    throw new Error("GROUP_FULL")

  // Read before the transaction, not inside it: a read on the shared handle
  // from inside a transaction waits on a second connection.
  const tellOwner =
    group.ownerUserId !== userId &&
    !(await isBlockedBetween(group.ownerUserId, userId))

  // The join and the owner's notice commit together. A repeat that the unique
  // pair drops is not a join, so it tells nobody.
  await db.transaction(async (tx) => {
    const [joined] = await tx
      .insert(pomodoroGroupMembers)
      .values({ groupId: group.id, userId })
      .onConflictDoNothing()
      .returning({ id: pomodoroGroupMembers.id })
    if (!joined || !tellOwner) return
    const [joiner] = await tx
      .select({
        publicDisplayName: pomodoroProfiles.publicDisplayName,
        handle: pomodoroProfiles.handle,
      })
      .from(pomodoroProfiles)
      .where(eq(pomodoroProfiles.userId, userId))
      .limit(1)
    await noteGroupJoin(tx, {
      ownerUserId: group.ownerUserId,
      joinerUserId: userId,
      joinerName: noticeName(
        joiner ?? { publicDisplayName: null, handle: null }
      ),
      groupId: group.id,
      groupName: group.name,
    })
  })
  return { id: group.id, name: group.name }
}

/**
 * Leaves a group, which is what takes you off its board.
 *
 * The owner cannot leave. A group with no owner has nobody who can replace a
 * leaked link, so the owner deletes it instead, which is a different button
 * with a different question attached.
 */
export async function leaveGroup(userId: string, groupId: string) {
  const [group] = await db
    .select({ ownerUserId: pomodoroGroups.ownerUserId })
    .from(pomodoroGroups)
    .where(eq(pomodoroGroups.id, groupId))
    .limit(1)
  if (!group) throw new Error("GROUP_NOT_FOUND")
  if (group.ownerUserId === userId) throw new Error("GROUP_OWNER_CANNOT_LEAVE")

  const removed = await db
    .delete(pomodoroGroupMembers)
    .where(
      and(
        eq(pomodoroGroupMembers.groupId, groupId),
        eq(pomodoroGroupMembers.userId, userId)
      )
    )
    .returning({ id: pomodoroGroupMembers.id })
  if (removed.length === 0) throw new Error("GROUP_NOT_MEMBER")
}

/**
 * The owner takes somebody out of the group.
 *
 * The person is named by their membership row's uuid, never by a user id: ids
 * never leave the server, so there is no id for a browser to send back. The
 * owner's own row is refused, because leaving is the delete button's job.
 */
export async function removeGroupMember(
  userId: string,
  groupId: string,
  membershipId: string
) {
  const [group] = await db
    .select({ ownerUserId: pomodoroGroups.ownerUserId, name: pomodoroGroups.name })
    .from(pomodoroGroups)
    .where(eq(pomodoroGroups.id, groupId))
    .limit(1)
  if (!group || group.ownerUserId !== userId) throw new Error("GROUP_NOT_OWNER")

  const membership = and(
    eq(pomodoroGroupMembers.id, membershipId),
    eq(pomodoroGroupMembers.groupId, groupId),
    // The owner is not removable, only the group is deletable.
    sql`${pomodoroGroupMembers.userId} <> ${userId}`
  )
  // Who is being removed, and whether a block stands between them, read
  // before the transaction so nothing inside it waits on a second connection.
  const [target] = await db
    .select({ userId: pomodoroGroupMembers.userId })
    .from(pomodoroGroupMembers)
    .where(membership)
    .limit(1)
  if (!target) throw new Error("GROUP_NOT_MEMBER")
  const tellThem = !(await isBlockedBetween(userId, target.userId))

  await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(pomodoroGroupMembers)
      .where(membership)
      .returning({ userId: pomodoroGroupMembers.userId })
    if (!removed) throw new Error("GROUP_NOT_MEMBER")
    // The removed person is told, so a board that vanished does not look like
    // a fault. The notice names the group and never the owner.
    if (!tellThem) return
    await writeNotices(tx, [
      {
        recipientUserId: removed.userId,
        kind: "group_removed",
        message: groupRemovedMessage(group.name),
        groupId,
      },
    ])
  })
}

/** The owner deletes the group. Its memberships go with it, by the cascade. */
export async function deleteGroup(userId: string, groupId: string) {
  const removed = await db
    .delete(pomodoroGroups)
    .where(
      and(eq(pomodoroGroups.id, groupId), eq(pomodoroGroups.ownerUserId, userId))
    )
    .returning({ id: pomodoroGroups.id })
  if (removed.length === 0) throw new Error("GROUP_NOT_OWNER")
}

/** Everyone in the group, for the owner's manage window. */
export async function listGroupMembers(userId: string, groupId: string) {
  await requireMembership(userId, groupId)
  const rows = await db
    .select({
      membershipId: pomodoroGroupMembers.id,
      memberUserId: pomodoroGroupMembers.userId,
      joinedAt: pomodoroGroupMembers.joinedAt,
      name: pomodoroProfiles.publicDisplayName,
      ownerUserId: pomodoroGroups.ownerUserId,
    })
    .from(pomodoroGroupMembers)
    .innerJoin(
      pomodoroGroups,
      eq(pomodoroGroups.id, pomodoroGroupMembers.groupId)
    )
    .leftJoin(
      pomodoroProfiles,
      eq(pomodoroProfiles.userId, pomodoroGroupMembers.userId)
    )
    .where(eq(pomodoroGroupMembers.groupId, groupId))
    .orderBy(asc(pomodoroGroupMembers.joinedAt))

  return rows.map((row) => ({
    membershipId: row.membershipId,
    // A member with no public display name is in the group but not on its
    // board, and the window says so rather than showing an empty line.
    name: row.name,
    joinedAt: row.joinedAt,
    isOwner: row.memberUserId === row.ownerUserId,
    isYou: row.memberUserId === userId,
  }))
}

async function requireMembership(userId: string, groupId: string) {
  const [membership] = await db
    .select({ id: pomodoroGroupMembers.id })
    .from(pomodoroGroupMembers)
    .where(
      and(
        eq(pomodoroGroupMembers.groupId, groupId),
        eq(pomodoroGroupMembers.userId, userId)
      )
    )
    .limit(1)
  if (!membership) throw new Error("GROUP_NOT_MEMBER")
}

/**
 * The board of one group over one window.
 *
 * Membership is proved first, so holding a group's id is not enough to read who
 * is in it. The ranking itself is the global board's query with a group filter,
 * so the two can never disagree about a figure.
 */
export async function readGroupBoard({
  userId,
  groupId,
  window,
  timezone,
}: {
  userId: string
  groupId: string
  window: LeaderboardWindow
  timezone: string
}) {
  await requireMembership(userId, groupId)
  const profile = await loadOrCreateProfile(userId, timezone)
  const today = localDateFor(profile.timezone)
  const start = leaderboardStartDate(window, today)
  return {
    start,
    today,
    leaders: await readLeaderboardRows({
      start,
      viewerUserId: userId,
      groupId,
    }),
  }
}
