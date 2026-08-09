import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createAnnouncement,
  deleteAnnouncements,
  listAnnouncements,
  loadUserAnnouncements,
  retireAnnouncements,
  updateAnnouncement,
} from "@/server/content/announcements"
import {
  createChangelogEntry,
  deleteChangelogEntries,
  listChangelogEntries,
  listPublishedChangelogEntries,
  updateChangelogEntry,
} from "@/server/content/changelog"
import { loadFeedsSummary } from "@/server/content/feeds"
import {
  listWorkspaceContacts,
  syncContactsFromUsers,
} from "@/server/people/contacts"
import { loadTrafficSummary, recordVisit } from "@/server/traffic"
import {
  readPageVisibility,
  readWrittenPageForViewer,
  setPageVisibility,
} from "@/server/content/pages"
import {
  createWrittenPage,
  deleteWrittenPage,
  findWrittenPage,
  listWrittenPages,
  updateWrittenPage,
} from "@/server/content/written-pages"
import {
  createWorkspaceAutomation,
  deleteWorkspaceAutomations,
  getWorkspaceAutomation,
  listWorkspaceAutomations,
  saveWorkspaceAutomation,
} from "@/server/automations/flows"
import { listOwnedMedia } from "@/server/media/library"
import { loadMemberHome } from "@/server/people/member-home"
import { now, uuid } from "@/server/auth/security"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import {
  customShellFeedback,
  customShellMedia,
  customShellWorkspaces,
} from "@/server/schema"
import { ne } from "drizzle-orm"

/**
 * Two sites, content in both, and nothing on one reachable from the other.
 *
 * **Every test here uses two workspaces on purpose.** A test with one proves
 * nothing about tenancy: the filter could be missing entirely and it would
 * still pass. Each of these goes red the moment its table's workspace filter is
 * taken out, which is the only thing that makes them worth having.
 */

// Serializing a media row builds its public URL, which needs somewhere to
// build it from. Any address will do — nothing here fetches anything.
const hadPublicUrl = Object.prototype.hasOwnProperty.call(
  process.env,
  "CUSTOM_SHELL_R2_PUBLIC_URL"
)
const originalPublicUrl = process.env.CUSTOM_SHELL_R2_PUBLIC_URL

let client: PGlite
let database: TestDatabase

/** The two sites, and somebody working on each. */
let alpha: string
let beta: string
let alphaPerson: string
let betaPerson: string

beforeEach(async () => {
  process.env.CUSTOM_SHELL_R2_PUBLIC_URL = "https://media.example.test"
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db

  alpha = (await insertWorkspace(database, { name: "Alpha" })).id
  beta = (await insertWorkspace(database, { name: "Beta" })).id
  alphaPerson = (await insertUser(database, { currentWorkspaceId: alpha })).id
  betaPerson = (await insertUser(database, { currentWorkspaceId: beta })).id
})

afterEach(async () => {
  await client.close()
  if (hadPublicUrl) {
    process.env.CUSTOM_SHELL_R2_PUBLIC_URL = originalPublicUrl
  } else {
    delete process.env.CUSTOM_SHELL_R2_PUBLIC_URL
  }
})

function announcement(title: string) {
  return {
    title,
    body: "Something to say.",
    level: "info" as const,
    showBanner: true,
    notify: false,
    startsOn: "",
    endsOn: "",
  }
}

describe("announcements stay on their own site", () => {
  it("lists only its own, and shows a banner only to its own visitors", async () => {
    await createAnnouncement(alpha, announcement("Alpha is down"), database)
    await createAnnouncement(beta, announcement("Beta has news"), database)

    expect((await listAnnouncements(alpha, database)).map((row) => row.title)).toEqual([
      "Alpha is down",
    ])

    const seenOnBeta = await loadUserAnnouncements(beta, betaPerson, database)
    expect(seenOnBeta.banners.map((banner) => banner.title)).toEqual([
      "Beta has news",
    ])
  })

  it("refuses to edit, retire or delete the other site's", async () => {
    const theirs = await createAnnouncement(beta, announcement("Theirs"), database)

    await expect(
      updateAnnouncement(alpha, theirs.id, announcement("Mine now"), database)
    ).rejects.toThrow("ANNOUNCEMENT_NOT_FOUND")

    await expect(
      deleteAnnouncements(alpha, [theirs.id], database)
    ).rejects.toThrow("ANNOUNCEMENT_NOT_FOUND")

    // Retiring matches nothing rather than throwing — it is a bulk action, and
    // "none of those were yours" is a count of zero.
    expect(await retireAnnouncements(alpha, [theirs.id], database)).toEqual({
      count: 0,
    })

    const [stillThere] = await listAnnouncements(beta, database)
    expect(stillThere.title).toBe("Theirs")
    expect(stillThere.endsAt).toBeNull()
  })
})

describe("the changelog stays on its own site", () => {
  it("lists only its own updates, drafts and published alike", async () => {
    await createChangelogEntry(
      alpha, { title: "Alpha shipped", body: "It is out.", published: true },
      database
    )
    await createChangelogEntry(
      beta, { title: "Beta shipped", body: "Also out.", published: true },
      database
    )

    expect(
      (await listChangelogEntries(alpha, database)).map((row) => row.title)
    ).toEqual(["Alpha shipped"])
    expect(
      (await listPublishedChangelogEntries(beta, 20, database)).map(
        (row) => row.title
      )
    ).toEqual(["Beta shipped"])
  })

  it("refuses to edit or delete the other site's", async () => {
    const theirs = await createChangelogEntry(
      beta, { title: "Theirs", body: "Their news.", published: true },
      database
    )

    await expect(
      updateChangelogEntry(
        alpha, theirs.id, { title: "Mine now", body: "Taken.", published: true },
        database
      )
    ).rejects.toThrow("CHANGELOG_ENTRY_NOT_FOUND")

    await expect(
      deleteChangelogEntries(alpha, [theirs.id], database)
    ).rejects.toThrow("CHANGELOG_ENTRY_NOT_FOUND")

    expect(
      (await listChangelogEntries(beta, database)).map((row) => row.title)
    ).toEqual(["Theirs"])
  })
})

describe("feedback stays on its own site", () => {
  async function leaveFeedback(workspaceId: string, userId: string, message: string) {
    const timestamp = now()
    await database.insert(customShellFeedback).values({
      id: uuid(),
      workspaceId,
      userId,
      type: "suggestion",
      message,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  it("counts only its own on the admin Overview", async () => {
    await leaveFeedback(alpha, alphaPerson, "Alpha idea")
    await leaveFeedback(beta, betaPerson, "Beta idea one")
    await leaveFeedback(beta, betaPerson, "Beta idea two")

    expect((await loadFeedsSummary(alpha, database)).feedback.last7Days).toBe(1)
    expect((await loadFeedsSummary(beta, database)).feedback.last7Days).toBe(2)
  })

  it("shows somebody only what they filed on the site they are on", async () => {
    // The same person, using both sites — which is exactly the case a
    // person-only filter gets wrong.
    await leaveFeedback(alpha, alphaPerson, "Filed on Alpha")
    await leaveFeedback(beta, alphaPerson, "Filed on Beta")

    const onAlpha = await loadMemberHome({ id: alphaPerson }, database)
    expect(onAlpha.feedback.map((item) => item.message)).toEqual([
      "Filed on Alpha",
    ])
    expect(onAlpha.feedbackTotal).toBe(1)
  })
})

describe("media stays on its own site", () => {
  async function upload(workspaceId: string, userId: string, filename: string) {
    const timestamp = now()
    await database.insert(customShellMedia).values({
      id: uuid(),
      workspaceId,
      userId,
      filename,
      originalName: filename,
      fileSize: 100,
      mimeType: "image/png",
      fileType: "image",
      storagePath: `${userId}/${filename}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  it("does not offer a picture uploaded on the other site", async () => {
    // One person, two sites: the picker must split their own files by site, not
    // just keep other people's out.
    await upload(alpha, alphaPerson, "alpha-logo.png")
    await upload(beta, alphaPerson, "beta-logo.png")

    const onAlpha = await listOwnedMedia({
      workspaceId: alpha,
      userId: alphaPerson,
      page: 1,
      pageSize: 20,
    })
    expect(onAlpha.media.map((item) => item.filename)).toEqual([
      "alpha-logo.png",
    ])
    expect(onAlpha.total).toBe(1)
  })

  it("still keeps somebody else's files out of the same site", async () => {
    await upload(alpha, alphaPerson, "mine.png")
    await upload(alpha, betaPerson, "theirs.png")

    const mine = await listOwnedMedia({
      workspaceId: alpha,
      userId: alphaPerson,
      page: 1,
      pageSize: 20,
    })
    expect(mine.media.map((item) => item.filename)).toEqual(["mine.png"])
  })
})

describe("written pages stay on their own site", () => {
  const words = (text: string) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  })

  it("lets both sites have an /about, each with its own words", async () => {
    // The whole reason the unique index had to change. Before this, the second
    // of these threw and a deployment could serve exactly one site.
    await createWrittenPage(
      alpha,
      { path: "/about", title: "About Alpha", body: words("We are Alpha.") },
      database
    )
    await createWrittenPage(
      beta,
      { path: "/about", title: "About Beta", body: words("We are Beta.") },
      database
    )

    const onAlpha = await findWrittenPage(alpha, "/about", database)
    const onBeta = await findWrittenPage(beta, "/about", database)
    expect(onAlpha?.title).toBe("About Alpha")
    expect(onBeta?.title).toBe("About Beta")
  })

  it("makes one site's page a dead end on the other's domain", async () => {
    await createWrittenPage(
      beta,
      { path: "/terms", title: "Beta terms", body: words("Beta's rules.") },
      database
    )

    expect(await findWrittenPage(alpha, "/terms", database)).toBeNull()
    expect(
      await readWrittenPageForViewer(alpha, "/terms", false, database)
    ).toEqual({ status: "missing" })
    expect((await listWrittenPages(alpha, database)).length).toBe(0)
  })

  it("refuses to edit or delete the other site's page", async () => {
    const theirs = await createWrittenPage(
      beta,
      { path: "/terms", title: "Beta terms", body: words("Beta's rules.") },
      database
    )

    await expect(
      updateWrittenPage(alpha, theirs.id, { title: "Mine now" }, database)
    ).rejects.toThrow("no longer exists")
    await expect(
      deleteWrittenPage(alpha, theirs.id, database)
    ).rejects.toThrow("no longer exists")

    expect((await findWrittenPage(beta, "/terms", database))?.title).toBe(
      "Beta terms"
    )
  })

  it("hides a page on one site without hiding the other's", async () => {
    await setPageVisibility(alpha, { path: "/pricing", visibility: "off" }, database)

    expect(await readPageVisibility(alpha, "/pricing", database)).toBe("off")
    expect(await readPageVisibility(beta, "/pricing", database)).toBe("everyone")
  })
})

describe("automations stay on their own site", () => {
  it("lets both sites name a flow the same thing", async () => {
    // The old rule was one name per person, so one admin could not run the
    // same welcome flow on two of their sites.
    await createWorkspaceAutomation(alpha, alphaPerson, "Welcome", database)
    await createWorkspaceAutomation(beta, alphaPerson, "Welcome", database)

    expect(
      (await listWorkspaceAutomations(alpha, database)).map((row) => row.name)
    ).toEqual(["Welcome"])
    expect(
      (await listWorkspaceAutomations(beta, database)).map((row) => row.name)
    ).toEqual(["Welcome"])
  })

  it("does not list, open, save or delete the other site's flow", async () => {
    const theirs = await createWorkspaceAutomation(
      beta,
      betaPerson,
      "Beta welcome",
      database
    )

    expect(await listWorkspaceAutomations(alpha, database)).toEqual([])
    expect(
      await getWorkspaceAutomation(alpha, theirs.id, database)
    ).toBeNull()
    expect(
      await saveWorkspaceAutomation(
        alpha,
        { id: theirs.id, name: "Taken", graph: theirs.graph },
        database
      )
    ).toBeNull()
    expect(
      await deleteWorkspaceAutomations(alpha, [theirs.id], database)
    ).toBe(0)

    expect(
      (await getWorkspaceAutomation(beta, theirs.id, database))?.name
    ).toBe("Beta welcome")
  })
})

describe("traffic is counted per site", () => {
  const visit = (workspaceId: string, visitorHash: string, path = "/about") => ({
    workspaceId,
    path,
    referrerDomain: "direct",
    device: "computer" as const,
    audience: "visitor" as const,
    visitorHash,
  })

  const at = new Date("2026-08-08T12:00:00Z")

  it("moves only the site that was visited", async () => {
    await recordVisit(visit(alpha, "one"), database, at)
    await recordVisit(visit(alpha, "two"), database, at)
    await recordVisit(visit(beta, "three"), database, at)

    // Analytics that quietly adds two sites together is the whole failure this
    // is here to prevent, so both are checked rather than just one.
    expect((await loadTrafficSummary(alpha, 7, database, at)).totals.views).toBe(2)
    expect((await loadTrafficSummary(beta, 7, database, at)).totals.views).toBe(1)
  })

  it("counts the same person as one visitor on each site they read", async () => {
    // One browser, both sites. Each site's own figure should say one visitor —
    // it is one person as far as that site is concerned.
    await recordVisit(visit(alpha, "same-person"), database, at)
    await recordVisit(visit(beta, "same-person"), database, at)

    expect(
      (await loadTrafficSummary(alpha, 7, database, at)).totals.uniqueVisitors
    ).toBe(1)
    expect(
      (await loadTrafficSummary(beta, 7, database, at)).totals.uniqueVisitors
    ).toBe(1)
  })

  it("keeps one site's top pages out of the other's", async () => {
    await recordVisit(visit(alpha, "one", "/alpha-only"), database, at)
    await recordVisit(visit(beta, "two", "/beta-only"), database, at)

    const onAlpha = await loadTrafficSummary(alpha, 7, database, at)
    expect(onAlpha.topPages.map((row) => row.key)).toEqual(["/alpha-only"])
    expect(onAlpha.siteName).toBe("Alpha")
  })
})

describe("a site's contacts are that site's people", () => {
  it("leaves out an account that has never touched this site", async () => {
    // `syncContactsFromUsers` used to take **every** account on the
    // deployment, so Alpha's newsletter list filled up with Beta's customers.
    await syncContactsFromUsers(alpha, database)
    await syncContactsFromUsers(beta, database)

    const onAlpha = await listWorkspaceContacts(alpha, {}, database)
    const onBeta = await listWorkspaceContacts(beta, {}, database)

    expect(onAlpha.contacts.map((row) => row.userId)).toEqual([alphaPerson])
    expect(onBeta.contacts.map((row) => row.userId)).toEqual([betaPerson])
  })

  it("still takes everybody on an app that has only one site", async () => {
    // The old behaviour, which has to survive: on one site, somebody pointed
    // nowhere belongs to it, so the list is every account exactly as before.
    const only = (await insertWorkspace(database)).id
    await database.delete(customShellWorkspaces).where(
      ne(customShellWorkspaces.id, only)
    )
    const nobody = (await insertUser(database)).id

    await syncContactsFromUsers(only, database)

    const list = await listWorkspaceContacts(only, {}, database)
    expect(list.contacts.map((row) => row.userId)).toContain(nobody)
  })
})
