import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "@/lib/api/error-message"
import {
  MAX_FOOTER_TEXT,
  MAX_META_DESCRIPTION,
  MAX_NAV_LABEL,
  MAX_NAV_LINKS,
  MAX_SITE_TAGLINE,
  MAX_SITE_TITLE,
} from "@/lib/sites/site-settings"
import { SITE_STATUSES } from "@/lib/sites/site-status"
import { MAX_CUSTOM_DOMAIN, MAX_SUBDOMAIN } from "@/lib/sites/subdomain"
import { adminGet, adminPost } from "@/server/guards"
import { answerForRequest, siteBaseDomain } from "@/server/sites/host"
import {
  createSite,
  deleteSite,
  listSites,
  MAX_SITE_DESCRIPTION,
  MAX_SITE_NAME,
  siteDeleteImpact,
  updateSite,
  type Site,
  type SiteDeleteImpact,
} from "@/server/sites/sites"

export type { Site, SiteDeleteImpact }

const siteId = z.string().min(1).max(36)

const settingsInput = z.object({
  title: z.string().max(MAX_SITE_TITLE),
  tagline: z.string().max(MAX_SITE_TAGLINE),
  logo: z.string().max(2000),
  favicon: z.string().max(2000),
  themeColor: z.string().max(20),
  navigation: z
    .array(
      z.object({
        label: z.string().max(MAX_NAV_LABEL),
        href: z.string().max(2000),
      })
    )
    .max(MAX_NAV_LINKS),
  footerText: z.string().max(MAX_FOOTER_TEXT),
  metaDescription: z.string().max(MAX_META_DESCRIPTION),
  maintenance: z.boolean(),
})

const siteInput = z.object({
  name: z.string().min(1).max(MAX_SITE_NAME),
  description: z.string().max(MAX_SITE_DESCRIPTION),
  subdomain: z.string().min(1).max(MAX_SUBDOMAIN),
  customDomain: z.string().max(MAX_CUSTOM_DOMAIN),
  status: z.enum(SITE_STATUSES),
  settings: settingsInput,
})

/**
 * The admin list, with the domain sites hang off.
 *
 * The base domain rides along because it is a server value — the dialog shows
 * the address as it is typed, and it cannot work that out on its own.
 */
const loadSitesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<{ sites: Site[]; baseDomain: string }> => ({
    sites: await listSites(),
    baseDomain: siteBaseDomain(),
  }))

const createSiteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(siteInput)
  .handler(async ({ data }): Promise<Site> => createSite(data))

const updateSiteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(siteInput.extend({ id: siteId }))
  .handler(async ({ data }): Promise<Site> => updateSite(data))

const siteDeleteImpactFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: siteId }))
  .handler(async ({ data }): Promise<SiteDeleteImpact> => siteDeleteImpact(data.id))

const deleteSiteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: siteId }))
  .handler(async ({ data }) => {
    await deleteSite(data.id)
    return { ok: true }
  })

/**
 * Which site the visitor is on, from the domain they typed.
 *
 * Open to everyone, because it answers before anybody has signed in — it is
 * what tells a public page whose site it is drawing. It takes no arguments on
 * purpose: the host is read from the request on the server, never sent by the
 * browser, or a visitor could ask for any site they liked including a
 * switched-off one.
 *
 * What comes back is only what a page needs to draw itself. The site's note,
 * its state and when it was made stay on the admin side.
 */
const resolveSiteFn = createServerFn({ method: "GET" }).handler(async () => {
  const answer = await answerForRequest()
  if (answer.kind !== "site") return { kind: answer.kind }

  const { site } = answer
  return {
    kind: "site" as const,
    site: {
      id: site.id,
      name: site.name,
      subdomain: site.subdomain,
      settings: site.settings,
    },
  }
})

type SiteAnswer = Awaited<ReturnType<typeof resolveSiteFn>>

/** One site, as a public page sees it. */
export type PublicSite = Extract<SiteAnswer, { kind: "site" }>["site"]

export function loadSites() {
  return loadSitesFn()
}

export function saveNewSite(input: z.infer<typeof siteInput>) {
  return createSiteFn({ data: input })
}

export function saveSite(input: z.infer<typeof siteInput> & { id: string }) {
  return updateSiteFn({ data: input })
}

export function loadSiteDeleteImpact(id: string) {
  return siteDeleteImpactFn({ data: { id } })
}

export function removeSite(id: string) {
  return deleteSiteFn({ data: { id } })
}

export function loadCurrentSite() {
  return resolveSiteFn()
}

/**
 * The server's own sentences reach the admin as written — they already say what
 * went wrong and which address caused it. Only the guards' bare codes need
 * turning into words.
 */
export function getSiteErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ""
  return (
    describeAuthError(message) ??
    (message || "That could not be done. Please try again.")
  )
}
