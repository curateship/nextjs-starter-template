import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { adoptLooseParts, readProjectParts, researchTopic } from "@/server/content-app/projects"
import { ensureSampleContentProject } from "@/server/content-app/sample"
import { readDraftVideos } from "@/server/content-app/widgets"
import { promoFinds, promoKeywords, promoProjects } from "@/server/social/schema"
import { createProject, deleteProject, duplicateProject, updateProject } from "@/server/social/projects"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import { videoProjects, videoProjectVideos } from "@/server/video/schema"
import { viralProjects } from "@/server/viral/schema"

/** A description page as the project's editor sends it. */
function page(text: string) {
  return JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })
}

describe("one project across Promo's, Viral's and Video's tables", () => {
  let client: PGlite
  let db: TestDatabase

  beforeEach(async () => {
    ;({ client, db } = await createTestDatabase())
  })

  afterEach(async () => {
    await client.close()
  })

  it("makes the research and video rows under the project's id", async () => {
    const user = await insertUser(db, { role: "admin" })
    const id = await createProject(user.id, "Meal prep for busy dads", db)
    const [research] = await db.select().from(viralProjects).where(eq(viralProjects.id, id))
    const [video] = await db.select().from(videoProjects).where(eq(videoProjects.id, id))
    expect(research).toMatchObject({ ownerId: user.id, name: "Meal prep for busy dads" })
    expect(video).toMatchObject({ userId: user.id, name: "Meal prep for busy dads" })
  })

  it("gives a duplicate research and video rows of its own", async () => {
    const user = await insertUser(db, { role: "admin" })
    const id = await createProject(user.id, "Home gym", db)
    const copy = await duplicateProject(user.id, id, db)
    expect(copy).not.toBe(id)
    expect(await db.select().from(viralProjects).where(eq(viralProjects.id, copy))).toHaveLength(1)
    expect(await db.select().from(videoProjects).where(eq(videoProjects.id, copy))).toHaveLength(1)
  })

  it("keeps the names and Research's topic on the project's", async () => {
    const user = await insertUser(db, { role: "admin" })
    const id = await createProject(user.id, "Guitar", db)
    await updateProject(user.id, id, { name: "Learn guitar at 40", page: page("First songs for adults who never played.") }, db)
    const [research] = await db.select().from(viralProjects).where(eq(viralProjects.id, id))
    const [video] = await db.select().from(videoProjects).where(eq(videoProjects.id, id))
    expect(research).toMatchObject({ name: "Learn guitar at 40", topic: "First songs for adults who never played." })
    expect(video.name).toBe("Learn guitar at 40")
  })

  it("deletes the research and video rows with the project", async () => {
    const user = await insertUser(db, { role: "admin" })
    const id = await createProject(user.id, "Gone soon", db)
    await deleteProject(user.id, id, db)
    expect(await db.select().from(promoProjects).where(eq(promoProjects.id, id))).toHaveLength(0)
    expect(await db.select().from(viralProjects).where(eq(viralProjects.id, id))).toHaveLength(0)
    expect(await db.select().from(videoProjects).where(eq(videoProjects.id, id))).toHaveLength(0)
  })

  it("makes a project of a research or video row made on its own", async () => {
    const user = await insertUser(db, { role: "admin" })
    const at = now()
    const research = uuid()
    const video = uuid()
    await db.insert(viralProjects).values({ id: research, ownerId: user.id, name: "From Viral", createdAt: at, updatedAt: at })
    await db.insert(videoProjects).values({ id: video, userId: user.id, name: "From Video", createdAt: at, updatedAt: at })
    expect((await adoptLooseParts(user.id, db)).sort()).toEqual([research, video].sort())
    const projects = await db.select({ id: promoProjects.id, name: promoProjects.name }).from(promoProjects)
    expect(projects.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { id: video, name: "From Video" },
      { id: research, name: "From Viral" },
    ])
    // Each also gets the part it was missing.
    expect(await db.select().from(videoProjects).where(eq(videoProjects.id, research))).toHaveLength(1)
    expect(await db.select().from(viralProjects).where(eq(viralProjects.id, video))).toHaveLength(1)
    expect(await adoptLooseParts(user.id, db)).toEqual([])
  })

  it("leaves another person's rows alone", async () => {
    const user = await insertUser(db, { role: "admin" })
    const other = await insertUser(db, { role: "admin" })
    const at = now()
    await db.insert(videoProjects).values({ id: uuid(), userId: other.id, name: "Theirs", createdAt: at, updatedAt: at })
    expect(await adoptLooseParts(user.id, db)).toEqual([])
  })

  it("reads the project's research and videos for its left panel", async () => {
    const user = await insertUser(db, { role: "admin" })
    const id = await createProject(user.id, "Empty", db)
    const parts = await readProjectParts(user.id, id, db)
    expect(parts.research).toMatchObject({ socials: ["youtube", "tiktok"], vaultCount: 0, found: {}, sample: false })
    expect(parts.videos).toEqual([])
  })

  it("cuts Research's topic to plain words", () => {
    expect(researchTopic("")).toBe("")
    expect(researchTopic(page("  Two   spaces  "))).toBe("Two spaces")
  })
})

describe("the sample project", () => {
  let client: PGlite
  let db: TestDatabase

  beforeEach(async () => {
    ;({ client, db } = await createTestDatabase())
  })

  afterEach(async () => {
    await client.close()
  })

  it("is made once, with research, videos and posts to comment on that nothing can send", async () => {
    const user = await insertUser(db, { role: "admin" })
    expect(await ensureSampleContentProject(user.id, db)).toBe(true)
    expect(await ensureSampleContentProject(user.id, db)).toBe(false)

    const [project] = await db.select().from(promoProjects).where(eq(promoProjects.userId, user.id))
    expect(project.name.startsWith("Sample:")).toBe(true)
    expect(project.networks).toEqual(["youtube", "reddit", "x"])

    const [research] = await db.select().from(viralProjects).where(eq(viralProjects.id, project.id))
    expect(research.isSample).toBe(true)
    expect(research.topic).toBe("Desk stretches and short office workouts for people who sit all day.")

    const videos = await db.select().from(videoProjectVideos).where(eq(videoProjectVideos.projectId, project.id))
    expect(videos.map((video) => video.status).sort()).toEqual(["draft", "ready"])
    expect((await readDraftVideos(user.id, db)).map((row) => row.projectId)).toEqual([project.id])

    const keywords = await db.select().from(promoKeywords).where(eq(promoKeywords.projectId, project.id))
    expect(keywords).toHaveLength(1)
    // Switched off, so it is never searched.
    expect(keywords[0].enabled).toBe(false)
    expect(await db.select().from(promoFinds).where(eq(promoFinds.keywordId, keywords[0].id))).toHaveLength(3)

    const parts = await readProjectParts(user.id, project.id, db)
    expect(parts.research.sample).toBe(true)
    expect(Object.values(parts.research.found).reduce((sum, row) => sum + row.total, 0)).toBeGreaterThan(0)
    expect(parts.videos).toHaveLength(2)
  })

  it("is not made for somebody who already has a project", async () => {
    const user = await insertUser(db, { role: "admin" })
    await createProject(user.id, "Mine", db)
    expect(await ensureSampleContentProject(user.id, db)).toBe(false)
    expect(await db.select().from(promoProjects).where(eq(promoProjects.userId, user.id))).toHaveLength(1)
  })
})
