import { and, eq, isNull } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { isNetwork, type Network } from "@/lib/social/networks"

import { promoAccounts, promoProjects } from "./schema"

/**
 * Pausing an account, one network of a project, or a whole project.
 *
 * A paused account stays in every list and does not post, warm up or take a
 * health reading until it is resumed. Pausing a project pauses every account
 * in it, and pausing one of its networks pauses that network's accounts while
 * the rest of the project runs (Medium task, part 5). Unlike retiring, a
 * pause is meant to end, and resuming puts everything back as it was. A
 * comment pressed before the pause waits, and can still be cancelled.
 */

type PauseFields = Pick<typeof promoAccounts.$inferSelect, "pausedAt" | "projectId"> & {
  /** The account's network. Left out, a network's own pause is not looked at. */
  platform?: string
}

/** What paused an account: itself, its project, its network inside its project, or null when it runs. */
export type PausedBy = "account" | "project" | "network" | null

/** Whether the account is paused, by itself, through its project or through its network there. */
export async function pausedBy(
  userId: string,
  account: PauseFields,
  db: CustomShellDb = defaultDb
): Promise<PausedBy> {
  if (account.pausedAt) return "account"
  if (!account.projectId) return null
  const [project] = await db
    .select({ pausedAt: promoProjects.pausedAt, pausedNetworks: promoProjects.pausedNetworks })
    .from(promoProjects)
    .where(and(eq(promoProjects.id, account.projectId), eq(promoProjects.userId, userId)))
    .limit(1)
  if (project?.pausedAt) return "project"
  if (account.platform && project?.pausedNetworks.includes(account.platform as Network)) return "network"
  return null
}

/**
 * Pauses or resumes accounts, in one request. A retired account, or one that
 * is not the person's, is left out and reported as skipped.
 */
export async function setAccountsPaused(
  userId: string,
  accountIds: string[],
  paused: boolean,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ completed: string[]; skipped: string[] }> {
  const ids = [...new Set(accountIds)]
  const changed: string[] = []
  for (const id of ids) {
    const rows = await db
      .update(promoAccounts)
      .set({ pausedAt: paused ? now : null, updatedAt: now })
      .where(
        and(
          eq(promoAccounts.id, id),
          eq(promoAccounts.userId, userId),
          isNull(promoAccounts.retiredAt)
        )
      )
      .returning({ id: promoAccounts.id })
    if (rows.length) changed.push(id)
  }
  return { completed: changed, skipped: ids.filter((id) => !changed.includes(id)) }
}

/** Pauses or resumes a whole project, which pauses or resumes every account in it. */
export async function setProjectPaused(
  userId: string,
  projectId: string,
  paused: boolean,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const rows = await db
    .update(promoProjects)
    .set({ pausedAt: paused ? now : null, updatedAt: now })
    .where(and(eq(promoProjects.id, projectId), eq(promoProjects.userId, userId)))
    .returning({ id: promoProjects.id })
  if (!rows.length) throw new Error("That project does not exist.")
}

/**
 * Pauses or resumes one network of a project: its accounts there stop
 * posting and warming up, and the project's other networks keep running.
 */
export async function setProjectNetworkPaused(
  userId: string,
  projectId: string,
  network: Network,
  paused: boolean,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<Network[]> {
  if (!isNetwork(network)) throw new Error("Promo cannot use that network yet.")
  const [project] = await db
    .select({ networks: promoProjects.networks, pausedNetworks: promoProjects.pausedNetworks })
    .from(promoProjects)
    .where(and(eq(promoProjects.id, projectId), eq(promoProjects.userId, userId)))
    .limit(1)
  if (!project) throw new Error("That project does not exist.")
  if (!project.networks.includes(network)) throw new Error("This project does not use that network.")
  const rest = project.pausedNetworks.filter((item) => item !== network && isNetwork(item))
  const next = paused ? [...rest, network] : rest
  await db
    .update(promoProjects)
    .set({ pausedNetworks: next, updatedAt: now })
    .where(and(eq(promoProjects.id, projectId), eq(promoProjects.userId, userId)))
  return next
}
