import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { fetchMetaAds, loadProjectAds, searchProjectAds } from "@/server/viral/meta-ads"
import { createViralProject, ensureSampleViralProject, listViralProjects } from "@/server/viral/projects"
import { saveMetaToken } from "@/server/viral/settings"

/**
 * Winning ads (task part 23, Tyler: "Meta's ad library"): a search keeps the
 * ads that have run 30 days or more, replaces the project's last list, and
 * never hands the token to the browser. Meta itself is stubbed.
 */

const DAY = 24 * 60 * 60 * 1000

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
const previousKey = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY

beforeEach(async () => {
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "a".repeat(64)
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
})

afterEach(async () => {
  if (previousKey === undefined) delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
  else process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = previousKey
  await client.close()
})

function daysAgo(days: number) {
  return new Date(Date.now() - days * DAY).toISOString()
}

/** A stand-in for Meta that answers every keyword with these ads, and records what it was asked. */
function stubMeta(data: unknown[], status = 200) {
  const asked: string[] = []
  const fetcher = (async (input: string | URL | Request) => {
    asked.push(String(input))
    return new Response(JSON.stringify(status === 200 ? { data } : { error: { message: "Invalid OAuth access token.", code: 190 } }), {
      status,
    })
  }) as typeof fetch
  return { fetcher, asked }
}

describe("Winning ads", () => {
  it("keeps the ads running 30 days or more, and the browser never sees the token", async () => {
    await saveMetaToken("meta-secret-token")
    const project = await createViralProject(user.id, {
      name: "Desk fitness",
      description: "",
      topic: "office workers",
      socials: ["youtube"],
      keywords: ["desk stretches", "posture"],
      folderId: null,
    })
    const meta = stubMeta([
      { id: "111", page_name: "Desk Fit", ad_creative_bodies: ["Undo sitting in 5 minutes."], ad_delivery_start_time: daysAgo(94), publisher_platforms: ["facebook", "instagram"] },
      { id: "222", page_name: "New Brand", ad_creative_bodies: ["Brand new."], ad_delivery_start_time: daysAgo(3) },
    ])

    const found = await searchProjectAds(user.id, project.id, meta.fetcher)
    expect(meta.asked).toHaveLength(2)
    expect(meta.asked[0]).toContain("search_terms=desk+stretches")
    expect(found.ads.map((ad) => ad.adArchiveId)).toEqual(["111"])
    expect(found.ads[0]).toMatchObject({ pageName: "Desk Fit", daysRunning: 94, keyword: "desk stretches", libraryUrl: "https://www.facebook.com/ads/library/?id=111" })
    expect(JSON.stringify(found)).not.toContain("meta-secret-token")

    const other = await insertUser(database)
    await expect(loadProjectAds(other.id, project.id)).rejects.toThrow(/That project is gone/)
  })

  it("says Meta refused the token, and keeps the reason with the project", async () => {
    await saveMetaToken("expired")
    const project = await createViralProject(user.id, {
      name: "Desk fitness",
      description: "",
      topic: "office workers",
      socials: ["youtube"],
      keywords: ["posture"],
      folderId: null,
    })
    await expect(searchProjectAds(user.id, project.id, stubMeta([], 400).fetcher)).rejects.toThrow(/Meta refused the token/)
    expect((await loadProjectAds(user.id, project.id)).error).toMatch(/Meta refused the token/)
  })

  it("asks for a token, then a keyword, before calling Meta", async () => {
    const project = await createViralProject(user.id, {
      name: "No keywords",
      description: "",
      topic: "x",
      socials: ["youtube"],
      keywords: [],
      folderId: null,
    })
    const meta = stubMeta([])
    await expect(searchProjectAds(user.id, project.id, meta.fetcher)).rejects.toThrow(/needs a Meta token/)
    await saveMetaToken("token")
    await expect(searchProjectAds(user.id, project.id, meta.fetcher)).rejects.toThrow(/Add a keyword/)
    expect(meta.asked).toEqual([])
  })

  it("gives the sample made-up ads and never searches it", async () => {
    await ensureSampleViralProject(user.id)
    const [sample] = await listViralProjects(user.id, { archived: false })
    expect((await loadProjectAds(user.id, sample.id)).ads).toHaveLength(2)
    await expect(searchProjectAds(user.id, sample.id, stubMeta([]).fetcher)).rejects.toThrow(/sample project/)
  })

  it("skips an ad whose start date can't be read", async () => {
    const ads = await fetchMetaAds("t", "x", stubMeta([{ id: "1", ad_delivery_start_time: "not a date" }]).fetcher)
    expect(ads).toEqual([])
  })
})
