import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import { videoProjectVideos } from "@/server/video/schema"

vi.mock("@/server/notifications/events", () => ({ publishNotificationCreated: async () => undefined }))

const { makeRequestedVideo, requestableProjects, requestedVideoName } = await import("@/server/video/promo-requests")
const { createOwnedProject } = await import("@/server/video/projects")

let client: PGlite
let db: TestDatabase
let admin: CustomShellUser

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  admin = await insertUser(db, { role: "admin" })
})

afterEach(async () => {
  await client.close()
})

describe("Ask for a video from Promo", () => {
  it("names the video from the brief's first line", () => {
    expect(requestedVideoName("  Launch teaser\nShow the new app")).toBe("Launch teaser")
    expect(requestedVideoName("x".repeat(100))).toHaveLength(80)
    expect(requestedVideoName("   ")).toBe("Asked for in Promo")
  })

  it("lists the admins' projects only", async () => {
    const member = await insertUser(db, { role: "member" })
    const mine = await createOwnedProject(admin.id, "Launch", db)
    await createOwnedProject(member.id, "Not offered", db)
    expect(await requestableProjects(db)).toEqual([{ id: mine.project.id, name: "Launch" }])
  })

  it("makes one draft video with the brief and rings the owner's bell", async () => {
    const { project } = await createOwnedProject(admin.id, "Launch", db)
    const answer = await makeRequestedVideo({ projectId: project.id, brief: "Launch teaser\n30 seconds, upbeat", promoProjectName: "Launch week" }, db)
    expect(answer.editUrl).toContain(`/admin/video-editor/${project.id}?video=${answer.videoId}`)
    const [video] = await db.select().from(videoProjectVideos).where(eq(videoProjectVideos.id, answer.videoId))
    expect(video).toMatchObject({ name: "Launch teaser", status: "draft", promoBrief: "Launch teaser\n30 seconds, upbeat", userId: admin.id })
    const bells = await db.select().from(customShellNotifications)
    expect(bells.map((bell) => [bell.message, bell.detail])).toEqual([["Launch teaser was asked for in Promo", "From Launch week."]])
  })

  it("refuses a member's project and an empty brief", async () => {
    const member = await insertUser(db, { role: "member" })
    const { project } = await createOwnedProject(member.id, "Theirs", db)
    await expect(makeRequestedVideo({ projectId: project.id, brief: "Hi", promoProjectName: "" }, db)).rejects.toThrow("isn't there any more")
    const own = await createOwnedProject(admin.id, "Mine", db)
    await expect(makeRequestedVideo({ projectId: own.project.id, brief: "  ", promoProjectName: "" }, db)).rejects.toThrow("Write what")
  })
})
