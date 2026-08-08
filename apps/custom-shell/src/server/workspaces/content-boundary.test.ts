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
import { listOwnedMedia } from "@/server/media/library"
import { loadMemberHome } from "@/server/people/member-home"
import { now, uuid } from "@/server/auth/security"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import { customShellFeedback, customShellMedia } from "@/server/schema"

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
