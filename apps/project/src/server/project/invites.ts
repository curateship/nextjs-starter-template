import { and, asc, eq, gt, sql } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import {
  INVITE_LIFETIME_DAYS,
  type TeamInviteRole,
} from "@/lib/project/rules"
import { appUrlFor } from "@/server/app-url"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { createSecretToken, hashToken, now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { findMembership, requireTeamRunner } from "@/server/project/access"
import { sendInviteEmail } from "@/server/project/invite-email"
import {
  projectTeamInvites,
  projectTeamMembers,
  projectTeams,
} from "@/server/project/schema"
import { customShellUsers } from "@/server/schema"

/**
 * Invites to a team. An invite is for one email address, and only an account
 * signed in with that address can accept it. The link carries a secret whose
 * hash is stored, so the database alone can't be used to accept an invite.
 *
 * `/register` doesn't send a new account back to the link it came from, so
 * an invite also shows on the Projects page of whoever signs in with the
 * invited address. Either way in leads to the same accept.
 */

export type InviteActor = {
  id: string
  name: string
  currentWorkspaceId: string | null
}

export type SentInvite = {
  inviteId: string
  /** The link to copy, always returned so it can be shared by hand. */
  link: string
  emailed: boolean
  emailError?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Anyone can start a team and become its owner, so without a cap an invite is
 * a way to make Project email any address as often as someone likes. Each
 * inviter gets 30 emails an hour, and one address gets at most 5 a day from
 * all teams together.
 */
export const INVITE_LIMITS = {
  perInviter: { maxAttempts: 30, windowSeconds: 60 * 60 },
  perAddress: { maxAttempts: 5, windowSeconds: 24 * 60 * 60 },
} as const

async function enforceInviteLimits(actorId: string, email: string, database: typeof db) {
  await enforceRateLimit(`project-invite-from:${actorId}`, INVITE_LIMITS.perInviter, database)
  await enforceRateLimit(`project-invite-to:${email}`, INVITE_LIMITS.perAddress, database)
}

export async function createInvite(
  actor: InviteActor,
  input: { email: string; role: TeamInviteRole },
  database = db
): Promise<SentInvite> {
  const membership = await requireTeamRunner(actor.id, database)
  const email = input.email.trim().toLowerCase()

  const [onTeam] = await database
    .select({ userId: projectTeamMembers.userId })
    .from(projectTeamMembers)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
    .where(
      and(
        eq(projectTeamMembers.teamId, membership.teamId),
        eq(sql`lower(${customShellUsers.email})`, email)
      )
    )
    .limit(1)
  if (onTeam) throw new Error(PROJECT_ERRORS.alreadyOnYourTeam)
  await enforceInviteLimits(actor.id, email, database)

  const token = createSecretToken()
  const at = now()
  const values = {
    role: input.role,
    tokenHash: hashToken(token),
    invitedByUserId: actor.id,
    expiresAt: new Date(at.getTime() + INVITE_LIFETIME_DAYS * DAY_MS),
    sentAt: at,
  }
  // Inviting the same address again replaces the old invite and its link.
  const [invite] = await database
    .insert(projectTeamInvites)
    .values({ id: uuid(), teamId: membership.teamId, email, createdAt: at, ...values })
    .onConflictDoUpdate({
      target: [projectTeamInvites.teamId, projectTeamInvites.email],
      set: values,
    })
    .returning({ id: projectTeamInvites.id })

  return sendInvite(actor, membership.teamId, invite.id, email, token, database)
}

/** A fresh link and seven more days, sent again. The old link stops working. */
export async function resendInvite(
  actor: InviteActor,
  inviteId: string,
  database = db
): Promise<SentInvite> {
  const membership = await requireTeamRunner(actor.id, database)
  const [existing] = await database
    .select({ email: projectTeamInvites.email })
    .from(projectTeamInvites)
    .where(
      and(
        eq(projectTeamInvites.id, inviteId),
        eq(projectTeamInvites.teamId, membership.teamId)
      )
    )
    .limit(1)
  if (!existing) throw new Error(PROJECT_ERRORS.inviteNotFound)
  await enforceInviteLimits(actor.id, existing.email, database)
  const token = createSecretToken()
  const at = now()
  const [invite] = await database
    .update(projectTeamInvites)
    .set({
      tokenHash: hashToken(token),
      expiresAt: new Date(at.getTime() + INVITE_LIFETIME_DAYS * DAY_MS),
      sentAt: at,
    })
    .where(
      and(
        eq(projectTeamInvites.id, inviteId),
        eq(projectTeamInvites.teamId, membership.teamId)
      )
    )
    .returning({ id: projectTeamInvites.id, email: projectTeamInvites.email })
  if (!invite) throw new Error(PROJECT_ERRORS.inviteNotFound)
  return sendInvite(actor, membership.teamId, invite.id, invite.email, token, database)
}

export async function cancelInvite(actorId: string, inviteId: string, database = db) {
  const membership = await requireTeamRunner(actorId, database)
  await database
    .delete(projectTeamInvites)
    .where(
      and(
        eq(projectTeamInvites.id, inviteId),
        eq(projectTeamInvites.teamId, membership.teamId)
      )
    )
}

async function sendInvite(
  actor: InviteActor,
  teamId: string,
  inviteId: string,
  email: string,
  token: string,
  database: typeof db
): Promise<SentInvite> {
  const [team] = await database
    .select({ name: projectTeams.name })
    .from(projectTeams)
    .where(eq(projectTeams.id, teamId))
    .limit(1)
  const link = appUrlFor(`/invite/${encodeURIComponent(token)}`)
  const sent = await sendInviteEmail(
    {
      to: email,
      teamName: team?.name ?? "your team",
      inviterName: actor.name,
      link,
      workspaceId: actor.currentWorkspaceId,
    },
    database
  )
  return { inviteId, link, emailed: sent.emailed, emailError: sent.error }
}

export type InviteForMe = {
  id: string
  teamName: string
  invitedByName: string | null
  role: TeamInviteRole
  email: string
  /** Why it can't be accepted yet, or null when it can. */
  blocker: "expired" | "wrong-email" | "already-on-team" | null
}

type Invitee = { id: string; email: string }

/** The invite behind a link, as the signed-in person sees it. */
export async function loadInviteByToken(
  user: Invitee,
  token: string,
  database = db
): Promise<InviteForMe | null> {
  const [row] = await inviteQuery(database).where(
    eq(projectTeamInvites.tokenHash, hashToken(token))
  )
  return row ? describeInvite(user, row, database) : null
}

/** Every open invite to this person's email, for the Projects page. */
export async function listInvitesForMe(
  user: Invitee,
  database = db
): Promise<InviteForMe[]> {
  const rows = await inviteQuery(database)
    .where(
      and(
        eq(projectTeamInvites.email, user.email.toLowerCase()),
        gt(projectTeamInvites.expiresAt, now())
      )
    )
    .orderBy(asc(projectTeams.name))
  return Promise.all(rows.map((row) => describeInvite(user, row, database)))
}

export async function acceptInvite(
  user: Invitee,
  inviteId: string,
  database = db
): Promise<{ teamId: string }> {
  return database.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(projectTeamInvites)
      .where(eq(projectTeamInvites.id, inviteId))
      .limit(1)
    if (!invite) throw new Error(PROJECT_ERRORS.inviteNotFound)
    if (invite.email !== user.email.toLowerCase()) {
      throw new Error(PROJECT_ERRORS.inviteWrongEmail)
    }
    if (invite.expiresAt <= now()) throw new Error(PROJECT_ERRORS.inviteExpired)
    if (await findMembership(user.id, tx)) throw new Error(PROJECT_ERRORS.alreadyOnTeam)

    await tx.insert(projectTeamMembers).values({
      teamId: invite.teamId,
      userId: user.id,
      role: invite.role,
      joinedAt: now(),
    })
    await tx.delete(projectTeamInvites).where(eq(projectTeamInvites.id, invite.id))
    return { teamId: invite.teamId }
  })
}

/** Turning an invite down deletes it. Only the invited address can. */
export async function declineInvite(user: Invitee, inviteId: string, database = db) {
  await database
    .delete(projectTeamInvites)
    .where(
      and(
        eq(projectTeamInvites.id, inviteId),
        eq(projectTeamInvites.email, user.email.toLowerCase())
      )
    )
}

function inviteQuery(database: typeof db) {
  return database
    .select({
      id: projectTeamInvites.id,
      email: projectTeamInvites.email,
      role: projectTeamInvites.role,
      expiresAt: projectTeamInvites.expiresAt,
      teamName: projectTeams.name,
      invitedByName: customShellUsers.name,
    })
    .from(projectTeamInvites)
    .innerJoin(projectTeams, eq(projectTeams.id, projectTeamInvites.teamId))
    .leftJoin(
      customShellUsers,
      eq(customShellUsers.id, projectTeamInvites.invitedByUserId)
    )
    .$dynamic()
}

async function describeInvite(
  user: Invitee,
  row: {
    id: string
    email: string
    role: TeamInviteRole
    expiresAt: Date
    teamName: string
    invitedByName: string | null
  },
  database: typeof db
): Promise<InviteForMe> {
  const blocker =
    row.expiresAt <= now()
      ? "expired"
      : row.email !== user.email.toLowerCase()
        ? "wrong-email"
        : (await findMembership(user.id, database))
          ? "already-on-team"
          : null
  return {
    id: row.id,
    teamName: row.teamName,
    invitedByName: row.invitedByName,
    role: row.role,
    email: row.email,
    blocker,
  }
}
