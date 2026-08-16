import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { createTestDatabase, type TestDatabase } from "@/server/test-support"
import {
  dropWorkspaceCache,
  hostBelongsToThisApp,
  isPlatformHost,
  normalizeHost,
  resolveWorkspaceByHost,
} from "@/server/workspaces/host"
import type { WorkspaceStatus } from "@/lib/workspaces/status"
import { customShellWorkspaces } from "@/server/schema"

/**
 * Which site a visitor lands on is decided entirely by the domain they typed,
 * so these are the rules that decide who sees what. The two that matter most:
 * a switched-off site is indistinguishable from one that never existed, and the
 * deployment's own addresses can never be taken by a workspace.
 */

// Multisite is off until a base domain is configured, so these say what they
// are testing against rather than relying on a default.
process.env.CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN = "localhost"

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  // The cache lives in the module, so a previous test's rows would otherwise
  // still be answering in this one.
  dropWorkspaceCache()
})

afterEach(async () => {
  await client.close()
})

async function addWorkspace(values: {
  subdomain: string
  name?: string
  customDomain?: string
  status?: WorkspaceStatus
}) {
  const timestamp = now()
  const [row] = await database
    .insert(customShellWorkspaces)
    .values({
      id: uuid(),
      name: values.name ?? values.subdomain,
      subdomain: values.subdomain,
      customDomain: values.customDomain ?? "",
      status: values.status ?? "active",
      settings: {},
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

describe("the addresses a workspace can never take", () => {
  it("keeps the base domain for the deployment", () => {
    expect(isPlatformHost("localhost")).toBe(true)
  })

  it("keeps the names the app needs for itself", () => {
    for (const reserved of ["www", "api", "admin", "app"]) {
      expect(isPlatformHost(`${reserved}.localhost`)).toBe(true)
    }
  })

  it("answers nothing on them even when a workspace somehow holds one", async () => {
    // The form refuses these, so this is the second line: a row that reached
    // the table another way still must not take the app's own address.
    await addWorkspace({ subdomain: "api" })
    expect(await resolveWorkspaceByHost("api.localhost", database)).toBeNull()
  })
})

describe("finding the site for a host", () => {
  it("matches a subdomain of the base domain", async () => {
    await addWorkspace({ subdomain: "alpha", name: "Alpha" })
    const workspace = await resolveWorkspaceByHost("alpha.localhost:3015", database)
    expect(workspace?.name).toBe("Alpha")
  })

  it("lets a custom domain win over a subdomain", async () => {
    await addWorkspace({ subdomain: "shop", name: "By subdomain" })
    await addWorkspace({
      subdomain: "other",
      name: "By custom domain",
      customDomain: "shop.localhost",
    })

    const workspace = await resolveWorkspaceByHost("shop.localhost", database)
    expect(workspace?.name).toBe("By custom domain")
  })

  it("matches a custom domain whether or not www is typed", async () => {
    await addWorkspace({ subdomain: "joes", customDomain: "joes-diner.com" })

    expect((await resolveWorkspaceByHost("joes-diner.com", database))?.subdomain).toBe("joes")
    expect((await resolveWorkspaceByHost("www.joes-diner.com", database))?.subdomain).toBe("joes")
  })

  it("answers a draft site, so it can be looked at before it is announced", async () => {
    await addWorkspace({ subdomain: "alpha", status: "draft" })
    expect(await resolveWorkspaceByHost("alpha.localhost", database)).not.toBeNull()
  })

  it("makes a switched-off site look like one that never existed", async () => {
    await addWorkspace({ subdomain: "alpha", status: "inactive" })
    expect(await resolveWorkspaceByHost("alpha.localhost", database)).toBeNull()
  })

  it("ignores a name buried deeper than one label", async () => {
    await addWorkspace({ subdomain: "alpha" })
    expect(await resolveWorkspaceByHost("alpha.extra.localhost", database)).toBeNull()
  })

  it("answers nothing for a name nobody has taken", async () => {
    expect(await resolveWorkspaceByHost("nobody.localhost", database)).toBeNull()
  })
})

describe("remembering workspaces between requests", () => {
  it("stops answering the old way once a workspace changes", async () => {
    const made = await addWorkspace({ subdomain: "alpha" })
    expect(await resolveWorkspaceByHost("alpha.localhost", database)).not.toBeNull()

    await database
      .update(customShellWorkspaces)
      .set({ status: "inactive" })
      .where(eq(customShellWorkspaces.id, made.id))
    dropWorkspaceCache()

    expect(await resolveWorkspaceByHost("alpha.localhost", database)).toBeNull()
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

  it("takes a workspace's own domain once that site has been drawn", async () => {
    await addWorkspace({ subdomain: "joes", customDomain: "joes-diner.com" })

    // Nothing has been looked up yet, so the safe answer is no.
    expect(hostBelongsToThisApp("https://joes-diner.com")).toBe(false)

    // Drawing the workspace's page is what fills the cache, and a form is always on
    // a page that was drawn first.
    await resolveWorkspaceByHost("joes-diner.com", database)
    expect(hostBelongsToThisApp("https://joes-diner.com")).toBe(true)
  })

  it("still accepts a switched-off workspace's own domain", async () => {
    await addWorkspace({
      subdomain: "closed",
      customDomain: "closed-shop.com",
      status: "inactive",
    })
    await resolveWorkspaceByHost("closed-shop.com", database)

    // The site answers nothing, but the domain is still one this deployment
    // owns — refusing it would only make its own pages fail strangely.
    expect(hostBelongsToThisApp("https://closed-shop.com")).toBe(true)
  })
})

/**
 * Most apps built on this shell — Trade, Video — never give a workspace an
 * address at all. For them nothing here may change a thing, and the way that is
 * switched off is simply leaving the base domain unset.
 */
describe("an app that never asked for addresses", () => {
  beforeEach(() => {
    process.env.CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN = ""
  })

  afterEach(() => {
    process.env.CUSTOM_SHELL_WORKSPACE_BASE_DOMAIN = "localhost"
  })

  it("treats every address as the app itself", () => {
    // Otherwise the app would call its own staging alias, its LAN address, or
    // anything sat behind a proxy a dead end, and look broken for no reason.
    expect(isPlatformHost("anything.example.com")).toBe(true)
    expect(isPlatformHost("192.168.1.40")).toBe(true)
  })

  it("gives no workspace an address", async () => {
    await addWorkspace({ subdomain: "alpha" })
    expect(await resolveWorkspaceByHost("alpha.localhost", database)).toBeNull()
  })

  it("still refuses a form post from a domain that is not ours", () => {
    // The real point of the fix: without a base domain this used to trust
    // every *.localhost origin, in every app.
    expect(hostBelongsToThisApp("http://alpha.localhost:3015")).toBe(false)
    expect(hostBelongsToThisApp("https://somebody-elses-site.com")).toBe(false)
  })
})

/**
 * Renaming a site in Settings has to reach the site itself.
 *
 * The public pages, the feed and the sitemap all read a site's name and menu
 * out of this cache, which has no expiry. So any code that writes
 * `customShellWorkspaces.name` or `.settings` and does not clear it leaves the
 * public side showing the old values until the server restarts. That was a
 * real bug in the Settings save; these two are here so it cannot come back.
 *
 * Do not delete either as redundant. The first says what the cache does; the
 * second is the one that actually fails when a writer forgets.
 */
describe("a saved rename reaches the public side", () => {
  it("keeps answering with the old name until the cache is cleared", async () => {
    const workspace = await addWorkspace({ subdomain: "alpha", name: "Alpha" })

    expect((await resolveWorkspaceByHost("alpha.localhost", database))?.name).toBe(
      "Alpha"
    )

    await database
      .update(customShellWorkspaces)
      .set({ name: "Toronto Eats" })
      .where(eq(customShellWorkspaces.id, workspace.id))

    // Still the old one — this is exactly what a visitor saw after a rename.
    expect((await resolveWorkspaceByHost("alpha.localhost", database))?.name).toBe(
      "Alpha"
    )

    dropWorkspaceCache()

    expect((await resolveWorkspaceByHost("alpha.localhost", database))?.name).toBe(
      "Toronto Eats"
    )
  })

  it("has the Settings save clear it", () => {
    // The save is a server function reached through a request, so it cannot be
    // called from here. What can be checked is that the one writer outside
    // server/people/workspaces.ts still clears the cache — which is the line
    // that was missing.
    const source = readFileSync(
      join(process.cwd(), "src/lib/api/shell-settings.ts"),
      "utf8"
    )

    expect(source).toContain("dropWorkspaceCache()")
  })
})
