import { and, asc, eq, isNotNull, ne } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { announcementHeading, TEAM_HREF } from "@/lib/project/notices"
import { runsTheTeam } from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireMembership, requireTeamRunner, type Membership, type ProjectDb } from "@/server/project/access"
import { writeAppNotices } from "@/server/project/notices"
import { projectAnnouncementViews, projectTeamMembers, projectTeams } from "@/server/project/schema"
import type { Actor } from "@/server/project/tasks"
import { customShellUsers } from "@/server/schema"

/**
 * The team's announcement: one message the owner or an admin pins at the top
 * of the Team dashboard, up to 500 characters. Everyone on the team gets
 * "Maya posted an announcement" in the bell. A new one replaces the old one,
 * Take down removes it, and each person can hide it for themselves until the
 * next one. It is one message, never a team chat: there are no replies.
 * The owner and admins see "Read by 4 of 6" under it, with the names.
 * See `workspace/docs/teams-and-invites.md`, "The team's announcement".
 */

type Reader = { id: string; name: string; avatarUrl: string }

export type Announcement = {
  id: string
  text: string
  by: { name: string; avatarUrl: string } | null
  postedAt: string
  /**
   * Who on the team has seen it and who hasn't, for the site admin only;
   * null for everyone else. Everyone on the team now counts, whenever they
   * joined. The site admin is on no team, so they are never counted.
   */
  readers: { seen: Reader[]; notYet: Reader[] } | null
}

/** The announcement showing for this person, or null when there is none or they hid it. */
export async function loadAnnouncement(
  membership: Membership,
  database: ProjectDb = db
): Promise<Announcement | null> {
  const [row] = await database
    .select({
      id: projectTeams.announcementId,
      text: projectTeams.announcementText,
      postedAt: projectTeams.announcementAt,
      byName: customShellUsers.name,
      byAvatar: customShellUsers.avatarUrl,
      hidden: projectTeamMembers.hiddenAnnouncementId,
    })
    .from(projectTeams)
    // The site admin is on no team, so they have no row and see it always.
    .leftJoin(
      projectTeamMembers,
      and(eq(projectTeamMembers.teamId, projectTeams.id), eq(projectTeamMembers.userId, membership.userId))
    )
    .leftJoin(customShellUsers, eq(customShellUsers.id, projectTeams.announcementByUserId))
    .where(eq(projectTeams.id, membership.teamId))
    .limit(1)
  if (!row?.id || !row.text || !row.postedAt || row.hidden === row.id) return null
  return {
    id: row.id,
    text: row.text,
    by: row.byName === null ? null : { name: row.byName, avatarUrl: row.byAvatar ?? "" },
    postedAt: row.postedAt.toISOString(),
    readers: runsTheTeam(membership.role) ? await readersOf(membership, row.id, database) : null,
  }
}

async function readersOf(membership: Membership, announcementId: string, database: ProjectDb) {
  const rows = await database
    .select({
      id: customShellUsers.id,
      name: customShellUsers.name,
      avatarUrl: customShellUsers.avatarUrl,
      seenAt: projectAnnouncementViews.seenAt,
    })
    .from(projectTeamMembers)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
    .leftJoin(
      projectAnnouncementViews,
      and(
        eq(projectAnnouncementViews.announcementId, announcementId),
        eq(projectAnnouncementViews.userId, projectTeamMembers.userId)
      )
    )
    .where(eq(projectTeamMembers.teamId, membership.teamId))
    .orderBy(asc(customShellUsers.name))
  const reader = (row: (typeof rows)[number]) => ({ id: row.id, name: row.name, avatarUrl: row.avatarUrl ?? "" })
  const seen = (row: (typeof rows)[number]) => row.seenAt !== null || row.id === membership.userId
  return { seen: rows.filter(seen).map(reader), notYet: rows.filter((row) => !seen(row)).map(reader) }
}

/**
 * This person has seen the announcement, once; seeing it again changes
 * nothing. The site admin's views are not kept: they are in no count.
 */
async function recordView(membership: Membership, announcementId: string, database: ProjectDb) {
  if (membership.siteAdmin) return
  await database
    .insert(projectAnnouncementViews)
    .values({ teamId: membership.teamId, announcementId, userId: membership.userId, seenAt: now() })
    .onConflictDoNothing()
}

/**
 * The announcement showed on this person's Team dashboard. Only the team's
 * current one counts, so an old id from a stale page records nothing.
 */
export async function markAnnouncementSeen(userId: string, announcementId: string, database = db) {
  const membership = await requireMembership(userId, database)
  const [team] = await database
    .select({ announcementId: projectTeams.announcementId })
    .from(projectTeams)
    .where(eq(projectTeams.id, membership.teamId))
    .limit(1)
  if (team?.announcementId !== announcementId) return
  await recordView(membership, announcementId, database)
}

export async function postAnnouncement(actor: Actor, text: string, database = db) {
  await database.transaction(async (tx) => {
    const membership = await requireTeamRunner(actor.id, tx)
    const id = uuid()
    await tx
      .update(projectTeams)
      .set({ announcementId: id, announcementText: text, announcementByUserId: actor.id, announcementAt: now() })
      .where(eq(projectTeams.id, membership.teamId))
    // Whoever wrote it has read it.
    await recordView(membership, id, tx)
    const everyoneElse = await tx
      .select({ userId: projectTeamMembers.userId })
      .from(projectTeamMembers)
      .where(and(eq(projectTeamMembers.teamId, membership.teamId), ne(projectTeamMembers.userId, actor.id)))
    const line = text.replace(/\s+/g, " ")
    await writeAppNotices(
      tx,
      everyoneElse.map(({ userId }) => ({
        kind: "team_announcement",
        recipientUserId: userId,
        actorUserId: actor.id,
        message: announcementHeading(actor.name),
        detail: line.length > 80 ? `${line.slice(0, 79)}…` : line,
        href: TEAM_HREF,
      }))
    )
  })
}

export async function takeDownAnnouncement(actor: Actor, database = db) {
  const membership = await requireTeamRunner(actor.id, database)
  const taken = await database
    .update(projectTeams)
    .set({ announcementId: null, announcementText: null, announcementByUserId: null, announcementAt: null })
    .where(and(eq(projectTeams.id, membership.teamId), isNotNull(projectTeams.announcementId)))
    .returning({ id: projectTeams.id })
  if (taken.length === 0) throw new Error(PROJECT_ERRORS.noAnnouncement)
}

/** Hides this announcement for this person only. A newer one shows again. Hiding it is having seen it. */
export async function hideAnnouncement(userId: string, announcementId: string, database = db) {
  const membership = await requireMembership(userId, database)
  await database
    .update(projectTeamMembers)
    .set({ hiddenAnnouncementId: announcementId })
    .where(and(eq(projectTeamMembers.teamId, membership.teamId), eq(projectTeamMembers.userId, userId)))
  await markAnnouncementSeen(userId, announcementId, database)
}
