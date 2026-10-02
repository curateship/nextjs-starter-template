import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  loadSavedVideo,
  retrySavedVideo,
  saveVideoForBreakdown,
  viralVideoTick,
} from "@/server/video/viral/saved-videos"
import { videoViralVideos } from "@/server/video/schema"
import * as download from "@/server/video/viral/download"

/**
 * The job's own rules, which are what make closing the browser harmless:
 * pressing the button twice is one row, a row left mid-job by a restart goes
 * back in the queue, and a failure keeps its reason rather than vanishing.
 *
 * None of these let the worker run for real — downloading would need yt-dlp and
 * a network. They check the states around it, which is where the bugs live.
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  // Nothing here may touch the network. yt-dlp is installed on this machine,
  // so without this the worker would really go and ask TikTok for a video —
  // seconds per test, different answers on different days, and nothing at all
  // on a machine with no connection. The refusal below is the one path these
  // tests care about anyway.
  vi.spyOn(download, "downloadViralVideo").mockRejectedValue(
    new Error("The video could not be downloaded: it is private")
  )
})

afterEach(async () => {
  await client.close()
  vi.restoreAllMocks()
})

const SOURCE = "https://www.tiktok.com/@creator/video/7312345678901234567"

describe("saving a video", () => {
  it("writes one waiting row, ready for the worker", async () => {
    const saved = await saveVideoForBreakdown(user.id, SOURCE)
    expect(saved.status).toBe("waiting")
    expect(saved.breakdown).toBeNull()
    expect(saved.playbackUrl).toBeNull()
  })

  it("pressing the button twice never makes two rows", async () => {
    const first = await saveVideoForBreakdown(user.id, SOURCE)
    const second = await saveVideoForBreakdown(user.id, SOURCE)

    expect(second.id).toBe(first.id)
    const rows = await database
      .select()
      .from(videoViralVideos)
      .where(eq(videoViralVideos.ownerId, user.id))
    expect(rows).toHaveLength(1)
  })

  it("saving the same video as somebody else is each person's own row", async () => {
    const other = await insertUser(database)
    const mine = await saveVideoForBreakdown(user.id, SOURCE)
    const theirs = await saveVideoForBreakdown(other.id, SOURCE)
    expect(theirs.id).not.toBe(mine.id)
  })

  it("refuses a link to anywhere but the three platforms", async () => {
    await expect(
      saveVideoForBreakdown(user.id, "https://example.com/video/1")
    ).rejects.toThrow(/Only YouTube, TikTok and Instagram/)
    // Nothing was written, so a refused link leaves no ghost row behind.
    const rows = await database.select().from(videoViralVideos)
    expect(rows).toHaveLength(0)
  })

  it("will not read back somebody else's saved video", async () => {
    const other = await insertUser(database)
    const theirs = await saveVideoForBreakdown(other.id, SOURCE)
    await expect(loadSavedVideo(user.id, theirs.id)).rejects.toThrow(
      /SAVED_VIDEO_NOT_FOUND/
    )
  })
})

describe("a job interrupted by a restart", () => {
  it("goes back to waiting, so closing the browser does not strand it", async () => {
    const saved = await saveVideoForBreakdown(user.id, SOURCE)
    // What a restart leaves behind: mid-job, with a lease nobody holds.
    await database
      .update(videoViralVideos)
      .set({
        status: "analysing",
        leaseToken: uuid(),
        leaseExpiresAt: new Date(Date.now() - 60_000),
      })
      .where(eq(videoViralVideos.id, saved.id))

    await viralVideoTick()

    const [row] = await database
      .select()
      .from(videoViralVideos)
      .where(eq(videoViralVideos.id, saved.id))
    // Put back and claimed again by the same tick, so it is moving rather than
    // stuck. Either state proves it was not left behind.
    expect(["waiting", "downloading", "failed"]).toContain(row.status)
    expect(row.status).not.toBe("analysing")
  })

  it("leaves a job alone while its lease is still good", async () => {
    const saved = await saveVideoForBreakdown(user.id, SOURCE)
    const token = uuid()
    await database
      .update(videoViralVideos)
      .set({
        status: "downloading",
        leaseToken: token,
        leaseExpiresAt: new Date(Date.now() + 5 * 60_000),
      })
      .where(eq(videoViralVideos.id, saved.id))

    await viralVideoTick()

    const [row] = await database
      .select()
      .from(videoViralVideos)
      .where(eq(videoViralVideos.id, saved.id))
    expect(row.status).toBe("downloading")
    expect(row.leaseToken).toBe(token)
  })
})

describe("a failure", () => {
  it("keeps its reason and can be tried again", async () => {
    const saved = await saveVideoForBreakdown(user.id, SOURCE)
    await database
      .update(videoViralVideos)
      .set({ status: "failed", error: "This post is private" })
      .where(eq(videoViralVideos.id, saved.id))

    const failed = await loadSavedVideo(user.id, saved.id)
    expect(failed.status).toBe("failed")
    expect(failed.error).toBe("This post is private")

    const again = await retrySavedVideo(user.id, saved.id)
    expect(again.status).toBe("waiting")
    expect(again.error).toBeNull()
  })

  it("will not retry a video that is not failed", async () => {
    const saved = await saveVideoForBreakdown(user.id, SOURCE)
    await expect(retrySavedVideo(user.id, saved.id)).rejects.toThrow(
      /SAVED_VIDEO_NOT_FAILED/
    )
  })

  it("will not let somebody else retry your video", async () => {
    const other = await insertUser(database)
    const saved = await saveVideoForBreakdown(user.id, SOURCE)
    await database
      .update(videoViralVideos)
      .set({ status: "failed", error: "nope" })
      .where(eq(videoViralVideos.id, saved.id))

    await expect(retrySavedVideo(other.id, saved.id)).rejects.toThrow(
      /SAVED_VIDEO_NOT_FAILED/
    )
  })

  it("a refused download fails the row and keeps the platform's own words", async () => {
    await saveVideoForBreakdown(user.id, SOURCE)
    await viralVideoTick()

    const [row] = await database.select().from(videoViralVideos)
    expect(row.status).toBe("failed")
    // The reason reaches the row rather than a flat "download failed", which
    // is what makes a failure worth reading.
    expect(row.error).toContain("private")
    // The claim is let go, so Try again can pick it straight back up.
    expect(row.leaseToken).toBeNull()
  })

  it("does nothing at all when there is no waiting video", async () => {
    await expect(viralVideoTick()).resolves.toBeUndefined()
    const rows = await database.select().from(videoViralVideos)
    expect(rows).toHaveLength(0)
  })
})

describe("the claim", () => {
  it("is taken once, so a tick never downloads the same video twice", async () => {
    await saveVideoForBreakdown(user.id, SOURCE)

    await viralVideoTick()
    await viralVideoTick()

    // The first tick claimed it and failed it. The second finds nothing
    // waiting, so the download is attempted exactly once — attempting it again
    // would mean paying for the breakdown twice on a video that succeeds.
    expect(download.downloadViralVideo).toHaveBeenCalledTimes(1)
  })

  it("does not hand the job to a second worker while the first still holds it", async () => {
    const saved = await saveVideoForBreakdown(user.id, SOURCE)
    const token = uuid()
    // Mid-breakdown, with a claim that has minutes left on it. Gemini can take
    // a while; releasing here would download and pay for the video twice.
    await database
      .update(videoViralVideos)
      .set({
        status: "analysing",
        leaseToken: token,
        leaseExpiresAt: new Date(Date.now() + 15 * 60_000),
      })
      .where(eq(videoViralVideos.id, saved.id))

    await viralVideoTick()
    await viralVideoTick()

    const [row] = await database
      .select()
      .from(videoViralVideos)
      .where(eq(videoViralVideos.id, saved.id))
    expect(row.status).toBe("analysing")
    expect(row.leaseToken).toBe(token)
  })
})

describe("the status check", () => {
  it("refuses a status the table does not allow", async () => {
    const at = now()
    await expect(
      database.insert(videoViralVideos).values({
        id: uuid(),
        ownerId: user.id,
        platform: "tiktok",
        platformVideoId: "x",
        sourceUrl: SOURCE,
        status: "halfway",
        createdAt: at,
        updatedAt: at,
      })
    ).rejects.toThrow()
  })
})
