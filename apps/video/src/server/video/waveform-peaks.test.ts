import { PGlite } from "@electric-sql/pglite"
import { sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  WAVEFORM_MAX_POINTS,
  waveformPeaks,
  waveformPointCount,
} from "@/server/video/waveform-peaks"

function pcm(samples: number[]) {
  const buffer = Buffer.alloc(samples.length * 2)
  samples.forEach((value, index) => buffer.writeInt16LE(value, index * 2))
  return buffer
}

describe("waveformPointCount", () => {
  it("gives 25 points a second", () => {
    expect(waveformPointCount(4000)).toBe(100)
  })

  it("never drops below one point or above the cap", () => {
    expect(waveformPointCount(1)).toBe(1)
    expect(waveformPointCount(3 * 60 * 60 * 1000)).toBe(WAVEFORM_MAX_POINTS)
  })
})

describe("waveformPeaks", () => {
  it("keeps the loudest sample in each slice, scaled to the loudest in the file", () => {
    const peaks = waveformPeaks(pcm([100, -200, 50, 400, -800, 0]), 3)
    expect(Array.from(peaks)).toEqual([64, 128, 255])
  })

  it("draws a silent file as all zeros", () => {
    expect(Array.from(waveformPeaks(pcm([0, 0, 0, 0]), 2))).toEqual([0, 0])
  })

  it("handles the most negative sample", () => {
    expect(Array.from(waveformPeaks(pcm([-32768, 16384]), 2))).toEqual([255, 128])
  })

  it("repeats a sample when there are more points than samples", () => {
    expect(Array.from(waveformPeaks(pcm([10, 20]), 4))).toEqual([128, 128, 255, 255])
  })
})

describe("video_media_waveforms", () => {
  let client: PGlite
  let database: CustomShellDb
  let mediaId: string

  beforeEach(async () => {
    const testDb = await createTestDatabase()
    client = testDb.client
    database = testDb.db
    const user = await insertUser(database)
    const workspace = await insertWorkspace(database, { userId: user.id })
    const timestamp = now()
    mediaId = uuid()
    await database.insert(customShellMedia).values({
      id: mediaId,
      workspaceId: workspace.id,
      userId: user.id,
      filename: "voice.mp3",
      originalName: "voice.mp3",
      fileSize: 1000,
      mimeType: "audio/mpeg",
      fileType: "audio",
      storagePath: `${user.id}/voice.mp3`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  })

  afterEach(async () => {
    await client.close()
  })

  function insertRow(status: string, peaks: string | null, pointCount: number | null, durationMs: number | null) {
    return database.execute(sql`
      insert into video_media_waveforms
        (media_id, status, profile, peaks, point_count, duration_ms, created_at, updated_at)
      values (${mediaId}, ${status}, 'u8-peaks-25ps-v1', ${peaks}, ${pointCount}, ${durationMs}, now(), now())
    `)
  }

  it("accepts a ready row with points", async () => {
    await expect(insertRow("ready", "AP8=", 2, 80)).resolves.toBeDefined()
  })

  it("accepts a ready row with no sound track", async () => {
    await expect(insertRow("ready", "", 0, null)).resolves.toBeDefined()
  })

  it("refuses a ready row with no points to draw", async () => {
    await expect(insertRow("ready", null, null, null)).rejects.toThrow()
  })

  it("refuses a ready row with points but no length", async () => {
    await expect(insertRow("ready", "AP8=", 2, null)).rejects.toThrow()
  })

  it("refuses a ready row with points but no count", async () => {
    await expect(insertRow("ready", "AP8=", null, 80)).rejects.toThrow()
  })

  it("goes when its file is deleted", async () => {
    await insertRow("queued", null, null, null)
    await database.delete(customShellMedia).where(sql`id = ${mediaId}`)
    const left = await database.execute(sql`select 1 from video_media_waveforms`)
    expect(left.rows).toHaveLength(0)
  })
})
