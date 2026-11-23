import { randomBytes } from "node:crypto"
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  notInArray,
  sql,
} from "drizzle-orm"

import {
  GROUP_EVENTS_KEPT,
  GROUP_INVITES_PER_DAY,
  GROUP_LINK_DAYS,
  GROUP_LINK_JOINS,
  MAX_GROUPS_PER_PERSON,
  MAX_GROUP_MEMBERS,
  type GroupEventKind,
  type GroupLinkLifetime,
} from "@/lib/pomodoro/groups"
import {
  groupAnswerMessage,
  groupInviteMessage,
  groupOwnerMessage,
  groupRemovedMessage,
  groupRequestMessage,
  noticeName,
} from "@/lib/pomodoro/notices"
import { db, type CustomShellDb } from "@/server/db"
import { blockedUserIdsFor, isBlockedBetween } from "@/server/pomodoro/blocks"
import {
  foldNotice,
  noteGroupJoin,
  writeNotices,
} from "@/server/pomodoro/notices"
import { forgetTeamPages } from "@/server/pomodoro/teams"
import {
  pomodoroFollows,
  pomodoroGroupBans,
  pomodoroGroupEvents,
  pomodoroGroupInvites,
  pomodoroGroupMembers,
  pomodoroGroupRequests,
  pomodoroGroups,
  pomodoroNoticeLinks,
  pomodoroProfiles,
  pomodoroRoomRepeats,
} from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"

/**
 * Private focus groups: making one, running it, inviting into it, joining,
 * leaving, and who is in it. The boards and scores are in `group-scores.ts`.
 *
 * Every function here takes the acting account's id as its first argument and
 * proves that account's standing before it touches anything. None of them
 * trusts an id from the browser to say who is asking, and none of them hands a
 * user id back: a person is identified outwards by the uuid of their
 * membership, request, ban or follow row, which is what the browser sends back.
 *
 * Group membership is a separate opt-in from the global leaderboard. Nothing
 * here reads or writes `pomodoro_profiles.leaderboard_opt_in`, so joining a
 * group never lists anybody publicly, and somebody listed publicly is not in
 * any group because of it.
 */

type Tx = Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]
type Database = CustomShellDb | Tx

/**
 * 32 bytes of randomness, written as 43 url-safe characters — the same secret
 * the streak badge's address uses, for the same reason: the link is the only
 * thing keeping strangers out of the group.
 */
function newJoinToken() {
  return randomBytes(32).toString("base64url")
}

/** How many groups this account is in, which the cap is counted from. */
async function countMemberships(userId: string, database: Database = db) {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(pomodoroGroupMembers)
    .where(eq(pomodoroGroupMembers.userId, userId))
  return row?.count ?? 0
}

async function countMembers(groupId: string, database: Database = db) {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(pomodoroGroupMembers)
    .where(eq(pomodoroGroupMembers.groupId, groupId))
  return row?.count ?? 0
}

/** The words a person is called by in a notice or an activity line. */
async function nameOf(userId: string, database: Database = db) {
  const [profile] = await database
    .select({
      publicDisplayName: pomodoroProfiles.publicDisplayName,
      handle: pomodoroProfiles.handle,
    })
    .from(pomodoroProfiles)
    .where(eq(pomodoroProfiles.userId, userId))
    .limit(1)
  return noticeName(profile ?? { publicDisplayName: null, handle: null })
}

/**
 * The group, when this account owns it. "Not your group" and "no such
 * group" are the one answer, because an owner check that said which was
 * which would tell a stranger the group exists.
 */
async function requireOwnedGroup(userId: string, groupId: string) {
  const [group] = await db
    .select()
    .from(pomodoroGroups)
    .where(
      and(eq(pomodoroGroups.id, groupId), eq(pomodoroGroups.ownerUserId, userId))
    )
    .limit(1)
  if (!group) throw new Error("GROUP_NOT_OWNER")
  return group
}

export async function requireMembership(userId: string, groupId: string) {
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
 * One line on the owner's Activity panel, written in the transaction of the
 * thing it describes. Only the newest `GROUP_EVENTS_KEPT` are kept, so the
 * table stops growing for a busy group.
 */
async function logGroupEvent(
  database: Database,
  groupId: string,
  kind: GroupEventKind,
  name: string | null = null
) {
  await database.insert(pomodoroGroupEvents).values({ groupId, kind, name })
  await database.execute(sql`
    delete from ${pomodoroGroupEvents}
    where ${pomodoroGroupEvents.groupId} = ${groupId}
      and ${pomodoroGroupEvents.id} not in (
        select ${pomodoroGroupEvents.id} from ${pomodoroGroupEvents}
        where ${pomodoroGroupEvents.groupId} = ${groupId}
        order by ${pomodoroGroupEvents.createdAt} desc
        limit ${GROUP_EVENTS_KEPT}
      )`)
}

/** Whether the link has run out of days or joins (part 8). */
function linkRunOut(group: {
  linkExpiresAt: Date | null
  linkJoinsLeft: number | null
}) {
  return (
    (group.linkExpiresAt !== null && group.linkExpiresAt <= new Date()) ||
    group.linkJoinsLeft === 0
  )
}

/** Which of the three choices the stored columns stand for. */
function lifetimeOf(group: {
  linkExpiresAt: Date | null
  linkJoinsLeft: number | null
}): GroupLinkLifetime {
  if (group.linkExpiresAt !== null) return "week"
  if (group.linkJoinsLeft !== null) return "ten"
  return "never"
}

/** The columns a lifetime choice writes, starting it from now. */
function lifetimeColumns(lifetime: GroupLinkLifetime) {
  return {
    linkExpiresAt:
      lifetime === "week"
        ? new Date(Date.now() + GROUP_LINK_DAYS * 24 * 60 * 60_000)
        : null,
    linkJoinsLeft: lifetime === "ten" ? GROUP_LINK_JOINS : null,
  }
}

export type GroupSummary = {
  id: string
  name: string
  /** The owner's line under the name, or null (part 5). */
  description: string | null
  memberCount: number
  /** True when this account owns the group, which is who may run it. */
  isOwner: boolean
  /**
   * The secret in the invite link. Every member gets it, because growing a
   * group is what a member does; only the owner can replace it, which is how a
   * leaked link is killed.
   */
  joinToken: string
  /**
   * The group's public page address while its page is switched on, so every
   * member can see that the group has one. Null when it has none.
   */
  teamHandle: string | null
  joinsPaused: boolean
  approveJoins: boolean
  linkLifetime: GroupLinkLifetime
  linkExpiresAt: Date | null
  linkJoinsLeft: number | null
  /** False once the link ran out of days or joins, or while it is paused. */
  linkWorking: boolean
  /** The timezone the board counts days in, the owner's own until picked. */
  timezone: string
  weeklyGoalHours: number | null
  /** Requests waiting for the owner. Always 0 for anybody else. */
  waitingCount: number
  /** The owner books a weekly room for this group (part 12). */
  ownerHasWeeklyRoom: boolean
}

/** Every group this account is in, oldest joined first. */
export async function listGroupsFor(userId: string): Promise<GroupSummary[]> {
  const rows = await db
    .select({
      id: pomodoroGroups.id,
      name: pomodoroGroups.name,
      description: pomodoroGroups.description,
      ownerUserId: pomodoroGroups.ownerUserId,
      joinToken: pomodoroGroups.joinToken,
      teamHandle: sql<string | null>`case
        when ${pomodoroGroups.pagePublic} then ${pomodoroGroups.handle} end`,
      memberCount: sql<number>`(
        select count(*)::int from ${pomodoroGroupMembers}
        where ${pomodoroGroupMembers.groupId} = ${pomodoroGroups.id}
      )`,
      waitingCount: sql<number>`(
        select count(*)::int from ${pomodoroGroupRequests}
        where ${pomodoroGroupRequests.groupId} = ${pomodoroGroups.id}
      )`,
      ownerHasWeeklyRoom: sql<boolean>`exists (
        select 1 from ${pomodoroRoomRepeats}
        where ${pomodoroRoomRepeats.groupId} = ${pomodoroGroups.id}
          and ${pomodoroRoomRepeats.cancelledAt} is null
          and ${pomodoroRoomRepeats.hostUserId} = ${pomodoroGroups.ownerUserId}
      )`,
      ownerTimezone: sql<string | null>`(
        select ${pomodoroProfiles.timezone} from ${pomodoroProfiles}
        where ${pomodoroProfiles.userId} = ${pomodoroGroups.ownerUserId}
      )`,
      timezone: pomodoroGroups.timezone,
      joinsPaused: pomodoroGroups.joinsPaused,
      approveJoins: pomodoroGroups.approveJoins,
      linkExpiresAt: pomodoroGroups.linkExpiresAt,
      linkJoinsLeft: pomodoroGroups.linkJoinsLeft,
      weeklyGoalHours: pomodoroGroups.weeklyGoalHours,
    })
    .from(pomodoroGroupMembers)
    .innerJoin(
      pomodoroGroups,
      eq(pomodoroGroups.id, pomodoroGroupMembers.groupId)
    )
    .where(eq(pomodoroGroupMembers.userId, userId))
    .orderBy(asc(pomodoroGroupMembers.joinedAt))

  return rows.map(({ ownerUserId, ownerTimezone, timezone, ...group }) => {
    const isOwner = ownerUserId === userId
    return {
      ...group,
      isOwner,
      timezone: timezone ?? ownerTimezone ?? "UTC",
      linkLifetime: lifetimeOf(group),
      linkWorking: !group.joinsPaused && !linkRunOut(group),
      waitingCount: isOwner ? group.waitingCount : 0,
    }
  })
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

/**
 * The owner's settings window (parts 1, 5, 16 and 18): the name, the line
 * under it, the timezone the board counts days in, and the weekly goal.
 */
export async function saveGroupDetails(
  userId: string,
  groupId: string,
  details: {
    name: string
    description: string | null
    timezone: string
    weeklyGoalHours: number | null
  }
) {
  const group = await requireOwnedGroup(userId, groupId)
  if (!isKnownTimezone(details.timezone)) throw new Error("GROUP_TIMEZONE")
  const description = details.description?.trim() || null

  await db.transaction(async (tx) => {
    await tx
      .update(pomodoroGroups)
      .set({
        name: details.name,
        description,
        timezone: details.timezone,
        weeklyGoalHours: details.weeklyGoalHours,
        updatedAt: new Date(),
      })
      .where(eq(pomodoroGroups.id, groupId))
    if (group.name !== details.name)
      await logGroupEvent(tx, groupId, "renamed", details.name)
  })
  // The name and the line both show on the group's public page.
  forgetTeamPages()
}

/** A timezone name `Intl` can count days in, such as "Asia/Manila". */
function isKnownTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/**
 * Replaces the invite link's secret, which stops the old link working. A
 * link that runs out after 7 days or 10 joins starts that count again.
 */
export async function resetGroupInvite(userId: string, groupId: string) {
  const group = await requireOwnedGroup(userId, groupId)
  const token = newJoinToken()
  await db.transaction(async (tx) => {
    await tx
      .update(pomodoroGroups)
      .set({
        joinToken: token,
        ...lifetimeColumns(lifetimeOf(group)),
        updatedAt: new Date(),
      })
      .where(eq(pomodoroGroups.id, groupId))
    await logGroupEvent(tx, groupId, "new_link")
  })
  return token
}

/**
 * The invite link panel's three owner switches (parts 4, 6 and 8). Each
 * saves the moment it moves. Switching "ask me first" off lets everybody
 * waiting in, in the order they asked (Tyler, 13 Oct 2026).
 */
export async function saveGroupInviteSettings(
  userId: string,
  groupId: string,
  settings: {
    joinsPaused?: boolean
    approveJoins?: boolean
    linkLifetime?: GroupLinkLifetime
  }
) {
  const group = await requireOwnedGroup(userId, groupId)
  const pausing =
    settings.joinsPaused !== undefined &&
    settings.joinsPaused !== group.joinsPaused

  await db.transaction(async (tx) => {
    await tx
      .update(pomodoroGroups)
      .set({
        ...(settings.joinsPaused !== undefined
          ? { joinsPaused: settings.joinsPaused }
          : {}),
        ...(settings.approveJoins !== undefined
          ? { approveJoins: settings.approveJoins }
          : {}),
        ...(settings.linkLifetime !== undefined
          ? lifetimeColumns(settings.linkLifetime)
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(pomodoroGroups.id, groupId))
    if (pausing)
      await logGroupEvent(
        tx,
        groupId,
        settings.joinsPaused ? "paused" : "unpaused"
      )
  })

  if (settings.approveJoins === false && group.approveJoins)
    await letEverybodyWaitingIn(groupId)
}

/** Everybody waiting, let in oldest first, each told what happened. */
async function letEverybodyWaitingIn(groupId: string) {
  const waiting = await db
    .select({ id: pomodoroGroupRequests.id })
    .from(pomodoroGroupRequests)
    .where(eq(pomodoroGroupRequests.groupId, groupId))
    .orderBy(asc(pomodoroGroupRequests.createdAt))
  for (const request of waiting) {
    try {
      await settleRequest(groupId, request.id, true)
    } catch (cause) {
      // A request answered a moment ago by another press is already gone;
      // the rest are still let in.
      if (!(cause instanceof Error && cause.message === "GROUP_REQUEST_GONE"))
        throw cause
    }
  }
}

/** The group behind an invite link, with what the join page needs to know. */
async function groupByToken(token: string) {
  const [group] = await db
    .select()
    .from(pomodoroGroups)
    .where(eq(pomodoroGroups.joinToken, token))
    .limit(1)
  return group ?? null
}

async function isKeptOut(groupId: string, userId: string) {
  const [ban] = await db
    .select({ id: pomodoroGroupBans.id })
    .from(pomodoroGroupBans)
    .where(
      and(eq(pomodoroGroupBans.groupId, groupId), eq(pomodoroGroupBans.userId, userId))
    )
    .limit(1)
  return Boolean(ban)
}

/**
 * What an invite link points at, before anybody commits to following it,
 * including the group's public page when it has one, so nobody joins a group
 * without knowing it has a page on the open internet.
 *
 * A link that ran out, a replaced link and a kept-out reader all get the one
 * "no group here" answer, so the link never says why.
 */
export async function lookupGroupInvite(userId: string, token: string) {
  const group = await groupByToken(token)
  if (!group || linkRunOut(group) || (await isKeptOut(group.id, userId)))
    throw new Error("GROUP_NOT_FOUND")

  const [[membership], [request], [profile], memberCount] = await Promise.all([
    db
      .select({ id: pomodoroGroupMembers.id })
      .from(pomodoroGroupMembers)
      .where(
        and(
          eq(pomodoroGroupMembers.groupId, group.id),
          eq(pomodoroGroupMembers.userId, userId)
        )
      )
      .limit(1),
    db
      .select({ id: pomodoroGroupRequests.id })
      .from(pomodoroGroupRequests)
      .where(
        and(
          eq(pomodoroGroupRequests.groupId, group.id),
          eq(pomodoroGroupRequests.userId, userId)
        )
      )
      .limit(1),
    db
      .select({ name: pomodoroProfiles.publicDisplayName })
      .from(pomodoroProfiles)
      .where(eq(pomodoroProfiles.userId, userId))
      .limit(1),
    countMembers(group.id),
  ])

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    memberCount,
    teamHandle: group.pagePublic ? group.handle : null,
    joinsPaused: group.joinsPaused,
    approveJoins: group.approveJoins,
    ownerName: group.approveJoins ? await nameOf(group.ownerUserId) : null,
    alreadyIn: Boolean(membership),
    waiting: Boolean(request),
    /** No public display name yet, so the page offers one (part 9). */
    needsName: !profile?.name,
  }
}

export type JoinResult = {
  id: string
  name: string
  /** "requested" when the owner lets each person in (part 6). */
  status: "joined" | "requested"
}

/** Follows an invite link. */
export async function joinGroupByToken(
  userId: string,
  token: string
): Promise<JoinResult> {
  const group = await groupByToken(token)
  if (!group || linkRunOut(group)) throw new Error("GROUP_NOT_FOUND")
  return admit(userId, group, "link")
}

/**
 * Puts somebody in a group, by the link or by an invite from the bell. Both
 * ways run this, so the caps, the pause, keep-out and asking first all apply
 * to both. Only the link counts down "after 10 joins".
 *
 * Both caps are checked before the insert, and the insert itself drops a repeat
 * on the unique pair, so following the same link twice ends up in the group
 * once rather than failing at a person.
 */
async function admit(
  userId: string,
  group: typeof pomodoroGroups.$inferSelect,
  via: "link" | "invite"
): Promise<JoinResult> {
  const result = (status: JoinResult["status"]): JoinResult => ({
    id: group.id,
    name: group.name,
    status,
  })

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
  if (existing) return result("joined")

  // A kept-out person hears what a dead link says, so the link never tells
  // them why (part 3).
  if (await isKeptOut(group.id, userId)) throw new Error("GROUP_NOT_FOUND")
  if (group.joinsPaused) throw new Error("GROUP_JOINS_PAUSED")

  const isOwner = group.ownerUserId === userId
  // Read before the transaction, not inside it: a read on the shared handle
  // from inside a transaction waits on a second connection.
  const joinerName = await nameOf(userId)
  const tellOwner =
    !isOwner && !(await isBlockedBetween(group.ownerUserId, userId))

  if (group.approveJoins && !isOwner) {
    await db.transaction(async (tx) => {
      const [requested] = await tx
        .insert(pomodoroGroupRequests)
        .values({ groupId: group.id, userId })
        .onConflictDoNothing()
        .returning({ id: pomodoroGroupRequests.id })
      if (!requested || !tellOwner) return
      await foldNotice(tx, {
        recipientUserId: group.ownerUserId,
        actorUserId: userId,
        kind: "group_request",
        subject: { groupId: group.id },
        href: `/groups?group=${group.id}`,
        compose: (waiting) => {
          const first = waiting?.detail ?? joinerName
          const foldCount = (waiting?.foldCount ?? 0) + 1
          return {
            message: groupRequestMessage(first, foldCount - 1, group.name),
            detail: first,
            foldCount,
          }
        },
      })
      await answerInvite(tx, group.id, userId)
    })
    return result("requested")
  }

  if ((await countMemberships(userId)) >= MAX_GROUPS_PER_PERSON)
    throw new Error("GROUP_LIMIT_REACHED")
  if ((await countMembers(group.id)) >= MAX_GROUP_MEMBERS)
    throw new Error("GROUP_FULL")

  // The join, the link's count and the owner's notice commit together. A
  // repeat that the unique pair drops is not a join, so it tells nobody.
  await db.transaction(async (tx) => {
    const [joined] = await tx
      .insert(pomodoroGroupMembers)
      .values({ groupId: group.id, userId })
      .onConflictDoNothing()
      .returning({ id: pomodoroGroupMembers.id })
    if (!joined) return

    if (via === "link" && group.linkJoinsLeft !== null) {
      // Counted down in the join's own transaction, so two joins at once
      // cannot both take the last place: the second finds 0 and is undone.
      const [counted] = await tx
        .update(pomodoroGroups)
        .set({ linkJoinsLeft: sql`${pomodoroGroups.linkJoinsLeft} - 1` })
        .where(
          and(
            eq(pomodoroGroups.id, group.id),
            sql`${pomodoroGroups.linkJoinsLeft} > 0`
          )
        )
        .returning({ id: pomodoroGroups.id })
      if (!counted) throw new Error("GROUP_NOT_FOUND")
    }

    await logGroupEvent(tx, group.id, "joined", joinerName)
    await answerInvite(tx, group.id, userId)
    if (!tellOwner) return
    await noteGroupJoin(tx, {
      ownerUserId: group.ownerUserId,
      joinerUserId: userId,
      joinerName,
      groupId: group.id,
      groupName: group.name,
    })
  })
  forgetTeamPages()
  return result("joined")
}

/**
 * Leaves a group, which is what takes you off its board.
 *
 * The owner cannot leave. A group with no owner has nobody who can replace a
 * leaked link, so the owner hands the group on or deletes it first.
 */
export async function leaveGroup(userId: string, groupId: string) {
  const [group] = await db
    .select({ ownerUserId: pomodoroGroups.ownerUserId })
    .from(pomodoroGroups)
    .where(eq(pomodoroGroups.id, groupId))
    .limit(1)
  if (!group) throw new Error("GROUP_NOT_FOUND")
  if (group.ownerUserId === userId) throw new Error("GROUP_OWNER_CANNOT_LEAVE")

  const name = await nameOf(userId)
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(pomodoroGroupMembers)
      .where(
        and(
          eq(pomodoroGroupMembers.groupId, groupId),
          eq(pomodoroGroupMembers.userId, userId)
        )
      )
      .returning({ id: pomodoroGroupMembers.id })
    if (removed.length === 0) throw new Error("GROUP_NOT_MEMBER")
    await logGroupEvent(tx, groupId, "left", name)
  })
  // Leaving takes you off the group's public page on the next request.
  forgetTeamPages()
}

/**
 * The owner takes somebody out of the group, and with `keepOut` stops the
 * invite link letting them back in (part 3).
 *
 * The person is named by their membership row's uuid, never by a user id: ids
 * never leave the server, so there is no id for a browser to send back. The
 * owner's own row is refused, because leaving is the delete button's job.
 */
export async function removeGroupMember(
  userId: string,
  groupId: string,
  membershipId: string,
  keepOut = false
) {
  const group = await requireOwnedGroup(userId, groupId)

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
  const name = await nameOf(target.userId)

  await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(pomodoroGroupMembers)
      .where(membership)
      .returning({ userId: pomodoroGroupMembers.userId })
    if (!removed) throw new Error("GROUP_NOT_MEMBER")
    if (keepOut)
      await tx
        .insert(pomodoroGroupBans)
        .values({ groupId, userId: removed.userId })
        .onConflictDoNothing()
    await logGroupEvent(tx, groupId, keepOut ? "kept_out" : "removed", name)
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
  forgetTeamPages()
}

/** The people the owner kept out, newest first, by their ban row's id. */
export async function listKeptOut(userId: string, groupId: string) {
  await requireOwnedGroup(userId, groupId)
  const rows = await db
    .select({
      banId: pomodoroGroupBans.id,
      createdAt: pomodoroGroupBans.createdAt,
      publicDisplayName: pomodoroProfiles.publicDisplayName,
      handle: pomodoroProfiles.handle,
    })
    .from(pomodoroGroupBans)
    .leftJoin(
      pomodoroProfiles,
      eq(pomodoroProfiles.userId, pomodoroGroupBans.userId)
    )
    .where(eq(pomodoroGroupBans.groupId, groupId))
    .orderBy(desc(pomodoroGroupBans.createdAt))
  return rows.map((row) => ({
    banId: row.banId,
    createdAt: row.createdAt,
    name: noticeName(row),
  }))
}

/** Let back in: the link works for them again. Nothing else changes. */
export async function letBackIn(userId: string, groupId: string, banId: string) {
  await requireOwnedGroup(userId, groupId)
  const [ban] = await db
    .select({ userId: pomodoroGroupBans.userId })
    .from(pomodoroGroupBans)
    .where(and(eq(pomodoroGroupBans.id, banId), eq(pomodoroGroupBans.groupId, groupId)))
    .limit(1)
  if (!ban) throw new Error("GROUP_NOT_MEMBER")
  const name = await nameOf(ban.userId)
  await db.transaction(async (tx) => {
    await tx.delete(pomodoroGroupBans).where(eq(pomodoroGroupBans.id, banId))
    await logGroupEvent(tx, groupId, "let_back_in", name)
  })
}

/**
 * The owner hands the group to a member (part 2). The new owner hears it in
 * the bell, and the old owner becomes an ordinary member who can leave.
 *
 * The new owner is checked as a member inside the same transaction, so a
 * hand-over to somebody who just left is refused rather than giving the
 * group to a stranger.
 */
export async function handOverGroup(
  userId: string,
  groupId: string,
  membershipId: string
) {
  const group = await requireOwnedGroup(userId, groupId)
  const [target] = await db
    .select({ userId: pomodoroGroupMembers.userId })
    .from(pomodoroGroupMembers)
    .where(
      and(
        eq(pomodoroGroupMembers.id, membershipId),
        eq(pomodoroGroupMembers.groupId, groupId),
        sql`${pomodoroGroupMembers.userId} <> ${userId}`
      )
    )
    .limit(1)
  if (!target) throw new Error("GROUP_NOT_MEMBER")
  const [newOwnerName, oldOwnerName] = await Promise.all([
    nameOf(target.userId),
    nameOf(userId),
  ])
  const tellThem = !(await isBlockedBetween(userId, target.userId))

  await db.transaction(async (tx) => {
    const [stillIn] = await tx
      .select({ id: pomodoroGroupMembers.id })
      .from(pomodoroGroupMembers)
      .where(eq(pomodoroGroupMembers.id, membershipId))
      .limit(1)
    if (!stillIn) throw new Error("GROUP_NOT_MEMBER")
    await tx
      .update(pomodoroGroups)
      .set({ ownerUserId: target.userId, updatedAt: new Date() })
      .where(eq(pomodoroGroups.id, groupId))
    // Requests were the old owner's to answer. The new owner sees the same
    // rows, so nothing moves; only who may answer them changes.
    await logGroupEvent(tx, groupId, "handed_over", newOwnerName)
    if (!tellThem) return
    await writeNotices(tx, [
      {
        recipientUserId: target.userId,
        kind: "group_owner",
        message: groupOwnerMessage(oldOwnerName, group.name),
        groupId,
        href: `/groups?group=${groupId}`,
      },
    ])
  })
  // A team page is shown only while its owner is on Pro, so a new owner can
  // change whether the page answers at all.
  forgetTeamPages()
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
  forgetTeamPages()
}

/**
 * Everyone in the group, for Who is in it (part 13): the joined date, and a
 * link to the person's public page only while that page is switched on and
 * not hidden.
 */
export async function listGroupMembers(userId: string, groupId: string) {
  await requireMembership(userId, groupId)
  const rows = await db
    .select({
      membershipId: pomodoroGroupMembers.id,
      memberUserId: pomodoroGroupMembers.userId,
      joinedAt: pomodoroGroupMembers.joinedAt,
      name: pomodoroProfiles.publicDisplayName,
      handle: sql<string | null>`case
        when ${pomodoroProfiles.profilePublic} and ${pomodoroProfiles.hiddenAt} is null
        then ${pomodoroProfiles.handle} end`,
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
    // board, and the panel says so rather than showing an empty line.
    name: row.name,
    handle: row.handle,
    joinedAt: row.joinedAt,
    isOwner: row.memberUserId === row.ownerUserId,
    isYou: row.memberUserId === userId,
  }))
}

/** Requests waiting for the owner, oldest first (part 6). */
export async function listGroupRequests(userId: string, groupId: string) {
  await requireOwnedGroup(userId, groupId)
  const rows = await db
    .select({
      requestId: pomodoroGroupRequests.id,
      createdAt: pomodoroGroupRequests.createdAt,
      publicDisplayName: pomodoroProfiles.publicDisplayName,
      handle: pomodoroProfiles.handle,
    })
    .from(pomodoroGroupRequests)
    .leftJoin(
      pomodoroProfiles,
      eq(pomodoroProfiles.userId, pomodoroGroupRequests.userId)
    )
    .where(eq(pomodoroGroupRequests.groupId, groupId))
    .orderBy(asc(pomodoroGroupRequests.createdAt))
  return rows.map((row) => ({
    requestId: row.requestId,
    createdAt: row.createdAt,
    name: noticeName(row),
  }))
}

/** The owner's Let in or Turn down. */
export async function answerGroupRequest(
  userId: string,
  groupId: string,
  requestId: string,
  letIn: boolean
) {
  await requireOwnedGroup(userId, groupId)
  await settleRequest(groupId, requestId, letIn)
}

/**
 * Lets one request in or turns it down, and tells the person which. Both
 * caps are checked again here, because a request counted toward neither
 * while it waited; a cap that stops it turns it down with its reason.
 */
async function settleRequest(groupId: string, requestId: string, letIn: boolean) {
  const [request] = await db
    .select({
      userId: pomodoroGroupRequests.userId,
      groupName: pomodoroGroups.name,
      ownerUserId: pomodoroGroups.ownerUserId,
    })
    .from(pomodoroGroupRequests)
    .innerJoin(pomodoroGroups, eq(pomodoroGroups.id, pomodoroGroupRequests.groupId))
    .where(
      and(eq(pomodoroGroupRequests.id, requestId), eq(pomodoroGroupRequests.groupId, groupId))
    )
    .limit(1)
  if (!request) throw new Error("GROUP_REQUEST_GONE")

  let answer: "in" | "turned_down" | "full" | "your_limit" = letIn
    ? "in"
    : "turned_down"
  if (letIn && (await countMembers(groupId)) >= MAX_GROUP_MEMBERS) answer = "full"
  else if (letIn && (await countMemberships(request.userId)) >= MAX_GROUPS_PER_PERSON)
    answer = "your_limit"
  const name = await nameOf(request.userId)
  const tellThem = !(await isBlockedBetween(request.ownerUserId, request.userId))

  await db.transaction(async (tx) => {
    const [taken] = await tx
      .delete(pomodoroGroupRequests)
      .where(eq(pomodoroGroupRequests.id, requestId))
      .returning({ id: pomodoroGroupRequests.id })
    if (!taken) throw new Error("GROUP_REQUEST_GONE")
    if (answer === "in") {
      await tx
        .insert(pomodoroGroupMembers)
        .values({ groupId, userId: request.userId })
        .onConflictDoNothing()
      await logGroupEvent(tx, groupId, "joined", name)
    }
    if (!tellThem) return
    await writeNotices(tx, [
      {
        recipientUserId: request.userId,
        kind: "group_answer",
        message: groupAnswerMessage(request.groupName, answer),
        groupId,
        href: answer === "in" ? `/groups?group=${groupId}` : null,
      },
    ])
  })
  if (answer === "in") forgetTeamPages()
}

/**
 * The people you follow who could be invited to this group (part 7): not in
 * it, not kept out of it, not holding an invite to it already, and with no
 * block between you either way. Each is named by the follow row's id.
 */
export async function listInvitableFollows(userId: string, groupId: string) {
  await requireMembership(userId, groupId)
  const blocked = [...(await blockedUserIdsFor(userId))]
  const rows = await db
    .select({
      followId: pomodoroFollows.id,
      publicDisplayName: pomodoroProfiles.publicDisplayName,
      handle: pomodoroProfiles.handle,
    })
    .from(pomodoroFollows)
    .leftJoin(
      pomodoroProfiles,
      eq(pomodoroProfiles.userId, pomodoroFollows.followedUserId)
    )
    .where(
      and(
        eq(pomodoroFollows.followerUserId, userId),
        blocked.length
          ? notInArray(pomodoroFollows.followedUserId, blocked)
          : undefined,
        sql`not exists (
          select 1 from ${pomodoroGroupMembers}
          where ${pomodoroGroupMembers.groupId} = ${groupId}
            and ${pomodoroGroupMembers.userId} = ${pomodoroFollows.followedUserId})`,
        sql`not exists (
          select 1 from ${pomodoroGroupBans}
          where ${pomodoroGroupBans.groupId} = ${groupId}
            and ${pomodoroGroupBans.userId} = ${pomodoroFollows.followedUserId})`,
        sql`not exists (
          select 1 from ${pomodoroGroupInvites}
          where ${pomodoroGroupInvites.groupId} = ${groupId}
            and ${pomodoroGroupInvites.inviteeUserId} = ${pomodoroFollows.followedUserId}
            and ${pomodoroGroupInvites.answeredAt} is null)`
      )
    )
    .orderBy(asc(pomodoroProfiles.publicDisplayName))
  return rows.map((row) => ({ followId: row.followId, name: noticeName(row) }))
}

/**
 * Sends invites in the bell to people the sender follows (part 7). Anybody
 * who no longer qualifies is skipped without a word, so the answer never
 * says whether a block exists. Twenty a day per sender.
 */
export async function sendGroupInvites(
  userId: string,
  groupId: string,
  followIds: readonly string[]
) {
  await requireMembership(userId, groupId)
  const invitable = new Set(
    (await listInvitableFollows(userId, groupId)).map((row) => row.followId)
  )
  const chosen = [...new Set(followIds)].filter((id) => invitable.has(id))
  if (chosen.length === 0) return { sent: 0 }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000)
  const [{ value: sentToday }] = await db
    .select({ value: count() })
    .from(pomodoroGroupInvites)
    .where(
      and(
        eq(pomodoroGroupInvites.inviterUserId, userId),
        gte(pomodoroGroupInvites.createdAt, dayAgo)
      )
    )
  if (sentToday + chosen.length > GROUP_INVITES_PER_DAY)
    throw new Error("GROUP_INVITE_LIMIT")

  const [follows, [group], inviterName] = await Promise.all([
    db
      .select({ followedUserId: pomodoroFollows.followedUserId })
      .from(pomodoroFollows)
      .where(inArray(pomodoroFollows.id, chosen)),
    db
      .select({ name: pomodoroGroups.name })
      .from(pomodoroGroups)
      .where(eq(pomodoroGroups.id, groupId))
      .limit(1),
    nameOf(userId),
  ])
  if (!group) throw new Error("GROUP_NOT_MEMBER")

  let sent = 0
  await db.transaction(async (tx) => {
    for (const { followedUserId } of follows) {
      // An answered invite from before is used again rather than refused by
      // the one-row-per-person rule.
      const [invite] = await tx
        .insert(pomodoroGroupInvites)
        .values({ groupId, inviteeUserId: followedUserId, inviterUserId: userId })
        .onConflictDoUpdate({
          target: [pomodoroGroupInvites.groupId, pomodoroGroupInvites.inviteeUserId],
          set: { inviterUserId: userId, createdAt: new Date(), answeredAt: null },
          setWhere: sql`${pomodoroGroupInvites.answeredAt} is not null`,
        })
        .returning({ id: pomodoroGroupInvites.id })
      if (!invite) continue
      sent += 1
      await writeNotices(tx, [
        {
          recipientUserId: followedUserId,
          actorUserId: userId,
          kind: "group_invite",
          message: groupInviteMessage(inviterName, group.name),
          groupId,
          href: "/groups",
        },
      ])
    }
  })
  return { sent }
}

/** Invites waiting for this account, newest first, for the Groups page. */
export async function listMyGroupInvites(userId: string) {
  const rows = await db
    .select({
      inviteId: pomodoroGroupInvites.id,
      groupName: pomodoroGroups.name,
      description: pomodoroGroups.description,
      memberCount: sql<number>`(
        select count(*)::int from ${pomodoroGroupMembers}
        where ${pomodoroGroupMembers.groupId} = ${pomodoroGroups.id}
      )`,
      publicDisplayName: pomodoroProfiles.publicDisplayName,
      handle: pomodoroProfiles.handle,
    })
    .from(pomodoroGroupInvites)
    .innerJoin(pomodoroGroups, eq(pomodoroGroups.id, pomodoroGroupInvites.groupId))
    .leftJoin(
      pomodoroProfiles,
      eq(pomodoroProfiles.userId, pomodoroGroupInvites.inviterUserId)
    )
    .where(
      and(
        eq(pomodoroGroupInvites.inviteeUserId, userId),
        isNull(pomodoroGroupInvites.answeredAt)
      )
    )
    .orderBy(desc(pomodoroGroupInvites.createdAt))
  return rows.map(({ publicDisplayName, handle, ...row }) => ({
    ...row,
    inviterName: noticeName({ publicDisplayName, handle }),
  }))
}

async function myInvite(userId: string, inviteId: string) {
  const [invite] = await db
    .select({ groupId: pomodoroGroupInvites.groupId })
    .from(pomodoroGroupInvites)
    .where(
      and(
        eq(pomodoroGroupInvites.id, inviteId),
        eq(pomodoroGroupInvites.inviteeUserId, userId),
        isNull(pomodoroGroupInvites.answeredAt)
      )
    )
    .limit(1)
  if (!invite) throw new Error("GROUP_INVITE_GONE")
  return invite
}

/** Join from an invite in the bell. The same rules as the link. */
export async function acceptGroupInvite(userId: string, inviteId: string) {
  const invite = await myInvite(userId, inviteId)
  const [group] = await db
    .select()
    .from(pomodoroGroups)
    .where(eq(pomodoroGroups.id, invite.groupId))
    .limit(1)
  if (!group) throw new Error("GROUP_INVITE_GONE")
  return admit(userId, group, "invite")
}

/** Decline takes the invite off the Groups page and out of the bell. */
export async function declineGroupInvite(userId: string, inviteId: string) {
  const invite = await myInvite(userId, inviteId)
  await db.transaction(async (tx) => {
    await answerInvite(tx, invite.groupId, userId)
  })
}

/**
 * Marks this person's waiting invite to the group answered, and takes its
 * unread notice out of their bell. Joining, asking to join and Decline all
 * end an invite.
 */
async function answerInvite(database: Database, groupId: string, userId: string) {
  const answered = await database
    .update(pomodoroGroupInvites)
    .set({ answeredAt: new Date() })
    .where(
      and(
        eq(pomodoroGroupInvites.groupId, groupId),
        eq(pomodoroGroupInvites.inviteeUserId, userId),
        isNull(pomodoroGroupInvites.answeredAt)
      )
    )
    .returning({ id: pomodoroGroupInvites.id })
  if (answered.length === 0) return
  await database.delete(customShellNotifications).where(
    and(
      eq(customShellNotifications.recipientUserId, userId),
      isNull(customShellNotifications.readAt),
      inArray(
        customShellNotifications.id,
        database
          .select({ id: pomodoroNoticeLinks.noticeId })
          .from(pomodoroNoticeLinks)
          .where(
            and(
              eq(pomodoroNoticeLinks.kind, "group_invite"),
              eq(pomodoroNoticeLinks.groupId, groupId)
            )
          )
      )
    )
  )
}

/** The owner's Activity panel, newest first (part 23). */
export async function listGroupEvents(userId: string, groupId: string) {
  await requireOwnedGroup(userId, groupId)
  return db
    .select({
      id: pomodoroGroupEvents.id,
      kind: pomodoroGroupEvents.kind,
      name: pomodoroGroupEvents.name,
      createdAt: pomodoroGroupEvents.createdAt,
    })
    .from(pomodoroGroupEvents)
    .where(eq(pomodoroGroupEvents.groupId, groupId))
    .orderBy(desc(pomodoroGroupEvents.createdAt))
    .limit(GROUP_EVENTS_KEPT)
}
