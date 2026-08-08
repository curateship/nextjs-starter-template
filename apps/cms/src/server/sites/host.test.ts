import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { emptySiteSettings } from "@/lib/sites/site-settings"
import { now, uuid } from "@/server/auth/security"
import { createTestDatabase, type TestDatabase } from "@/server/test-support"
import {
  dropSiteCache,
  hostBelongsToThisApp,
  isPlatformHost,
  normalizeHost,
  resolveSiteByHost,
} from "@/server/sites/host"
import type { SiteStatus } from "@/lib/sites/site-status"
import { sites } from "@/server/sites/schema"

/**
 * Which site a visitor lands on is decided entirely by the domain they typed,
 * so these are the rules that decide who sees what. The two that matter most:
 * a switched-off site is indistinguishable from one that never existed, and the
 * deployment's own addresses can never be taken by a site.
 */

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  // The cache lives in the module, so a previous test's rows would otherwise
  // still be answering in this one.
  dropSiteCache()
})

afterEach(async () => {
  await client.close()
})

async function addSite(values: {
  subdomain: string
  name?: string
  customDomain?: string
  status?: SiteStatus
}) {
  const timestamp = now()
  const [row] = await database
    .insert(sites)
    .values({
      id: uuid(),
      name: values.name ?? values.subdomain,
      description: "",
      subdomain: values.subdomain,
      customDomain: values.customDomain ?? "",
      status: values.status ?? "active",
      settings: emptySiteSettings(),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()

  return row
}

describe("reading a host", () => {
  it("drops the port, the trailing dot and www", () => {
    expect(normalizeHost("Alpha.localhost:3015")).toBe("alpha.localhost")
    expect(normalizeHost("www.joes-diner.com.")).toBe("joes-diner.com")
  })

  it("treats nothing at all as the deployment's own", () => {
    expect(isPlatformHost("")).toBe(true)
    expect(isPlatformHost(null)).toBe(true)
  })
})

describe("the addresses a site can never take", () => {
  it("keeps the base domain for the deployment", () => {
    expect(isPlatformHost("localhost")).toBe(true)
  })

  it("keeps the names the app needs for itself", () => {
    for (const reserved of ["www", "api", "admin", "app"]) {
      expect(isPlatformHost(`${reserved}.localhost`)).toBe(true)
    }
  })

  it("answers nothing on them even when a site somehow holds one", async () => {
    // The form refuses these, so this is the second line: a row that reached
    // the table another way still must not take the app's own address.
    await addSite({ subdomain: "api" })
    expect(await resolveSiteByHost("api.localhost", database)).toBeNull()
  })
})

describe("finding the site for a host", () => {
  it("matches a subdomain of the base domain", async () => {
    await addSite({ subdomain: "alpha", name: "Alpha" })
    const site = await resolveSiteByHost("alpha.localhost:3015", database)
    expect(site?.name).toBe("Alpha")
  })

  it("lets a custom domain win over a subdomain", async () => {
    await addSite({ subdomain: "shop", name: "By subdomain" })
    await addSite({
      subdomain: "other",
      name: "By custom domain",
      customDomain: "shop.localhost",
    })

    const site = await resolveSiteByHost("shop.localhost", database)
    expect(site?.name).toBe("By custom domain")
  })

  it("matches a custom domain whether or not www is typed", async () => {
    await addSite({ subdomain: "joes", customDomain: "joes-diner.com" })

    expect((await resolveSiteByHost("joes-diner.com", database))?.subdomain).toBe("joes")
    expect((await resolveSiteByHost("www.joes-diner.com", database))?.subdomain).toBe("joes")
  })

  it("answers a draft site, so it can be looked at before it is announced", async () => {
    await addSite({ subdomain: "alpha", status: "draft" })
    expect(await resolveSiteByHost("alpha.localhost", database)).not.toBeNull()
  })

  it("makes a switched-off site look like one that never existed", async () => {
    await addSite({ subdomain: "alpha", status: "inactive" })
    expect(await resolveSiteByHost("alpha.localhost", database)).toBeNull()
  })

  it("ignores a name buried deeper than one label", async () => {
    await addSite({ subdomain: "alpha" })
    expect(await resolveSiteByHost("alpha.extra.localhost", database)).toBeNull()
  })

  it("answers nothing for a name nobody has taken", async () => {
    expect(await resolveSiteByHost("nobody.localhost", database)).toBeNull()
  })
})

describe("remembering sites between requests", () => {
  it("stops answering the old way once a site changes", async () => {
    const site = await addSite({ subdomain: "alpha" })
    expect(await resolveSiteByHost("alpha.localhost", database)).not.toBeNull()

    await database
      .update(sites)
      .set({ status: "inactive" })
      .where(eq(sites.id, site.id))
    dropSiteCache()

    expect(await resolveSiteByHost("alpha.localhost", database)).toBeNull()
  })
})

describe("addresses this app will accept a form post from", () => {
  it("takes any subdomain of the base domain without a lookup", () => {
    expect(hostBelongsToThisApp("http://alpha.localhost:3015")).toBe(true)
  })

  it("refuses the names kept for the app itself", () => {
    expect(hostBelongsToThisApp("http://admin.localhost:3015")).toBe(false)
  })

  it("refuses somebody else's domain", () => {
    expect(hostBelongsToThisApp("https://somebody-elses-site.com")).toBe(false)
  })

  it("refuses something that is not an address at all", () => {
    expect(hostBelongsToThisApp("not an origin")).toBe(false)
  })

  it("takes a site's own domain once that site has been drawn", async () => {
    await addSite({ subdomain: "joes", customDomain: "joes-diner.com" })

    // Nothing has been looked up yet, so the safe answer is no.
    expect(hostBelongsToThisApp("https://joes-diner.com")).toBe(false)

    // Drawing the site's page is what fills the cache, and a form is always on
    // a page that was drawn first.
    await resolveSiteByHost("joes-diner.com", database)
    expect(hostBelongsToThisApp("https://joes-diner.com")).toBe(true)
  })

  it("still accepts a switched-off site's own domain", async () => {
    await addSite({
      subdomain: "closed",
      customDomain: "closed-shop.com",
      status: "inactive",
    })
    await resolveSiteByHost("closed-shop.com", database)

    // The site answers nothing, but the domain is still one this deployment
    // owns — refusing it would only make its own pages fail strangely.
    expect(hostBelongsToThisApp("https://closed-shop.com")).toBe(true)
  })
})
