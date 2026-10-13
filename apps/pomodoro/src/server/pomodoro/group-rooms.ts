import { and, asc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm"

import { groupRoomMessage } from "@/lib/pomodoro/notices"
import { db } from "@/server/db"
import { blockedUserIdsFor } from "@/server/pomodoro/blocks"
import { writeNotices } from "@/server/pomodoro/notices"
import { roomHref, roomName } from "@/server/pomodoro/rooms"
import {
  pomodoroGroupMembers,
  pomodoroGroups,
  pomodoroNoticeLinks,
  roomMemberships,
  rooms,
} from "@/server/pomodoro/schema"
import { customShellNotifications, customShellUsers as users } from "@/server/schema"

/**
 * Group rooms (groups task 01, parts 11 and 12): a room that belongs to one
 * group. It is unlisted, so it never shows in Open to join; it shows on its
 * members' Group room card on Rooms, and only the group's members may join
 * it, even somebody else holding its link (Tyler, 13 Oct 2026).
 *
 * A group has at most one open group room. Start a group room while one is
 * open joins that one instead of making a second.
 */

/** How often one group's members hear "Sam started a room". */
const GROUP_ROOM_NOTICE_EVERY_MS = 60 * 60_000

/** The group's room that is open now, or null. A booked one is not open. */
export async function openGroupRoom(groupId: string) {
  const [room] = await db
    .select()
    .from(rooms)
    .where(
      and(
        eq(rooms.groupId, groupId),
        isNull(rooms.closedAt),
        sql`${rooms.phase} not in ('closed', 'scheduled')`
      )
    )
    .orderBy(asc(rooms.createdAt))
    .limit(1)
  return room ?? null
}

/** Whether this account is in this group. */
export async function isGroupMember(userId: string, groupId: string) {
  const [row] = await db
    .select({ id: pomodoroGroupMembers.id })
    .from(pomodoroGroupMembers)
    .where(
      and(
        eq(pomodoroGroupMembers.groupId, groupId),
        eq(pomodoroGroupMembers.userId, userId)
      )
    )
    .limit(1)
  return Boolean(row)
}

/** Whether this account owns this group, for booking a weekly group room. */
export async function isGroupOwner(userId: string, groupId: string) {
  const [row] = await db
    .select({ id: pomodoroGroups.id })
    .from(pomodoroGroups)
    .where(
      and(eq(pomodoroGroups.id, groupId), eq(pomodoroGroups.ownerUserId, userId))
    )
    .limit(1)
  return Boolean(row)
}

export type GroupRoomCard = {
  groupId: string
  groupName: string
  isOwner: boolean
  /** The group's open room, or null when nobody has one open. */
  room: {
    slug: string
    name: string
    memberCount: number
    hostName: string
    youAreIn: boolean
    /** The room's pair, for the "leave this room for that one?" question. */
    sound: string | null
    background: string | null
  } | null
}

/**
 * What the Group room card on Rooms draws: every group this account is in,
 * each with its open room if it has one. Somebody in no group gets an empty
 * list, and the card is not drawn.
 */
export async function listMyGroupRooms(userId: string): Promise<GroupRoomCard[]> {
  const groups = await db
    .select({
      groupId: pomodoroGroups.id,
      groupName: pomodoroGroups.name,
      ownerUserId: pomodoroGroups.ownerUserId,
    })
    .from(pomodoroGroupMembers)
    .innerJoin(pomodoroGroups, eq(pomodoroGroups.id, pomodoroGroupMembers.groupId))
    .where(eq(pomodoroGroupMembers.userId, userId))
    .orderBy(asc(pomodoroGroupMembers.joinedAt))
  if (groups.length === 0) return []

  const open = await db
    .select({
      id: rooms.id,
      groupId: rooms.groupId,
      slug: rooms.slug,
      name: rooms.name,
      hostUserId: rooms.hostUserId,
      sound: rooms.sound,
      background: rooms.background,
      // Written out with the table's name: a column of the table being read
      // is drawn without one, which inside these sub-selects would mean the
      // membership's own id.
      memberCount: sql<number>`(
        select count(*)::int from ${roomMemberships}
        where ${roomMemberships.roomId} = "rooms"."id"
          and ${roomMemberships.leftAt} is null)`,
      youAreIn: sql<boolean>`exists (
        select 1 from ${roomMemberships}
        where ${roomMemberships.roomId} = "rooms"."id"
          and ${roomMemberships.userId} = ${userId}
          and ${roomMemberships.leftAt} is null)`,
    })
    .from(rooms)
    .where(
      and(
        inArray(
          rooms.groupId,
          groups.map((group) => group.groupId)
        ),
        isNull(rooms.closedAt),
        sql`${rooms.phase} not in ('closed', 'scheduled')`
      )
    )
    .orderBy(asc(rooms.createdAt))

  const cards: GroupRoomCard[] = []
  for (const group of groups) {
    const room = open.find((row) => row.groupId === group.groupId)
    cards.push({
      groupId: group.groupId,
      groupName: group.groupName,
      isOwner: group.ownerUserId === userId,
      room: room
        ? {
            slug: room.slug,
            name: room.name,
            memberCount: room.memberCount,
            hostName: await roomName(db, room.hostUserId),
            youAreIn: room.youAreIn,
            sound: room.sound,
            background: room.background,
          }
        : null,
    })
  }
  return cards
}

/**
 * Tells every other member that a group room started, at most once an hour
 * per group, so a group of fifty is not woken fifty times by rooms opened and
 * closed in a row. Nobody across a block with the host hears.
 */
export async function tellGroupOfRoom(
  hostUserId: string,
  groupId: string,
  room: { id: string; slug: string }
) {
  const since = new Date(Date.now() - GROUP_ROOM_NOTICE_EVERY_MS)
  const [recent] = await db
    .select({ id: pomodoroNoticeLinks.noticeId })
    .from(pomodoroNoticeLinks)
    .innerJoin(
      customShellNotifications,
      eq(customShellNotifications.id, pomodoroNoticeLinks.noticeId)
    )
    .where(
      and(
        eq(pomodoroNoticeLinks.kind, "group_room"),
        eq(pomodoroNoticeLinks.groupId, groupId),
        gte(customShellNotifications.createdAt, since)
      )
    )
    .limit(1)
  if (recent) return

  const [[group], members, blocked, hostName] = await Promise.all([
    db
      .select({ name: pomodoroGroups.name })
      .from(pomodoroGroups)
      .where(eq(pomodoroGroups.id, groupId))
      .limit(1),
    db
      .select({ userId: pomodoroGroupMembers.userId })
      .from(pomodoroGroupMembers)
      .where(
        and(
          eq(pomodoroGroupMembers.groupId, groupId),
          ne(pomodoroGroupMembers.userId, hostUserId)
        )
      ),
    blockedUserIdsFor(hostUserId),
    roomName(db, hostUserId),
  ])
  if (!group) return
  await writeNotices(
    db,
    members
      .filter((member) => !blocked.has(member.userId))
      .map((member) => ({
        recipientUserId: member.userId,
        actorUserId: hostUserId,
        kind: "group_room" as const,
        message: groupRoomMessage(hostName, group.name),
        groupId,
        roomId: room.id,
        href: roomHref(room.slug),
      }))
  )
}

/**
 * The addresses a weekly group room invites this week: everybody in the
 * group as they are now, the host left out. Verified addresses only, the
 * same as a typed invite that reaches an account.
 */
export async function groupMemberEmails(groupId: string, hostUserId: string) {
  const rows = await db
    .select({ email: sql<string>`lower(${users.email})` })
    .from(pomodoroGroupMembers)
    .innerJoin(users, eq(users.id, pomodoroGroupMembers.userId))
    .where(
      and(
        eq(pomodoroGroupMembers.groupId, groupId),
        ne(pomodoroGroupMembers.userId, hostUserId),
        sql`${users.emailVerifiedAt} is not null`
      )
    )
  return rows.map((row) => row.email)
}
