import { and, asc, eq, ne } from "drizzle-orm"

import {
  cleanSiteSettings,
  type SiteSettings,
} from "@/lib/sites/site-settings"
import {
  cleanCustomDomain,
  cleanSubdomain,
  customDomainProblem,
  subdomainProblem,
} from "@/lib/sites/subdomain"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { dropSiteCache, siteBaseDomain } from "@/server/sites/host"
import { SITE_STATUSES, type SiteStatus } from "@/lib/sites/site-status"
import { sites, type SiteRow } from "@/server/sites/schema"

/** The longest a site's name and its note may be. */
export const MAX_SITE_NAME = 120
export const MAX_SITE_DESCRIPTION = 500

/** One site, as every screen and endpoint sees it. */
export type Site = {
  id: string
  name: string
  description: string
  subdomain: string
  customDomain: string
  status: SiteStatus
  settings: SiteSettings
  /** The address this site answers on, worked out rather than stored. */
  address: string
  createdAt: string
  updatedAt: string
}

export type SiteInput = {
  name: string
  description: string
  subdomain: string
  customDomain: string
  status: SiteStatus
  settings: SiteSettings
}

function toSite(row: SiteRow): Site {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    subdomain: row.subdomain,
    customDomain: row.customDomain,
    status: row.status as SiteStatus,
    settings: cleanSiteSettings(row.settings),
    address: row.customDomain || `${row.subdomain}.${siteBaseDomain()}`,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * Everything the form sent, checked and tidied.
 *
 * The same rules the browser applied, applied again — the form is a courtesy to
 * whoever is typing, not a gate. Refusals are sentences because an admin reads
 * them and there is nothing else to turn them into.
 */
function cleanInput(input: SiteInput) {
  const name = input.name.trim().slice(0, MAX_SITE_NAME)
  if (!name) throw new Error("A site needs a name.")

  const subdomain = cleanSubdomain(input.subdomain)
  const addressProblem = subdomainProblem(subdomain)
  if (addressProblem) throw new Error(addressProblem)

  const customDomain = cleanCustomDomain(input.customDomain)
  const domainProblem = customDomainProblem(customDomain)
  if (domainProblem) throw new Error(domainProblem)

  if (!SITE_STATUSES.includes(input.status)) {
    throw new Error("That is not a state a site can be in.")
  }

  return {
    name,
    description: input.description.trim().slice(0, MAX_SITE_DESCRIPTION),
    subdomain,
    customDomain,
    status: input.status,
    settings: cleanSiteSettings(input.settings),
  }
}

/**
 * Refuses an address another site already answers on.
 *
 * Checked here as well as by the unique indexes, because a database saying
 * "duplicate key value violates constraint sites_subdomain_key" is not
 * something to show anybody. The indexes are still what makes it true when two
 * admins save at the same moment.
 */
async function requireFreeAddresses(
  values: { subdomain: string; customDomain: string },
  exceptId: string | null,
  database: CustomShellDb
) {
  const notItself = exceptId ? ne(sites.id, exceptId) : undefined

  const [subdomainTaken] = await database
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.subdomain, values.subdomain), notItself))
    .limit(1)

  if (subdomainTaken) {
    throw new Error(`Another site already answers on ${values.subdomain}.`)
  }

  if (!values.customDomain) return

  const [domainTaken] = await database
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.customDomain, values.customDomain), notItself))
    .limit(1)

  if (domainTaken) {
    throw new Error(`Another site already uses ${values.customDomain}.`)
  }
}

/**
 * Turns the database's own complaint about a taken address into the sentence
 * the check above would have given.
 *
 * The check and the unique indexes are not the same thing. The check is what
 * makes the message readable; the indexes are what make it *true* when two
 * admins save the same address in the same instant, and one of them then gets
 * a Postgres error rather than a refusal. Without this, that admin would be
 * shown "duplicate key value violates unique constraint sites_subdomain_key".
 */
export function describeAddressClash(error: unknown, values: { subdomain: string; customDomain: string }) {
  const constraint =
    error && typeof error === "object" && "constraint" in error
      ? String((error as { constraint?: unknown }).constraint ?? "")
      : ""

  if (constraint === "sites_subdomain_key") {
    return new Error(`Another site already answers on ${values.subdomain}.`)
  }
  if (constraint === "sites_custom_domain_key") {
    return new Error(`Another site already uses ${values.customDomain}.`)
  }

  return error
}

/** Every site, oldest first, for the admin list. */
export async function listSites(database: CustomShellDb = db): Promise<Site[]> {
  const rows = await database.select().from(sites).orderBy(asc(sites.createdAt))
  return rows.map(toSite)
}

export async function getSite(
  id: string,
  database: CustomShellDb = db
): Promise<Site> {
  const [row] = await database.select().from(sites).where(eq(sites.id, id)).limit(1)
  if (!row) throw new Error("That site no longer exists.")
  return toSite(row)
}

export async function createSite(
  input: SiteInput,
  database: CustomShellDb = db
): Promise<Site> {
  const values = cleanInput(input)
  await requireFreeAddresses(values, null, database)

  const timestamp = now()
  const [row] = await database
    .insert(sites)
    .values({ id: uuid(), ...values, createdAt: timestamp, updatedAt: timestamp })
    .returning()
    .catch((error) => {
      throw describeAddressClash(error, values)
    })

  if (!row) throw new Error("The site was not created.")

  dropSiteCache()
  return toSite(row)
}

export async function updateSite(
  input: SiteInput & { id: string },
  database: CustomShellDb = db
): Promise<Site> {
  const values = cleanInput(input)
  await requireFreeAddresses(values, input.id, database)

  const [row] = await database
    .update(sites)
    .set({ ...values, updatedAt: now() })
    .where(eq(sites.id, input.id))
    .returning()
    .catch((error) => {
      throw describeAddressClash(error, values)
    })

  if (!row) throw new Error("That site no longer exists.")

  dropSiteCache()
  return toSite(row)
}

/** What deleting this site takes with it, for the confirm window to say. */
export type SiteDeleteImpact = {
  name: string
  address: string
}

export async function siteDeleteImpact(
  id: string,
  database: CustomShellDb = db
): Promise<SiteDeleteImpact> {
  const site = await getSite(id, database)
  return { name: site.name, address: site.address }
}

export async function deleteSite(id: string, database: CustomShellDb = db) {
  const [row] = await database
    .delete(sites)
    .where(eq(sites.id, id))
    .returning({ id: sites.id })

  if (!row) throw new Error("That site no longer exists.")

  dropSiteCache()
}
