import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  KEEP_VERSIONS,
  VERSION_NOT_FOUND_MESSAGE,
} from "@/lib/video/project-versions"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import {
  PROJECT_CONFLICT_MESSAGE,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  listOwnedProjectVersions,
  readOwnedProjectVersion,
} from "@/server/video/project-versions"
import {
  createOwnedProject,
  getOwnedProjectVersion,
  restoreOwnedProjectVersion,
  writeProjectTimeline,
} from "@/server/video/projects"
import { videoProjects, videoProjectVersions } from "@/server/video/schema"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

const MINUTE = 60_000

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date("2026-10-18T17:00:00Z"), toFake: ["Date"] })
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
})

afterEach(async () => {
  vi.useRealTimers()
  await client.close()
})

/** A timeline whose one clip runs `seconds` long, so each save is told apart. */
function timelineOf(seconds: number): ProjectTimeline {
  return {
    aspect: "9:16",
    tracks: [
      {
        id: "track-1",
        muted: false,
        clips: [
          {
            id: "clip-1",
            kind: "video",
            name: "clip.mp4",
            startMs: 0,
            durationMs: seconds * 1000,
            trimStartMs: 0,
            url: "https://example.test/a.mp4",
          },
        ],
      },
    ],
  }
}

/** Saves at the given moment on top of whatever was saved last. */
async function saveAt(
  project: { id: string; version: number },
  at: Date,
  timeline: ProjectTimeline
) {
  vi.setSystemTime(at)
  const saved = await writeProjectTimeline(
    user.id,
    project.id,
    timeline,
    project.version,
    database
  )
  project.version = saved.version
}

async function storedLengths(projectId: string) {
  const versions = await listOwnedProjectVersions(user.id, projectId, database)
  return versions.map((version) => [version.reason, version.duration_ms / 1000])
}

describe("project history", () => {
  it("keeps a handful of versions from two hours of editing, not hundreds", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    // Yesterday's cut: 99 seconds long, last saved at 17:00.
    await saveAt(project, new Date("2026-10-18T17:00:00Z"), timelineOf(99))

    // Today, a save every minute from 9:00 to 11:00. Save n is n+1 seconds long.
    const start = new Date("2026-10-19T09:00:00Z").getTime()
    for (let minute = 0; minute <= 120; minute += 1) {
      await saveAt(
        project,
        new Date(start + minute * MINUTE),
        timelineOf(minute + 1)
      )
    }

    // Newest first. 9:00 kept yesterday's cut, then each hour kept the save
    // from the minute before.
    expect(await storedLengths(project.id)).toEqual([
      ["hourly", 120],
      ["hourly", 60],
      ["break", 99],
    ])
    const [, , yesterday] = await listOwnedProjectVersions(
      user.id,
      project.id,
      database
    )
    expect(yesterday.saved_at).toBe("2026-10-18T17:00:00.000Z")
  })

  it("keeps the cut from before a 30 minute break", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    await saveAt(project, new Date("2026-10-18T17:00:00Z"), timelineOf(5))
    await saveAt(project, new Date("2026-10-18T17:29:00Z"), timelineOf(6))
    expect(await storedLengths(project.id)).toEqual([])
    await saveAt(project, new Date("2026-10-18T17:59:00Z"), timelineOf(7))
    expect(await storedLengths(project.id)).toEqual([["break", 6]])
  })

  it("never keeps an empty timeline, and counts a new project's hour from when it was made", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    // Made at 17:00 and empty: an hour later the empty one is not kept.
    await saveAt(project, new Date("2026-10-18T18:05:00Z"), timelineOf(1))
    expect(await storedLengths(project.id)).toEqual([])
    // With clips in it, the next save keeps it, as its hour is already up.
    await saveAt(project, new Date("2026-10-18T18:20:00Z"), timelineOf(2))
    await saveAt(project, new Date("2026-10-18T18:40:00Z"), timelineOf(3))
    expect(await storedLengths(project.id)).toEqual([["hourly", 1]])
  })

  it(`keeps only the newest ${KEEP_VERSIONS}`, async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    const start = new Date("2026-10-18T17:00:00Z").getTime()
    // A save every 61 minutes: each comes after a break and keeps the one
    // before it, 39 in all.
    for (let step = 0; step < 40; step += 1) {
      await saveAt(
        project,
        new Date(start + step * 61 * MINUTE),
        timelineOf(step + 1)
      )
    }
    const versions = await listOwnedProjectVersions(user.id, project.id, database)
    expect(versions).toHaveLength(KEEP_VERSIONS)
    // The newest is the save just before the last one.
    expect(versions[0].duration_ms).toBe(39_000)
  })

  it("keeps a clip played faster, whose length is a fraction of a millisecond", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    const faster = timelineOf(5)
    faster.tracks[0].clips[0].durationMs = 12011.111111111113
    await saveAt(project, new Date("2026-10-18T17:00:00Z"), faster)
    await saveAt(project, new Date("2026-10-19T09:00:00Z"), timelineOf(6))
    const [kept] = await listOwnedProjectVersions(user.id, project.id, database)
    expect(kept.duration_ms).toBe(12011)
  })

  it("still saves when the version cannot be kept", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    await saveAt(project, new Date("2026-10-18T17:00:00Z"), timelineOf(5))
    // Every insert into the table is refused from here on.
    await client.exec(
      'ALTER TABLE "video_project_versions" ADD CONSTRAINT "refuse_all" CHECK (false) NOT VALID'
    )
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    await saveAt(project, new Date("2026-10-19T09:00:00Z"), timelineOf(6))
    expect(logged).toHaveBeenCalledOnce()
    logged.mockRestore()
    const [row] = await database
      .select()
      .from(videoProjects)
      .where(eq(videoProjects.id, project.id))
    expect(row.version).toBe(project.version)
    expect((row.timeline as ProjectTimeline).tracks[0].clips[0].durationMs).toBe(6000)
  })

  it("keeps nothing for a save another window already beat", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    await saveAt(project, new Date("2026-10-18T17:00:00Z"), timelineOf(5))
    const stale = { id: project.id, version: project.version }
    await saveAt(project, new Date("2026-10-18T17:01:00Z"), timelineOf(6))
    await expect(
      saveAt(stale, new Date("2026-10-18T20:00:00Z"), timelineOf(7))
    ).rejects.toThrow(PROJECT_CONFLICT_MESSAGE)
    expect(await storedLengths(project.id)).toEqual([])
  })

  it("looking at a version changes nothing", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    await saveAt(project, new Date("2026-10-18T17:00:00Z"), timelineOf(5))
    await saveAt(project, new Date("2026-10-19T09:00:00Z"), timelineOf(6))
    const [kept] = await listOwnedProjectVersions(user.id, project.id, database)

    const seen = await getOwnedProjectVersion(
      user.id,
      project.id,
      kept.id,
      database
    )
    expect(seen.timeline.tracks[0].clips[0].durationMs).toBe(5000)
    const [row] = await database
      .select()
      .from(videoProjects)
      .where(eq(videoProjects.id, project.id))
    expect(row.version).toBe(project.version)
    expect(await storedLengths(project.id)).toEqual([["break", 5]])
  })

  it("restoring keeps what was there first, so a restore can be undone", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    await saveAt(project, new Date("2026-10-18T17:00:00Z"), timelineOf(5))
    await saveAt(project, new Date("2026-10-19T09:00:00Z"), timelineOf(6))
    const [morning] = await listOwnedProjectVersions(
      user.id,
      project.id,
      database
    )

    // An hour later, restore the 5 second cut.
    vi.setSystemTime(new Date("2026-10-19T10:00:00Z"))
    const restored = await restoreOwnedProjectVersion(
      user.id,
      project.id,
      morning.id,
      database
    )
    expect(restored.tracks[0].clips[0].durationMs).toBe(5000)
    expect(await storedLengths(project.id)).toEqual([
      ["restore", 6],
      ["break", 5],
    ])

    // The editor then saves it. What was just kept is not kept a second time,
    // although the project was last saved an hour ago.
    await saveAt(project, new Date("2026-10-19T10:00:02Z"), restored)
    expect(await storedLengths(project.id)).toEqual([
      ["restore", 6],
      ["break", 5],
    ])

    // Disliking it, "Before restoring" brings the 6 second cut back.
    const [before] = await listOwnedProjectVersions(
      user.id,
      project.id,
      database
    )
    const undone = await restoreOwnedProjectVersion(
      user.id,
      project.id,
      before.id,
      database
    )
    expect(undone.tracks[0].clips[0].durationMs).toBe(6000)
  })

  it("restoring back and forth keeps each cut once, not once per press", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    // The old cut is stored without the address the editor later fills in.
    const oldCut = timelineOf(5)
    delete oldCut.tracks[0].clips[0].url
    await saveAt(project, new Date("2026-10-18T17:00:00Z"), oldCut)
    await saveAt(project, new Date("2026-10-19T09:00:00Z"), timelineOf(11))
    const [older] = await listOwnedProjectVersions(user.id, project.id, database)

    // Restore the old cut, the 11 second one, the old cut again, and so on,
    // saving each the way the editor does: with its address filled in.
    let pick = older.id
    for (let press = 0; press < 4; press += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 9, 19, 10, press)))
      const restored = await restoreOwnedProjectVersion(
        user.id,
        project.id,
        pick,
        database
      )
      restored.tracks[0].clips[0].url = "https://example.test/a.mp4"
      await saveAt(
        project,
        new Date(Date.UTC(2026, 9, 19, 10, press, 2)),
        restored
      )
      const versions = await listOwnedProjectVersions(
        user.id,
        project.id,
        database
      )
      pick = versions.find((version) => version.id !== pick)!.id
    }

    expect(await storedLengths(project.id)).toEqual([
      ["restore", 11],
      ["break", 5],
    ])
  })

  it("shows nobody else a project's versions", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    await saveAt(project, new Date("2026-10-18T17:00:00Z"), timelineOf(5))
    await saveAt(project, new Date("2026-10-19T09:00:00Z"), timelineOf(6))
    const [kept] = await listOwnedProjectVersions(user.id, project.id, database)
    const stranger = await insertUser(database)

    expect(
      await listOwnedProjectVersions(stranger.id, project.id, database)
    ).toEqual([])
    await expect(
      readOwnedProjectVersion(stranger.id, project.id, kept.id, database)
    ).rejects.toThrow(VERSION_NOT_FOUND_MESSAGE)
    await expect(
      restoreOwnedProjectVersion(stranger.id, project.id, kept.id, database)
    ).rejects.toThrow(PROJECT_NOT_FOUND_MESSAGE)
  })

  it("deleting the project deletes its versions", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    await saveAt(project, new Date("2026-10-18T17:00:00Z"), timelineOf(5))
    await saveAt(project, new Date("2026-10-19T09:00:00Z"), timelineOf(6))
    await database.delete(videoProjects).where(eq(videoProjects.id, project.id))
    expect(await database.select().from(videoProjectVersions)).toEqual([])
  })
})
