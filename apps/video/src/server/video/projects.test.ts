import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import {
  PROJECT_CONFLICT_MESSAGE,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  createOwnedProject,
  deleteOwnedProjects,
  duplicateOwnedProject,
  getOwnedProjectDetail,
  listOwnedProjects,
  renameOwnedProject,
  writeProjectTimeline,
} from "@/server/video/projects"
import { videoMediaProxies, videoProjects } from "@/server/video/schema"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

// serializeMedia builds public URLs, which need the R2 base — same pattern as
// the shell's own tests.
const hadOriginalR2PublicUrl = Object.prototype.hasOwnProperty.call(
  process.env,
  "CUSTOM_SHELL_R2_PUBLIC_URL"
)
const originalR2PublicUrl = process.env.CUSTOM_SHELL_R2_PUBLIC_URL

beforeEach(async () => {
  process.env.CUSTOM_SHELL_R2_PUBLIC_URL = "https://video-media.example.test"
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
})

afterEach(async () => {
  await client.close()
  if (hadOriginalR2PublicUrl) {
    process.env.CUSTOM_SHELL_R2_PUBLIC_URL = originalR2PublicUrl
  } else {
    delete process.env.CUSTOM_SHELL_R2_PUBLIC_URL
  }
})

async function insertMedia(ownerId: string) {
  const timestamp = now()
  const [row] = await database
    .insert(customShellMedia)
    .values({
      id: uuid(),
      userId: ownerId,
      filename: `${uuid()}.mp4`,
      originalName: "clip.mp4",
      fileSize: 1000,
      mimeType: "video/mp4",
      fileType: "video",
      storagePath: `${ownerId}/${uuid()}.mp4`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return row
}

function timelineWith(clips: ProjectTimeline["tracks"][number]["clips"]) {
  return {
    aspect: "9:16",
    tracks: [{ id: "track-1", muted: false, clips }],
  } satisfies ProjectTimeline
}

function videoClip(mediaId: string, url: string) {
  return {
    id: "clip-1",
    kind: "video" as const,
    name: "clip.mp4",
    startMs: 0,
    durationMs: 4000,
    trimStartMs: 0,
    mediaId,
    url,
  }
}

describe("projects", () => {
  it("creates a project empty, vertical and at version 1", async () => {
    const project = await createOwnedProject(user.id, "  My   reel  ", database)
    // The name is tidied on the way in, so no project is called "My   reel".
    expect(project.name).toBe("My reel")
    expect(project.aspect).toBe("9:16")
    expect(project.version).toBe(1)
    expect(project.clip_count).toBe(0)
    expect(project.duration_ms).toBe(0)
  })

  it("refuses a name that is only spaces", async () => {
    await expect(createOwnedProject(user.id, "   ", database)).rejects.toThrow()
  })

  it("counts clips and measures length from the saved timeline", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    await writeProjectTimeline(
      user.id,
      project.id,
      timelineWith([
        videoClip("media-1", "https://example.test/a.mp4"),
        { ...videoClip("media-2", "https://example.test/b.mp4"), id: "clip-2", startMs: 4000 },
      ]),
      project.version,
      database
    )
    const [listed] = (await listOwnedProjects({ userId: user.id, database }))
      .projects
    expect(listed.clip_count).toBe(2)
    expect(listed.duration_ms).toBe(8000)
  })

  it("keeps the aspect column in step with the timeline it came from", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    await writeProjectTimeline(
      user.id,
      project.id,
      { aspect: "16:9", tracks: [] },
      project.version,
      database
    )
    const [row] = await database
      .select()
      .from(videoProjects)
      .where(eq(videoProjects.id, project.id))
    expect(row.aspect).toBe("16:9")
  })

  it("refuses a second save built on the version the first one replaced", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    const first = await writeProjectTimeline(
      user.id,
      project.id,
      { aspect: "9:16", tracks: [] },
      project.version,
      database
    )
    expect(first.version).toBe(project.version + 1)

    // The second tab still holds the version it loaded.
    await expect(
      writeProjectTimeline(
        user.id,
        project.id,
        { aspect: "1:1", tracks: [] },
        project.version,
        database
      )
    ).rejects.toThrowError(PROJECT_CONFLICT_MESSAGE)

    // And the first tab's work is still what is stored.
    const [row] = await database
      .select()
      .from(videoProjects)
      .where(eq(videoProjects.id, project.id))
    expect(row.aspect).toBe("9:16")
  })

  it("refuses a timeline the editor could not draw", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    await expect(
      writeProjectTimeline(
        user.id,
        project.id,
        { aspect: "9:16", tracks: [{ id: "t", muted: false, clips: [{ nope: true }] }] } as never,
        project.version,
        database
      )
    ).rejects.toThrow()
  })

  it("says not-found, never conflict, for somebody else's project", async () => {
    const stranger = await insertUser(database)
    const project = await createOwnedProject(stranger.id, "Theirs", database)
    await expect(
      writeProjectTimeline(
        user.id,
        project.id,
        { aspect: "9:16", tracks: [] },
        project.version,
        database
      )
    ).rejects.toThrowError(PROJECT_NOT_FOUND_MESSAGE)
    await expect(
      getOwnedProjectDetail(user.id, project.id, database)
    ).rejects.toThrowError(PROJECT_NOT_FOUND_MESSAGE)
  })

  it("opens a broken timeline empty, and says why", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    await database
      .update(videoProjects)
      .set({ timeline: { tracks: "not a list" } })
      .where(eq(videoProjects.id, project.id))

    const detail = await getOwnedProjectDetail(user.id, project.id, database)
    expect(detail.timeline.tracks).toEqual([])
    expect(detail.timeline_error).not.toBeNull()
  })

  it("plays the original file until a proxy is ready, then the proxy", async () => {
    const media = await insertMedia(user.id)
    const project = await createOwnedProject(user.id, "Reel", database)
    await writeProjectTimeline(
      user.id,
      project.id,
      timelineWith([videoClip(media.id, "https://stale.example.test/old.mp4")]),
      project.version,
      database
    )

    const before = await getOwnedProjectDetail(user.id, project.id, database)
    // The address saved with the clip is never handed back as-is.
    expect(before.timeline.tracks[0].clips[0].url).toContain(
      "video-media.example.test"
    )

    const timestamp = now()
    await database.insert(videoMediaProxies).values({
      mediaId: media.id,
      status: "ready",
      profile: "h264-720p",
      storagePath: `video/proxies/${user.id}/${media.id}/token.mp4`,
      generatedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const after = await getOwnedProjectDetail(user.id, project.id, database)
    expect(after.timeline.tracks[0].clips[0].url).toContain(
      `video/proxies/${user.id}/${media.id}/token.mp4`
    )
  })

  it("leaves a clip alone when its media belongs to somebody else", async () => {
    const stranger = await insertUser(database)
    const strangersMedia = await insertMedia(stranger.id)
    const project = await createOwnedProject(user.id, "Reel", database)
    await writeProjectTimeline(
      user.id,
      project.id,
      timelineWith([
        videoClip(strangersMedia.id, "https://example.test/kept.mp4"),
      ]),
      project.version,
      database
    )
    const detail = await getOwnedProjectDetail(user.id, project.id, database)
    expect(detail.timeline.tracks[0].clips[0].url).toBe(
      "https://example.test/kept.mp4"
    )
  })

  it("duplicates the timeline into a fresh project of its own", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    const saved = await writeProjectTimeline(
      user.id,
      project.id,
      timelineWith([videoClip("media-1", "https://example.test/a.mp4")]),
      project.version,
      database
    )

    const copy = await duplicateOwnedProject(user.id, project.id, database)
    expect(copy.name).toBe("Reel copy")
    expect(copy.id).not.toBe(project.id)
    expect(copy.version).toBe(1)
    expect(copy.clip_count).toBe(saved.clip_count)

    // Editing the copy leaves the original where it was.
    await writeProjectTimeline(
      user.id,
      copy.id,
      { aspect: "9:16", tracks: [] },
      copy.version,
      database
    )
    const original = await getOwnedProjectDetail(user.id, project.id, database)
    expect(original.clip_count).toBe(1)
  })

  it("renames only the caller's own project", async () => {
    const stranger = await insertUser(database)
    const theirs = await createOwnedProject(stranger.id, "Theirs", database)
    await expect(
      renameOwnedProject(user.id, theirs.id, "Mine now", database)
    ).rejects.toThrowError(PROJECT_NOT_FOUND_MESSAGE)
  })

  it("deletes the caller's projects and reports exactly which went", async () => {
    const stranger = await insertUser(database)
    const mine = await createOwnedProject(user.id, "Mine", database)
    const theirs = await createOwnedProject(stranger.id, "Theirs", database)

    const result = await deleteOwnedProjects(
      user.id,
      [mine.id, theirs.id],
      database
    )
    expect(result.deleted_ids).toEqual([mine.id])

    const survivors = await database.select().from(videoProjects)
    expect(survivors.map((row) => row.id)).toEqual([theirs.id])
  })

  it("deleting a project never touches the footage it used", async () => {
    const media = await insertMedia(user.id)
    const project = await createOwnedProject(user.id, "Reel", database)
    await writeProjectTimeline(
      user.id,
      project.id,
      timelineWith([videoClip(media.id, "https://example.test/a.mp4")]),
      project.version,
      database
    )

    await deleteOwnedProjects(user.id, [project.id], database)

    const survivors = await database
      .select()
      .from(customShellMedia)
      .where(eq(customShellMedia.id, media.id))
    expect(survivors).toHaveLength(1)
  })

  it("searches by name with wildcards kept literal", async () => {
    await createOwnedProject(user.id, "Gym hook", database)
    await createOwnedProject(user.id, "Other", database)

    const hits = await listOwnedProjects({
      userId: user.id,
      search: "gym",
      database,
    })
    expect(hits.projects.map((project) => project.name)).toEqual(["Gym hook"])

    const literal = await listOwnedProjects({
      userId: user.id,
      search: "%",
      database,
    })
    expect(literal.projects).toHaveLength(0)
  })

  it("never lists another person's projects", async () => {
    const stranger = await insertUser(database)
    await createOwnedProject(stranger.id, "Theirs", database)
    const mine = await createOwnedProject(user.id, "Mine", database)

    const listed = await listOwnedProjects({ userId: user.id, database })
    expect(listed.projects.map((project) => project.id)).toEqual([mine.id])
    expect(listed.total).toBe(1)
  })
})
