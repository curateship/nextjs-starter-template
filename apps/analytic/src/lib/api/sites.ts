import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

export type SiteItem = {
  id: string
  name: string
  domain: string
  public_id: string
  created_at: string
  updated_at: string
}

export type SiteListResponse = {
  sites: SiteItem[]
}

export type SiteDetailResponse = {
  site: SiteItem
  receivingData: boolean
}

export type SiteInstallStatus = {
  receivingData: boolean
}

const createSiteSchema = z.object({
  name: z.string().min(1).max(255),
  domain: z.string().min(1).max(255),
})

const updateSiteSchema = z.object({
  siteId: z.string().min(1),
  name: z.string().min(1).max(255),
  domain: z.string().min(1).max(255),
})

const siteIdSchema = z.object({
  siteId: z.string().min(1),
})

export function getSiteErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Site request failed."
}

const loadSitesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SiteListResponse> => {
    const user = await requireUser()
    return siteListForUser(user.id)
  }
)

const loadSiteDetailFn = createServerFn({ method: "GET" })
  .inputValidator(siteIdSchema)
  .handler(async ({ data }): Promise<SiteDetailResponse> => {
    const { getUserSite, serializeSite, siteHasEvents } = await import(
      "@/server/sites"
    )
    const user = await requireUser()
    const site = await getUserSite(user.id, data.siteId)
    return {
      site: serializeSite(site),
      receivingData: await siteHasEvents(site.id),
    }
  })

const siteInstallStatusFn = createServerFn({ method: "GET" })
  .inputValidator(siteIdSchema)
  .handler(async ({ data }): Promise<SiteInstallStatus> => {
    const { getUserSite, siteHasEvents } = await import("@/server/sites")
    const user = await requireUser()
    const site = await getUserSite(user.id, data.siteId)
    return { receivingData: await siteHasEvents(site.id) }
  })

const createSiteFn = createServerFn({ method: "POST" })
  .inputValidator(createSiteSchema)
  .handler(async ({ data }): Promise<SiteListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { createUserSite } = await import("@/server/sites")
    requireAppOrigin()
    const user = await requireUser()
    await createUserSite(user.id, data)
    return siteListForUser(user.id)
  })

const updateSiteFn = createServerFn({ method: "POST" })
  .inputValidator(updateSiteSchema)
  .handler(async ({ data }): Promise<SiteListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { updateUserSite } = await import("@/server/sites")
    requireAppOrigin()
    const user = await requireUser()
    await updateUserSite(user.id, data.siteId, {
      name: data.name,
      domain: data.domain,
    })
    return siteListForUser(user.id)
  })

const deleteSiteFn = createServerFn({ method: "POST" })
  .inputValidator(siteIdSchema)
  .handler(async ({ data }): Promise<SiteListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { deleteUserSite } = await import("@/server/sites")
    requireAppOrigin()
    const user = await requireUser()
    await deleteUserSite(user.id, data.siteId)
    return siteListForUser(user.id)
  })

export function loadSites() {
  return loadSitesFn()
}

export function loadSiteDetail(siteId: string) {
  return loadSiteDetailFn({ data: { siteId } })
}

export function getSiteInstallStatus(siteId: string) {
  return siteInstallStatusFn({ data: { siteId } })
}

export function createSite(name: string, domain: string) {
  return createSiteFn({ data: { name, domain } })
}

export function updateSite(siteId: string, name: string, domain: string) {
  return updateSiteFn({ data: { siteId, name, domain } })
}

export function deleteSite(siteId: string) {
  return deleteSiteFn({ data: { siteId } })
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}

async function siteListForUser(userId: string): Promise<SiteListResponse> {
  const { listUserSites, serializeSite } = await import("@/server/sites")
  const sites = await listUserSites(userId)
  return { sites: sites.map(serializeSite) }
}
