import { and, eq, sql } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { inviteSchema } from "@/lib/project/rules"
import { appUrlFor } from "@/server/app-url"
import { getAuthLinkContext, createWorkspaceAuthToken } from "@/server/auth/link-expiry"
import { RateLimitError, enforceRateLimit } from "@/server/auth/rate-limit"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { sendAuthEmail } from "@/server/email/send"
import { requireTeamRunner, type ProjectDb } from "@/server/project/access"
import { sendInviteEmail } from "@/server/project/invite-email"
import { projectTeamMembers, projectTeams } from "@/server/project/schema"
import { giveStarterTasks } from "@/server/project/starter-tasks"
import { joinWholeTeamProjects } from "@/server/project/whole-team"
import { inviteAccount } from "@/server/people/invite"
import { customShellUsers } from "@/server/schema"

/**
 * Inviting someone makes them an employee: an account with Project's
 * `employee` role, put on the team the moment it is made. Tyler, 16 Oct 2026:
 * employees are shell accounts with a role of their own, sign in on the one
 * `/login`, and see only Project.
 *
 * A new address gets the shell's "Set your password" email (`inviteAccount`),
 * whose one-time link sets the password and signs them in on My dashboard. An
 * employee who already has an account but no team is put on this one and told
 * by email. An address on a team already is refused, and so is an account
 * that isn't an employee, since an admin or a member is never moved onto a
 * team by an invite.
 *
 * Only the site admin invites.
 */

export const EMPLOYEE_ROLE = "employee"

export type InviteActor = {
  id: string
  name: string
  currentWorkspaceId: string | null
}

export type SentInvite = {
  userId: string
  /** False when this server has email switched off, so the link went to the server log. */
  emailed: boolean
}

/**
 * An invite emails an address on the site admin's say-so, so it keeps a cap:
 * 30 an hour from one inviter, and 5 a day to one address.
 */
export const INVITE_LIMITS = {
  perInviter: { maxAttempts: 30, windowSeconds: 60 * 60 },
  perAddress: { maxAttempts: 5, windowSeconds: 24 * 60 * 60 },
} as const

async function enforceInviteLimits(actorId: string, email: string, database: ProjectDb) {
  await enforceRateLimit(`project-invite-from:${actorId}`, INVITE_LIMITS.perInviter, database as typeof db)
  await enforceRateLimit(`project-invite-to:${email}`, INVITE_LIMITS.perAddress, database as typeof db)
}

/**
 * "ben.tester@acme.com" becomes "Ben Tester", so the account has a name before
 * its person sets their own on Account → Profile.
 */
function nameFromEmail(email: string) {
  const local = email.split("@")[0] ?? ""
  const words = local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  return (words.join(" ") || email).slice(0, 255)
}

export async function createInvite(
  actor: InviteActor,
  input: { email: string; name?: string },
  database = db
): Promise<SentInvite> {
  const membership = await requireTeamRunner(actor.id, database)
  const email = input.email.trim().toLowerCase()
  await requireFreeAddress(email, database)
  await enforceInviteLimits(actor.id, email, database)
  return addEmployee(
    { email, name: input.name?.trim() || nameFromEmail(email), teamId: membership.teamId },
    { inviterName: actor.name, workspaceId: actor.currentWorkspaceId },
    database
  )
}

/**
 * Makes or finds the employee and puts them on the team. Shared with the join
 * link, which runs its own checks first.
 */
export async function addEmployee(
  person: { email: string; name: string; teamId: string },
  sender: { inviterName: string; workspaceId: string | null },
  database = db
): Promise<SentInvite> {
  const existing = await accountFor(person.email, database)
  if (existing) {
    // Only an employee is ever moved onto a team, whoever called this.
    if (existing.role !== EMPLOYEE_ROLE) throw new Error(PROJECT_ERRORS.emailNotAnEmployee)
    if (existing.hasPassword) {
      await putOnTeam(person.teamId, existing.id, database)
      return { userId: existing.id, emailed: await tellAddedToTeam(person, sender, database) }
    }
    // The link goes first, so a mail that can't be sent leaves nothing half done.
    const emailed = await sendSetPasswordLink(existing, database)
    await putOnTeam(person.teamId, existing.id, database)
    return { userId: existing.id, emailed }
  }
  let made: { id: string; delivered: boolean }
  try {
    made = await inviteAccount({ email: person.email, name: person.name, role: EMPLOYEE_ROLE }, database)
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message === "ACCOUNT_EXISTS") throw new Error(PROJECT_ERRORS.emailNotAnEmployee)
    if (message === "INVALID_NAME") throw new Error(PROJECT_ERRORS.joinNeedsName)
    // A refused address is the checker's list of issues; it says what's wrong itself.
    if (message.startsWith("[")) throw error
    // Otherwise the mail didn't go, and the shell removed the fresh account
    // again, so the invite can simply be sent once more.
    throw new Error(PROJECT_ERRORS.inviteNotSent)
  }
  await putOnTeam(person.teamId, made.id, database)
  return { userId: made.id, emailed: made.delivered }
}

/** What happened to one address of a send with several. */
export type InviteOutcome =
  | { email: string; result: "sent"; sent: SentInvite }
  | { email: string; result: "on_team" | "not_an_employee" | "not_an_email" | "too_many" | "not_sent" }

/**
 * Invites several addresses, one at a time through `createInvite`, so each
 * keeps the same checks, caps and email. A refused address stops only itself;
 * the window lists it with the reason.
 */
export async function createInvites(
  actor: InviteActor,
  input: { emails: string[] },
  database = db
): Promise<InviteOutcome[]> {
  await requireTeamRunner(actor.id, database)
  const emails = [...new Set(input.emails.map((email) => email.trim().toLowerCase()))]
  const outcomes: InviteOutcome[] = []
  for (const email of emails) {
    if (!inviteSchema.shape.email.safeParse(email).success) {
      outcomes.push({ email, result: "not_an_email" })
      continue
    }
    try {
      outcomes.push({ email, result: "sent", sent: await createInvite(actor, { email }, database) })
    } catch (error) {
      const refused = error instanceof RateLimitError ? "too_many" : refusalFor(error)
      if (!refused) throw error
      outcomes.push({ email, result: refused })
    }
  }
  return outcomes
}

function refusalFor(error: unknown) {
  if (!(error instanceof Error)) return null
  if (error.message === PROJECT_ERRORS.emailOnATeam) return "on_team" as const
  if (error.message === PROJECT_ERRORS.emailNotAnEmployee) return "not_an_employee" as const
  if (error.message === PROJECT_ERRORS.inviteNotSent) return "not_sent" as const
  return null
}

/**
 * A fresh "Set your password" link for someone invited who hasn't opened
 * theirs. The old link stops working the way any reset link does when a newer
 * one is made.
 */
export async function resendInvite(
  actor: InviteActor,
  userId: string,
  database = db
): Promise<SentInvite> {
  const membership = await requireTeamRunner(actor.id, database)
  const [person] = await database
    .select({
      id: customShellUsers.id,
      email: customShellUsers.email,
      name: customShellUsers.name,
      passwordHash: customShellUsers.passwordHash,
    })
    .from(projectTeamMembers)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
    .where(and(eq(projectTeamMembers.teamId, membership.teamId), eq(projectTeamMembers.userId, userId)))
    .limit(1)
  if (!person) throw new Error(PROJECT_ERRORS.personNotOnTeam)
  if (person.passwordHash) throw new Error(PROJECT_ERRORS.alreadySignedIn)
  await enforceInviteLimits(actor.id, person.email, database)
  return { userId: person.id, emailed: await sendSetPasswordLink(person, database) }
}

/** Refuses an address that is on a team already. */
async function requireFreeAddress(email: string, database: ProjectDb) {
  const existing = await accountFor(email, database)
  if (!existing) return
  if (existing.role !== EMPLOYEE_ROLE) throw new Error(PROJECT_ERRORS.emailNotAnEmployee)
  if (existing.onTeam) throw new Error(PROJECT_ERRORS.emailOnATeam)
}

async function accountFor(email: string, database: ProjectDb) {
  const [row] = await database
    .select({
      id: customShellUsers.id,
      email: customShellUsers.email,
      name: customShellUsers.name,
      role: customShellUsers.role,
      passwordHash: customShellUsers.passwordHash,
      teamId: projectTeamMembers.teamId,
    })
    .from(customShellUsers)
    .leftJoin(projectTeamMembers, eq(projectTeamMembers.userId, customShellUsers.id))
    .where(eq(sql`lower(${customShellUsers.email})`, email))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    hasPassword: row.passwordHash !== null,
    onTeam: row.teamId !== null,
  }
}

async function putOnTeam(teamId: string, userId: string, database: typeof db) {
  await database.transaction(async (tx) => {
    const added = await tx
      .insert(projectTeamMembers)
      .values({ teamId, userId, role: "member", joinedAt: now() })
      .onConflictDoNothing()
      .returning({ userId: projectTeamMembers.userId })
    // Someone already on a team stays where they are.
    if (!added.length) throw new Error(PROJECT_ERRORS.emailOnATeam)
    await giveStarterTasks(teamId, userId, tx)
    await joinWholeTeamProjects(teamId, userId, tx)
  })
}

/** The shell's own "Set your password" email, sent again. */
async function sendSetPasswordLink(
  person: { id: string; email: string; name: string },
  database: typeof db
): Promise<boolean> {
  const linkContext = await getAuthLinkContext(database)
  const token = await createWorkspaceAuthToken(person.id, "reset_password", database, {
    context: linkContext,
  })
  try {
    const sent = await sendAuthEmail(
      {
        kind: "new-account",
        to: person.email,
        recipientName: person.name,
        workspaceId: linkContext.workspaceId ?? undefined,
        linkExpiry: linkContext.expiry,
        showFailureReasonToAdmin: true,
        actionUrl: appUrlFor(`/reset-password?token=${encodeURIComponent(token)}`),
      },
      { retryOnFailure: false, database }
    )
    return sent.delivered
  } catch {
    throw new Error(PROJECT_ERRORS.inviteNotSent)
  }
}

/** An employee with a password already, put on a new team, is told by email. */
async function tellAddedToTeam(
  person: { email: string; teamId: string },
  sender: { inviterName: string; workspaceId: string | null },
  database: typeof db
) {
  const [team] = await database
    .select({ name: projectTeams.name })
    .from(projectTeams)
    .where(eq(projectTeams.id, person.teamId))
    .limit(1)
  const sent = await sendInviteEmail(
    {
      to: person.email,
      teamName: team?.name ?? "your team",
      inviterName: sender.inviterName,
      link: appUrlFor("/login"),
      workspaceId: sender.workspaceId,
    },
    database
  )
  return sent.emailed
}
