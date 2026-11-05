import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { followByLink } from "@/server/viral/project-creators"
import {
  addViralKeyword,
  addViralSocial,
  createViralProject,
  removeViralSocial,
  saveViralProjectTopic,
  setViralSocialPaused,
} from "@/server/viral/projects"
import { viralCreators, viralProjectCreators } from "@/server/viral/schema"

/**
 * Socials as modules (task parts 3 to 5), copied from Promo's networks:
 * add, pause, and take off, refused while a social still holds anything.
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

function project(socials: ("youtube" | "tiktok")[], keywords: string[] = []) {
  return createViralProject(user.id, { name: "Meal prep", description: "", topic: "busy dads", socials, keywords, folderId: null })
}

describe("a project's socials", () => {
  it("keeps the socials ticked in the New project window, and the topic", async () => {
    const made = await project(["youtube"])
    expect(made.socials).toEqual(["youtube"])
    expect(made.topic).toBe("busy dads")
    await expect(project([])).rejects.toThrow("Tick at least one social")
  })

  it("adds TikTok to a YouTube-only project once", async () => {
    const made = await project(["youtube"])
    expect((await addViralSocial(user.id, made.id, "tiktok")).socials).toEqual(["youtube", "tiktok"])
    await expect(addViralSocial(user.id, made.id, "tiktok")).rejects.toThrow("already uses TikTok")
  })

  it("refuses to take YouTube off while it has 2 keywords, and says so", async () => {
    const made = await project(["youtube", "tiktok"], ["meal prep", "high protein lunch"])
    await expect(removeViralSocial(user.id, made.id, "youtube")).rejects.toThrow("2 keywords")
    expect((await removeViralSocial(user.id, made.id, "tiktok")).socials).toEqual(["youtube"])
  })

  it("refuses to take TikTok off while it follows a creator", async () => {
    const made = await project(["tiktok"])
    const at = now()
    const creatorId = uuid()
    await database.insert(viralCreators).values({
      id: creatorId,
      ownerId: user.id,
      platform: "tiktok",
      handle: "chef",
      profileUrl: "https://www.tiktok.com/@chef",
      createdAt: at,
      updatedAt: at,
    })
    await database.insert(viralProjectCreators).values({ projectId: made.id, creatorId, createdAt: at })
    await expect(removeViralSocial(user.id, made.id, "tiktok")).rejects.toThrow("1 creator")
    await database.delete(viralProjectCreators).where(eq(viralProjectCreators.creatorId, creatorId))
    expect((await removeViralSocial(user.id, made.id, "tiktok")).socials).toEqual([])
  })

  it("pauses and resumes a social", async () => {
    const made = await project(["youtube", "tiktok"])
    expect((await setViralSocialPaused(user.id, made.id, "tiktok", true)).paused_socials).toEqual(["tiktok"])
    expect((await setViralSocialPaused(user.id, made.id, "tiktok", false)).paused_socials).toEqual([])
  })

  it("keeps keywords to YouTube and creators to the project's socials", async () => {
    const made = await project(["tiktok"])
    await expect(addViralKeyword(user.id, made.id, "meal prep")).rejects.toThrow("Add YouTube")
    await expect(followByLink(user.id, made.id, "https://www.youtube.com/@chef")).rejects.toThrow("Add YouTube to this project first")
    await expect(followByLink(user.id, made.id, "https://www.instagram.com/chef/")).rejects.toThrow("Instagram profiles can't be read")
  })

  it("changes the topic the next analysis writes for", async () => {
    const made = await project(["youtube"])
    expect((await saveViralProjectTopic(user.id, made.id, "  a gym  for retirees ")).topic).toBe("a gym for retirees")
  })

  it("never changes somebody else's project", async () => {
    const made = await project(["youtube"])
    const other = await insertUser(database)
    await expect(addViralSocial(other.id, made.id, "tiktok")).rejects.toThrow()
  })
})
