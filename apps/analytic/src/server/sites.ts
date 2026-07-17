import { randomBytes } from "node:crypto"

import { and, asc, eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { analyticEvents, analyticSites, type AnalyticSite } from "@/server/schema"
import { now, uuid } from "@/server/security"

export type SiteItem = {
  id: string
  name: string
  domain: string
  public_id: string
  created_at: string
  updated_at: string
}

// Non-secret token embedded in the snippet. 16 random bytes -> 32 hex chars.
export function generatePublicId() {
  return randomBytes(16).toString("hex")
}

function cleanName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("Site name is required")
  return trimmed.slice(0, 255)
}

// Store a bare hostname: strip scheme, path, and a leading "www.".
export function cleanDomain(domain: string) {
  const trimmed = domain.trim()
  if (!trimmed) throw new Error("Website address is required")

  let host = trimmed
  try {
    host = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`)
      .hostname
  } catch {
    host = trimmed
  }

  return host.replace(/^www\./i, "").toLowerCase().slice(0, 255)
}

export async function listUserSites(
  userId: string,
  database: CustomShellDb = db
): Promise<AnalyticSite[]> {
  return database
    .select()
    .from(analyticSites)
    .where(eq(analyticSites.userId, userId))
    .orderBy(asc(analyticSites.createdAt))
}

export async function getUserSite(
  userId: string,
  siteId: string,
  database: CustomShellDb = db
): Promise<AnalyticSite> {
  const [site] = await database
    .select()
    .from(analyticSites)
    .where(and(eq(analyticSites.id, siteId), eq(analyticSites.userId, userId)))
    .limit(1)

  if (!site) throw new Error("Site not found")
  return site
}

export async function createUserSite(
  userId: string,
  input: { name: string; domain: string },
  database: CustomShellDb = db
): Promise<AnalyticSite> {
  const name = cleanName(input.name)
  const domain = cleanDomain(input.domain)
  const createdAt = now()

  // Retry on the (astronomically unlikely) public_id collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const [site] = await database
        .insert(analyticSites)
        .values({
          id: uuid(),
          userId,
          name,
          domain,
          publicId: generatePublicId(),
          createdAt,
          updatedAt: createdAt,
        })
        .returning()

      if (!site) throw new Error("Site was not created")
      return site
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 4) continue
      throw error
    }
  }

  throw new Error("Site was not created")
}

export async function updateUserSite(
  userId: string,
  siteId: string,
  input: { name: string; domain: string },
  database: CustomShellDb = db
): Promise<AnalyticSite> {
  const name = cleanName(input.name)
  const domain = cleanDomain(input.domain)

  const [site] = await database
    .update(analyticSites)
    .set({ name, domain, updatedAt: now() })
    .where(and(eq(analyticSites.id, siteId), eq(analyticSites.userId, userId)))
    .returning()

  if (!site) throw new Error("Site not found")
  return site
}

export async function deleteUserSite(
  userId: string,
  siteId: string,
  database: CustomShellDb = db
): Promise<{ siteId: string }> {
  const [deleted] = await database
    .delete(analyticSites)
    .where(and(eq(analyticSites.id, siteId), eq(analyticSites.userId, userId)))
    .returning({ id: analyticSites.id })

  if (!deleted) throw new Error("Site not found")
  return { siteId: deleted.id }
}

// Used by the ingest endpoint to resolve tenancy from the snippet's public id.
export async function resolveSiteByPublicId(
  publicId: string,
  database: CustomShellDb = db
): Promise<{ id: string; domain: string } | null> {
  const [site] = await database
    .select({ id: analyticSites.id, domain: analyticSites.domain })
    .from(analyticSites)
    .where(eq(analyticSites.publicId, publicId))
    .limit(1)

  return site ?? null
}

// Powers the "waiting for first visit / receiving data" status.
export async function siteHasEvents(
  siteId: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const [row] = await database
    .select({ id: analyticEvents.id })
    .from(analyticEvents)
    .where(eq(analyticEvents.siteId, siteId))
    .limit(1)

  return Boolean(row)
}

export function serializeSite(site: AnalyticSite): SiteItem {
  return {
    id: site.id,
    name: site.name,
    domain: site.domain,
    public_id: site.publicId,
    created_at: site.createdAt.toISOString(),
    updated_at: site.updatedAt.toISOString(),
  }
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  )
}
