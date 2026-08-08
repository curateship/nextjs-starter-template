import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { emptySiteSettings, DEFAULT_THEME_COLOR } from "@/lib/sites/site-settings"
import { createTestDatabase, type TestDatabase } from "@/server/test-support"
import {
  createSite,
  describeAddressClash,
  deleteSite,
  getSite,
  listSites,
  siteDeleteImpact,
  updateSite,
  type SiteInput,
} from "@/server/sites/sites"

/**
 * Making and changing sites. Two things carry the weight here: no two sites can
 * answer on the same address, and everything an admin types about how a site
 * looks is cleaned before it is stored — those settings are drawn straight into
 * a public page.
 */

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
})

function input(overrides: Partial<SiteInput> = {}): SiteInput {
  return {
    name: "Alpha",
    description: "",
    subdomain: "alpha",
    customDomain: "",
    status: "active",
    settings: emptySiteSettings(),
    ...overrides,
  }
}

describe("making a site", () => {
  it("keeps what was typed and works out the address", async () => {
    const site = await createSite(input({ name: "  Alpha  " }), database)

    expect(site.name).toBe("Alpha")
    expect(site.subdomain).toBe("alpha")
    expect(site.address).toBe("alpha.localhost")
  })

  it("starts as a draft when that is what was asked for", async () => {
    const site = await createSite(input({ status: "draft" }), database)
    expect(site.status).toBe("draft")
  })

  it("prefers a custom domain as the site's address", async () => {
    const site = await createSite(
      input({ customDomain: "https://www.Joes-Diner.com/menu" }),
      database
    )

    // Stored bare, because that is the shape an incoming host is reduced to.
    expect(site.customDomain).toBe("joes-diner.com")
    expect(site.address).toBe("joes-diner.com")
  })

  it("refuses a site with no name", async () => {
    await expect(createSite(input({ name: "   " }), database)).rejects.toThrow(
      "A site needs a name."
    )
  })

  it("refuses an address that is too short", async () => {
    await expect(createSite(input({ subdomain: "ab" }), database)).rejects.toThrow(
      "at least 3 characters"
    )
  })

  it("refuses an address with characters DNS will not carry", async () => {
    await expect(
      createSite(input({ subdomain: "my site!" }), database)
    ).rejects.toThrow("lowercase letters, numbers and hyphens")
  })

  it("refuses an address the app keeps for itself", async () => {
    await expect(createSite(input({ subdomain: "admin" }), database)).rejects.toThrow(
      "kept for the app itself"
    )
  })

  it("refuses something that is not a domain", async () => {
    await expect(
      createSite(input({ customDomain: "not a domain" }), database)
    ).rejects.toThrow("does not look like a domain")
  })
})

describe("two sites cannot share an address", () => {
  it("refuses a subdomain another site answers on", async () => {
    await createSite(input(), database)

    await expect(
      createSite(input({ name: "Second", subdomain: "alpha" }), database)
    ).rejects.toThrow("Another site already answers on alpha.")
  })

  it("refuses a custom domain another site uses", async () => {
    await createSite(input({ customDomain: "joes-diner.com" }), database)

    await expect(
      createSite(
        input({
          name: "Second",
          subdomain: "beta",
          customDomain: "www.joes-diner.com",
        }),
        database
      )
    ).rejects.toThrow("Another site already uses joes-diner.com.")
  })

  it("still says it in words when the database is the one that caught it", () => {
    // The check before the write is what makes the message readable; the unique
    // index is what makes it *true* when two admins save the same address in
    // the same instant. The loser of that race gets the index's complaint, and
    // this is what turns it back into the same sentence.
    const values = { subdomain: "alpha", customDomain: "joes-diner.com" }

    expect(
      describeAddressClash({ constraint: "sites_subdomain_key" }, values)
    ).toEqual(new Error("Another site already answers on alpha."))

    expect(
      describeAddressClash({ constraint: "sites_custom_domain_key" }, values)
    ).toEqual(new Error("Another site already uses joes-diner.com."))
  })

  it("leaves an error it does not recognise alone", () => {
    // Rewriting an unknown failure as an address clash would send whoever is
    // debugging it in exactly the wrong direction.
    const other = new Error("connection terminated")
    expect(
      describeAddressClash(other, { subdomain: "alpha", customDomain: "" })
    ).toBe(other)
  })

  it("lets several sites have no custom domain at all", async () => {
    await createSite(input(), database)
    await createSite(input({ name: "Beta", subdomain: "beta" }), database)

    expect(await listSites(database)).toHaveLength(2)
  })
})

describe("changing a site", () => {
  it("does not accuse a site of taking its own address", async () => {
    const site = await createSite(input({ customDomain: "joes-diner.com" }), database)

    const saved = await updateSite(
      { ...input({ customDomain: "joes-diner.com" }), id: site.id, name: "Renamed" },
      database
    )

    expect(saved.name).toBe("Renamed")
  })

  it("still refuses an address another site holds", async () => {
    await createSite(input(), database)
    const beta = await createSite(input({ name: "Beta", subdomain: "beta" }), database)

    await expect(
      updateSite({ ...input({ subdomain: "alpha" }), id: beta.id }, database)
    ).rejects.toThrow("Another site already answers on alpha.")
  })

  it("says so when the site is gone", async () => {
    await expect(
      updateSite({ ...input(), id: "missing-id" }, database)
    ).rejects.toThrow("That site no longer exists.")
  })
})

describe("what a site looks like is cleaned before it is stored", () => {
  it("drops a menu link that would run a script", async () => {
    const site = await createSite(
      input({
        settings: {
          ...emptySiteSettings(),
          navigation: [
            { label: "Safe", href: "/about" },
            { label: "Nasty", href: "javascript:alert(1)" },
          ],
        },
      }),
      database
    )

    expect(site.settings.navigation).toEqual([{ label: "Safe", href: "/about" }])
  })

  it("falls back rather than putting a made-up colour into a page", async () => {
    const site = await createSite(
      input({
        settings: { ...emptySiteSettings(), themeColor: "red; background: url(x)" },
      }),
      database
    )

    expect(site.settings.themeColor).toBe(DEFAULT_THEME_COLOR)
  })
})

describe("deleting a site", () => {
  it("says what is about to go", async () => {
    const site = await createSite(input(), database)
    const impact = await siteDeleteImpact(site.id, database)

    expect(impact).toEqual({ name: "Alpha", address: "alpha.localhost" })
  })

  it("takes the site away", async () => {
    const site = await createSite(input(), database)
    await deleteSite(site.id, database)

    expect(await listSites(database)).toHaveLength(0)
    await expect(getSite(site.id, database)).rejects.toThrow(
      "That site no longer exists."
    )
  })

  it("says so when it was already gone", async () => {
    await expect(deleteSite("missing-id", database)).rejects.toThrow(
      "That site no longer exists."
    )
  })
})
