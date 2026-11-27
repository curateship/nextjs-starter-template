import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { callVideo as promoCallsVideo } from "@/server/archive/video-link"
import { ensureContentLinks, isLinkAddress, linkAddress, linkFetch, linkTarget } from "@/server/content-app/links"
import { createProject } from "@/server/social/projects"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import { callPromo as videoCallsPromo, readPromoConnection as videoReadsPromo } from "@/server/video/promo-link"
import { getPromoUrl as videoPromoUrl } from "@/server/video/settings"
import { callViral as promoCallsViral } from "@/server/viral-link/link"
import { listPromoProjects as viralListsPromo } from "@/server/viral/promo-link"
import { getPromoUrl as viralPromoUrl, getVideoUrl as viralVideoUrl } from "@/server/viral/settings"
import { listVideoProjects as viralListsVideo } from "@/server/viral/video-link"
import { readViralSecret } from "@/server/video/viral-link/link"

/**
 * The three links inside Content (`workspace/docs/content-app.md`, "The links
 * between Video, Promo and Viral"): set up by Content for the first admin, and
 * answered in this process with every key check the three apps made.
 */
describe("the links between Video, Promo and Viral", () => {
  let client: PGlite
  let db: TestDatabase

  beforeEach(async () => {
    process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-key-for-the-content-links"
    ;({ client, db } = await createTestDatabase())
  })

  afterEach(async () => {
    await client.close()
  })

  it("sets each link up for the first admin, once", async () => {
    await insertUser(db, { role: "admin" })
    await ensureContentLinks(db)
    const promo = await videoPromoUrl(db)
    expect(promo).toBe(linkAddress("promo"))
    expect(await viralPromoUrl(db)).toBe(linkAddress("promo"))
    expect(await viralVideoUrl(db)).toBe(linkAddress("video"))
    const first = await videoReadsPromo(db)
    await ensureContentLinks(db)
    // Set up already, so the key stays the one it was.
    expect((await videoReadsPromo(db)).key).toBe(first.key)
  })

  it("does nothing with no admin to set it up for", async () => {
    await ensureContentLinks(db)
    expect(await videoPromoUrl(db)).toBe("")
  })

  it("answers Video asking Promo for the owner's projects, with Promo's key check", async () => {
    const admin = await insertUser(db, { role: "admin" })
    await createProject(admin.id, "Meal prep", db)
    const answer = await videoCallsPromo<{ projects: Array<{ name: string }> }>(await videoReadsPromo(db), "/api/connect/video/projects")
    expect(answer.projects.map((project) => project.name)).toEqual(["Meal prep"])
  })

  it("refuses a call to Promo with a wrong key", async () => {
    await insertUser(db, { role: "admin" })
    const connection = await videoReadsPromo(db)
    await expect(videoCallsPromo({ ...connection, key: "pv_wrong" }, "/api/connect/video/projects")).rejects.toThrow(/turned down the key Content made/)
  })

  it("answers Research asking Promo and Video for the owner's projects", async () => {
    const admin = await insertUser(db, { role: "admin" })
    await createProject(admin.id, "Home gym", db)
    expect((await viralListsPromo()).map((project) => project.name)).toEqual(["Home gym"])
    expect((await viralListsVideo()).map((project) => project.name)).toEqual(["Home gym"])
  })

  it("answers Promo asking Video which projects it can make a video in", async () => {
    const admin = await insertUser(db, { role: "admin" })
    await createProject(admin.id, "Guitar", db)
    // Promo asking for a video sets the link up first, as the screen does.
    await ensureContentLinks(db)
    const answer = (await promoCallsVideo(admin.id, "/api/connect/promo/projects", undefined, { db })) as { projects: Array<{ name: string }> }
    expect(answer.projects.map((project) => project.name)).toEqual(["Guitar"])
  })

  it("answers Video and Promo telling Research what happened, with Research's key checks", async () => {
    const admin = await insertUser(db, { role: "admin" })
    // A send to the editor sets the links up before any news comes back.
    await ensureContentLinks(db)
    const { viralUrl, key } = await readViralSecret(admin.id, db)
    expect(viralUrl).toBe(linkAddress("viral"))
    // A send Research doesn't know changes nothing, and is still answered.
    const news = await linkFetch(`${viralUrl}/api/connect/video/events`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ type: "failed", sendId: "nobody", error: "" }),
    })
    expect(news.status).toBe(200)
    expect(await promoCallsViral(admin.id, "/api/connect/promo/events", { type: "posted", ideaId: "nobody", postKey: "x:1", network: "x", url: "https://x.com/a/status/1" }, { db })).toMatchObject({ ok: true, status: "gone" })
  })

  it("sends a call to one of Content's parts to that part, and anything else out", () => {
    expect(linkTarget(new URL(`${linkAddress("video")}/api/connect/promo/events`))).toEqual({ side: "video", path: "/api/connect/promo/events" })
    expect(linkTarget(new URL(`${linkAddress("viral")}/api/connect/promo/events`))).toEqual({ side: "viral", path: "/api/connect/promo/events" })
    // A file one part hands another, at Content's own address.
    const own = new URL(linkAddress("video")).origin
    expect(linkTarget(new URL(`${own}/api/connect/promo/file/abc?part=main`))).toEqual({ side: "video", path: "/api/connect/promo/file/abc" })
    expect(linkTarget(new URL(`${own}/api/connect/video/file/abc`))).toEqual({ side: "viral", path: "/api/connect/video/file/abc" })
    expect(linkTarget(new URL("https://example.com/api/connect/promo/file/abc"))).toBeNull()
    // Another site's address is never one of Content's parts, whatever its path.
    expect(linkTarget(new URL("https://example.com/content-link/promo/api/connect/video/projects"))).toBeNull()
    expect(isLinkAddress("https://example.com/content-link/promo")).toBe(false)
    expect(linkTarget(new URL(`${own}/admin/projects`))).toBeNull()
    expect(isLinkAddress(linkAddress("promo"))).toBe(true)
    expect(isLinkAddress("https://example.com/content")).toBe(false)
  })

  it("answers a path a part doesn't have with a refusal, not the network", async () => {
    const answer = await linkFetch(`${linkAddress("promo")}/api/connect/nothing`)
    expect(answer.status).toBe(404)
    // A broken piece of an address names no file, rather than throwing.
    expect((await linkFetch(`${linkAddress("video")}/api/connect/promo/file/%E0%A4%A`)).status).toBe(404)
  })
})
