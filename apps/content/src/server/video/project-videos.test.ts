import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { VIDEO_NOT_FOUND_MESSAGE } from "@/lib/video/project-videos"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import {
  PROJECT_CONFLICT_MESSAGE,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellAiUsageEvents, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { actorForVideo } from "@/server/video/project-guests"
import { readVideoSpend, requireVideoBudget } from "@/server/video/project-spend"
import {
  createVideo,
  deleteVideos,
  duplicateVideo,
  getOwnedVideo,
  listProjectVideos,
  moveVideos,
  openProjectVideo,
  personKey,
  rememberOpenVideo,
  renameVideo,
  saveVideoSpendLimit,
  setVideoPinned,
  setVideosArchived,
  setVideoStatus,
  summarizeVideoDelete,
  writeVideoTimeline,
} from "@/server/video/project-videos"
import {
  createOwnedProject,
  deleteOwnedProjects,
  duplicateOwnedProject,
  listOwnedProjects,
} from "@/server/video/projects"
import { videoProjectGuests, videoProjectVideos } from "@/server/video/schema"

/**
 * A project holds many videos (workspace/tasks/projects/01-projects-hold-many.md,
 * section A; workspace/docs/project-videos.md).
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date("2026-11-01T09:00:00Z"), toFake: ["Date"] })
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
})

afterEach(async () => {
  vi.useRealTimers()
  await client.close()
})

function timelineOf(seconds: number, aspect: ProjectTimeline["aspect"] = "9:16"): ProjectTimeline {
  return {
    aspect,
    tracks: [
      {
        id: "track-1",
        muted: false,
        clips: [
          {
            id: `clip-${seconds}`,
            kind: "video",
            name: "clip.mp4",
            startMs: 0,
            durationMs: seconds * 1000,
            trimStartMs: 0,
          },
        ],
      },
    ],
  }
}

/** Moves the clock on, so each new or saved video has its own time. */
function later(minutes = 1) {
  vi.setSystemTime(new Date(Date.now() + minutes * 60_000))
}

async function spend(video: { id: string; projectId: string } | null, projectId: string, cents: number) {
  await database.insert(customShellAiUsageEvents).values({
    id: uuid(),
    userId: user.id,
    provider: "gemini",
    model: "gemini-2.5-flash-image",
    feature: "video-image-generation",
    inputTokens: 0,
    outputTokens: 0,
    costCents: cents,
    status: "success",
    monthStart: "2026-11-01",
    metadata: video ? { projectId: video.projectId, videoId: video.id } : { projectId },
    createdAt: now(),
  })
}

describe("a project holds many videos", () => {
  it("starts with one video named after it, and adds more in the last video's shape", async () => {
    const made = await createOwnedProject(user.id, "Weekly tips", database)
    const first = await getOwnedVideo(user.id, made.video, database)
    expect(first.name).toBe("Weekly tips")
    expect(first.projectId).toBe(made.project.id)

    later()
    await writeVideoTimeline(user.id, first.id, timelineOf(5, "1:1"), 1, database)
    later()
    const second = await createVideo(user.id, made.project.id, {}, database)
    expect(second.aspect).toBe("1:1")
    expect(second.name).toBe("Video 2")
    expect(second.clip_count).toBe(0)
  })

  it("makes a video with the name, shape and status picked in New video", async () => {
    const made = await createOwnedProject(user.id, "Series", database)
    const video = await createVideo(
      user.id,
      made.project.id,
      { name: "  Pricing   tips ", aspect: "1:1", status: "ready" },
      database
    )
    expect([video.name, video.aspect, video.status]).toEqual(["Pricing tips", "1:1", "ready"])
    const row = await getOwnedVideo(user.id, video.id, database)
    expect((row.timeline as { aspect: string }).aspect).toBe("1:1")
  })

  it("saves each video's timeline without touching the others", async () => {
    const made = await createOwnedProject(user.id, "Series", database)
    const other = await createVideo(user.id, made.project.id, {}, database)
    later()
    await writeVideoTimeline(user.id, made.video, timelineOf(5), 1, database)
    await writeVideoTimeline(user.id, other.id, timelineOf(9), 1, database)

    const [a, b] = await Promise.all([
      getOwnedVideo(user.id, made.video, database),
      getOwnedVideo(user.id, other.id, database),
    ])
    expect([a.durationMs, a.clipCount, a.version]).toEqual([5000, 1, 2])
    expect([b.durationMs, b.clipCount, b.version]).toEqual([9000, 1, 2])
    // The second save to the same video on the old version is refused.
    await expect(
      writeVideoTimeline(user.id, made.video, timelineOf(6), 1, database)
    ).rejects.toThrow(PROJECT_CONFLICT_MESSAGE)
  })

  it("holds 500 videos and lists them a page at a time", async () => {
    const made = await createOwnedProject(user.id, "Big", database)
    await database.insert(videoProjectVideos).values(
      Array.from({ length: 499 }, (_, index) => ({
        id: uuid(),
        projectId: made.project.id,
        userId: user.id,
        name: `Clip ${index}`,
        aspect: "9:16",
        timeline: { aspect: "9:16", tracks: [] },
        createdAt: now(),
        updatedAt: now(),
      }))
    )
    const first = await listProjectVideos({ userId: user.id, projectId: made.project.id, database })
    expect(first.total).toBe(500)
    expect(first.videos).toHaveLength(200)
    expect(first.total_pages).toBe(3)
    const last = await listProjectVideos({
      userId: user.id,
      projectId: made.project.id,
      page: 3,
      database,
    })
    expect(last.videos).toHaveLength(100)
  })

  it("searches, sorts, filters by status and keeps pinned videos on top", async () => {
    const made = await createOwnedProject(user.id, "Tips", database)
    later()
    const pricing = await createVideo(user.id, made.project.id, { name: "Pricing 100%" }, database)
    later()
    const hooks = await createVideo(user.id, made.project.id, { name: "Hooks" }, database)
    await setVideoStatus(user.id, hooks.id, "posted", database)
    await setVideoPinned(user.id, made.video, true, database)

    const list = (options: Parameters<typeof listProjectVideos>[0]) =>
      listProjectVideos(options).then((answer) => answer.videos.map((video) => video.name))
    const base = { userId: user.id, projectId: made.project.id, database }

    expect(await list({ ...base, search: "100%" })).toEqual(["Pricing 100%"])
    expect(await list({ ...base, status: "posted" })).toEqual(["Hooks"])
    expect(await list({ ...base, sort: "name" })).toEqual(["Tips", "Hooks", "Pricing 100%"])
    expect(await list({ ...base, sort: "newest" })).toEqual(["Tips", "Hooks", "Pricing 100%"])
    expect(pricing.status).toBe("draft")
  })

  it("archives videos, takes their pin off, and brings them back", async () => {
    const made = await createOwnedProject(user.id, "Tips", database)
    const other = await createVideo(user.id, made.project.id, {}, database)
    await setVideoPinned(user.id, other.id, true, database)
    const result = await setVideosArchived(user.id, [other.id, "nobody"], true, database)
    expect(result).toEqual({ done_ids: [other.id], skipped_ids: ["nobody"] })

    const base = { userId: user.id, projectId: made.project.id, database }
    expect((await listProjectVideos(base)).videos.map((video) => video.id)).toEqual([made.video])
    const archived = await listProjectVideos({ ...base, archived: true })
    expect(archived.videos[0]).toMatchObject({ id: other.id, archived: true, pinned: false })

    await setVideosArchived(user.id, [other.id], false, database)
    expect((await listProjectVideos(base)).total).toBe(2)
  })

  it("duplicates a video into the same project, named copy", async () => {
    const made = await createOwnedProject(user.id, "Tips", database)
    later()
    await writeVideoTimeline(user.id, made.video, timelineOf(7), 1, database)
    await saveVideoSpendLimit(user.id, made.video, 500, database)
    later()
    const newer = await createVideo(user.id, made.project.id, { name: "Newer" }, database)
    const copy = await duplicateVideo(user.id, made.video, database)
    // Under "Last edited", the copy sits right under its original.
    const order = await listProjectVideos({ userId: user.id, projectId: made.project.id, database })
    expect(order.videos.map((video) => video.name)).toEqual([newer.name, "Tips", "Tips copy"])
    expect(copy).toMatchObject({
      project_id: made.project.id,
      name: "Tips copy",
      duration_ms: 7000,
      spend_limit_cents: 500,
      version: 1,
    })
  })

  it("moves videos to another project with their history and exports", async () => {
    const from = await createOwnedProject(user.id, "From", database)
    const to = await createOwnedProject(user.id, "To", database)
    const moved = await moveVideos(user.id, [from.video, to.video], to.project.id, database)
    // The one already there is skipped.
    expect(moved).toEqual({ done_ids: [from.video], skipped_ids: [to.video] })
    expect((await getOwnedVideo(user.id, from.video, database)).projectId).toBe(to.project.id)
    const stranger = await insertUser(database)
    await expect(moveVideos(stranger.id, [from.video], to.project.id, database)).rejects.toThrow(
      PROJECT_NOT_FOUND_MESSAGE
    )
  })

  it("renames a video without moving its version", async () => {
    const made = await createOwnedProject(user.id, "Tips", database)
    const renamed = await renameVideo(user.id, made.video, "  Episode   one ", database)
    expect(renamed).toMatchObject({ name: "Episode one", version: 1 })
  })

  it("deletes videos and counts what goes with them", async () => {
    const made = await createOwnedProject(user.id, "Tips", database)
    const other = await createVideo(user.id, made.project.id, {}, database)
    expect(await summarizeVideoDelete(user.id, [other.id], database)).toEqual({ videos: 1, exports: 0 })
    expect(await deleteVideos(user.id, [other.id], database)).toEqual({
      deleted_ids: [other.id],
      failed_ids: [],
    })
    await expect(getOwnedVideo(user.id, other.id, database)).rejects.toThrow(VIDEO_NOT_FOUND_MESSAGE)
  })

  it("keeps somebody else's videos out of reach", async () => {
    const made = await createOwnedProject(user.id, "Tips", database)
    const stranger = await insertUser(database)
    await expect(getOwnedVideo(stranger.id, made.video, database)).rejects.toThrow(
      VIDEO_NOT_FOUND_MESSAGE
    )
    await expect(
      listProjectVideos({ userId: stranger.id, projectId: made.project.id, database })
    ).rejects.toThrow(PROJECT_NOT_FOUND_MESSAGE)
    expect(await deleteVideos(stranger.id, [made.video], database)).toEqual({
      deleted_ids: [],
      failed_ids: [],
    })
  })
})

describe("opening a project", () => {
  it("opens the first video the first time, then the one last opened", async () => {
    const made = await createOwnedProject(user.id, "Tips", database)
    later()
    const newer = await createVideo(user.id, made.project.id, {}, database)
    const open = (videoId?: string) =>
      openProjectVideo({
        userId: user.id,
        projectId: made.project.id,
        videoId,
        person: user.id,
        database,
      })

    // First in the Videos tab's own order: the last edited.
    expect((await open())?.id).toBe(newer.id)
    await rememberOpenVideo(user.id, made.video, user.id, database)
    expect((await open())?.id).toBe(made.video)
    // Asked for by name wins.
    expect((await open(newer.id))?.id).toBe(newer.id)
  })

  it("remembers a guest's last video apart from the owner's", async () => {
    const made = await createOwnedProject(user.id, "Tips", database)
    const other = await createVideo(user.id, made.project.id, {}, database)
    const guest = personKey({ userId: user.id, guestId: "guest-1" })
    await rememberOpenVideo(user.id, other.id, guest, database)
    await rememberOpenVideo(user.id, made.video, user.id, database)
    const opened = await openProjectVideo({
      userId: user.id,
      projectId: made.project.id,
      person: guest,
      database,
    })
    expect(opened?.id).toBe(other.id)
  })

  it("passes over an archived video, opens one when all are archived, and makes nothing", async () => {
    const made = await createOwnedProject(user.id, "Tips", database)
    later()
    const other = await createVideo(user.id, made.project.id, {}, database)
    await rememberOpenVideo(user.id, other.id, user.id, database)
    await setVideosArchived(user.id, [other.id], true, database)
    const open = () =>
      openProjectVideo({ userId: user.id, projectId: made.project.id, person: user.id, database })
    expect((await open())?.id).toBe(made.video)

    await setVideosArchived(user.id, [made.video], true, database)
    expect((await open())?.archived).toBe(true)

    await deleteVideos(user.id, [made.video, other.id], database)
    expect(await open()).toBeNull()
    expect((await listProjectVideos({ userId: user.id, projectId: made.project.id, database })).total).toBe(0)
  })

  it("refuses a video from another project", async () => {
    const one = await createOwnedProject(user.id, "One", database)
    const two = await createOwnedProject(user.id, "Two", database)
    await expect(
      openProjectVideo({
        userId: user.id,
        projectId: one.project.id,
        videoId: two.video,
        person: user.id,
        database,
      })
    ).rejects.toThrow(VIDEO_NOT_FOUND_MESSAGE)
  })
})

describe("a guest sent from Project", () => {
  it("reaches every video in their project and nothing else", async () => {
    const theirs = await createOwnedProject(user.id, "Theirs", database)
    const another = await createVideo(user.id, theirs.project.id, {}, database)
    const elsewhere = await createOwnedProject(user.id, "Elsewhere", database)
    const [guest] = await database
      .insert(videoProjectGuests)
      .values({
        id: uuid(),
        projectId: theirs.project.id,
        tokenHash: "a".repeat(64),
        personId: "person-1",
        personName: "Sam",
        personEmail: "sam@example.test",
        expiresAt: new Date(Date.now() + 3_600_000),
        createdAt: now(),
      })
      .returning()
    const caller = { user: null, guests: [guest] }
    expect(await actorForVideo(caller, another.id, database)).toMatchObject({ userId: user.id })
    await expect(actorForVideo(caller, elsewhere.video, database)).rejects.toThrow(
      PROJECT_NOT_FOUND_MESSAGE
    )
  })
})

describe("AI spend per video", () => {
  it("holds each video to its own limit and shows the project's total", async () => {
    const made = await createOwnedProject(user.id, "Tips", database)
    const b = await createVideo(user.id, made.project.id, {}, database)
    const a = { id: made.video, projectId: made.project.id }
    await saveVideoSpendLimit(user.id, a.id, 500, database)
    await spend(a, made.project.id, 450)
    await spend({ id: b.id, projectId: made.project.id }, made.project.id, 200)
    // Work made from the Actors page in the project's look names no video.
    await spend(null, made.project.id, 25)

    // $4.50 of $5.00 spent on video A, so a $1.00 picture is refused there.
    await expect(requireVideoBudget(user.id, a.id, 100, database)).rejects.toThrow(
      "This video has spent $4.50 of its $5.00 limit"
    )
    // Video B has no limit and carries on.
    await expect(requireVideoBudget(user.id, b.id, 100, database)).resolves.toMatchObject({ id: b.id })

    const read = await readVideoSpend(user.id, a.id, database)
    expect(read).toMatchObject({ total_cents: 450, limit_cents: 500, project_total_cents: 675 })
  })
})

describe("the projects table", () => {
  it("counts each project's videos and adds up their length", async () => {
    const made = await createOwnedProject(user.id, "Tips", database)
    const second = await createVideo(user.id, made.project.id, {}, database)
    later()
    await writeVideoTimeline(user.id, made.video, timelineOf(5), 1, database)
    await writeVideoTimeline(user.id, second.id, timelineOf(3, "1:1"), 1, database)
    const [row] = (await listOwnedProjects({ userId: user.id, database })).projects
    expect(row).toMatchObject({ video_count: 2, duration_ms: 8000 })
    expect(row.aspects.sort()).toEqual(["1:1", "9:16"])
  })

  it("duplicates a project with every video in it", async () => {
    const made = await createOwnedProject(user.id, "Tips", database)
    await createVideo(user.id, made.project.id, {}, database)
    const copy = await duplicateOwnedProject(user.id, made.project.id, database)
    expect(copy).toMatchObject({ name: "Tips copy", video_count: 2 })
  })

  it("deletes a project with all its videos", async () => {
    const made = await createOwnedProject(user.id, "Tips", database)
    await createVideo(user.id, made.project.id, {}, database)
    await deleteOwnedProjects(user.id, [made.project.id], database)
    expect(
      await database
        .select()
        .from(videoProjectVideos)
        .where(eq(videoProjectVideos.projectId, made.project.id))
    ).toEqual([])
  })
})
