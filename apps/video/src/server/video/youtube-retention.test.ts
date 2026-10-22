import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { RENDER_NOT_FOUND_MESSAGE } from "@/lib/video/render"
import {
  channelChangedMessage,
  EXPORT_NOT_POSTABLE_MESSAGE,
  notYourVideoMessage,
  YOUTUBE_CLIENT_REFUSED_MESSAGE,
  YOUTUBE_LINK_INVALID_MESSAGE,
  YOUTUBE_NOT_CONNECTED_MESSAGE,
  YOUTUBE_SIGNED_OUT_MESSAGE,
} from "@/lib/video/retention"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"
import { now, uuid } from "@/server/auth/security"
import { encryptSecret } from "@/server/auth/encryption"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { createOwnedProject, writeProjectTimeline } from "@/server/video/projects"
import {
  videoExportYoutube,
  videoProjects,
  videoRenderJobs,
  videoSettings,
} from "@/server/video/schema"
import {
  disconnectYoutube,
  finishYoutubeConnect,
  getYoutubeConnectionStatus,
  saveYoutubeOauthClient,
  YoutubeConnectError,
  YOUTUBE_SCOPES,
} from "@/server/video/youtube-oauth"
import {
  getExportRetention,
  postExportOnYoutube,
  refreshExportRetention,
  removeExportYoutube,
} from "@/server/video/youtube-retention"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
const savedSecret = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY

const CHANNEL = { id: "UC-mine", title: "Barely Cooking" }
const VIDEO_ID = "dQw4w9WgXcQ"

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database, { role: "admin" })
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-secret"
})

afterEach(async () => {
  await client.close()
  if (savedSecret === undefined) delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
  else process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = savedSecret
})

type Answer = { status?: number; body: unknown }

/**
 * Google and YouTube, answered by address. Every call is kept, so a test can
 * count them and read what was sent.
 */
function fakeGoogle(answers: Partial<Record<string, Answer | (() => Answer)>> = {}) {
  const calls: { url: string; init?: RequestInit }[] = []
  const defaults: Record<string, Answer> = {
    "oauth2.googleapis.com/token": {
      body: { access_token: "access-1", scope: YOUTUBE_SCOPES.join(" ") },
    },
    "oauth2.googleapis.com/revoke": { body: {} },
    "youtube/v3/channels": {
      body: { items: [{ id: CHANNEL.id, snippet: { title: CHANNEL.title } }] },
    },
    "youtube/v3/videos": {
      body: {
        items: [
          {
            id: VIDEO_ID,
            snippet: {
              channelId: CHANNEL.id,
              title: "Scene three needs a cut",
              publishedAt: "2026-10-01T10:00:00Z",
            },
            contentDetails: { duration: "PT30S" },
          },
        ],
      },
    },
    "metrics=audienceWatchRatio": {
      body: {
        columnHeaders: [
          { name: "elapsedVideoTimeRatio" },
          { name: "audienceWatchRatio" },
          { name: "relativeRetentionPerformance" },
        ],
        rows: [
          [0.01, 1, 0.6],
          [0.4, 0.4, 0.3],
          [1, 0.2, 0.5],
        ],
      },
    },
    "metrics=views": {
      body: {
        columnHeaders: [{ name: "views" }, { name: "averageViewDuration" }],
        rows: [[1240, 18]],
      },
    },
  }
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    const key = Object.keys({ ...defaults, ...answers }).find((part) =>
      url.includes(part)
    )
    if (!key) throw new Error(`unexpected call to ${url}`)
    const found = answers[key] ?? defaults[key]
    const answer = typeof found === "function" ? found() : found!
    return new Response(JSON.stringify(answer.body), {
      status: answer.status ?? 200,
    })
  }) as typeof fetch
  return { fetchFn, calls }
}

async function connectChannel(channelId = CHANNEL.id) {
  await saveYoutubeOauthClient({ clientId: "client-1" }, database)
  await saveYoutubeOauthClient({ clientSecret: "secret-1" }, database)
  await database
    .update(videoSettings)
    .set({
      youtubeOauth: {
        refreshToken: encryptSecret("refresh-1"),
        channelId,
        channelTitle: channelId === CHANNEL.id ? CHANNEL.title : "Other channel",
        connectedAt: now().toISOString(),
      },
    })
    .where(eq(videoSettings.id, "default"))
}

const PICTURES: ProjectTimeline = {
  aspect: "9:16",
  tracks: [
    {
      id: "lane",
      muted: false,
      clips: [
        { id: "a", kind: "video", name: "Hook", startMs: 0, durationMs: 4000, trimStartMs: 0, mediaId: "m1" },
        { id: "b", kind: "image", name: "Kitchen", startMs: 4000, durationMs: 8000, trimStartMs: 0, mediaId: "m2" },
        { id: "c", kind: "video", name: "Still frame", startMs: 12000, durationMs: 18000, trimStartMs: 0, mediaId: "m3" },
      ],
    },
  ],
}

async function exportRow(overrides: Partial<typeof videoRenderJobs.$inferInsert> = {}) {
  const project = await createOwnedProject(user.id, "Short", database)
  const id = uuid()
  const [row] = await database
    .insert(videoRenderJobs)
    .values({
      id,
      userId: user.id,
      projectId: project.id,
      status: "ready",
      quality: "high",
      aspect: "9:16",
      storagePath: `video/exports/${user.id}/${id}.mp4`,
      durationMs: 30_000,
      scenes: [
        { startMs: 0, endMs: 4000, name: "Hook" },
        { startMs: 4000, endMs: 12000, name: "Kitchen" },
        { startMs: 12000, endMs: 30000, name: "Still frame" },
      ],
      createdAt: now(),
      updatedAt: now(),
      finishedAt: now(),
      ...overrides,
    })
    .returning()
  return { job: row, projectId: project.id }
}

describe("pasting the link", () => {
  it("checks the video is the channel's own, then keeps the curve and the totals", async () => {
    await connectChannel()
    const { job } = await exportRow()
    const google = fakeGoogle()

    const retention = await postExportOnYoutube({
      userId: user.id,
      exportId: job.id,
      pasted: `https://youtube.com/shorts/${VIDEO_ID}?feature=share`,
      database,
      fetchFn: google.fetchFn,
    })

    // A token, the ownership check, then the curve and the totals.
    expect(google.calls).toHaveLength(4)
    // The retention report offers no sort; asking for one risks a refusal.
    const curveCall = google.calls.find((call) => call.url.includes("audienceWatchRatio"))
    expect(new URL(curveCall!.url).searchParams.has("sort")).toBe(false)
    expect(google.calls.every((call) => !call.url.includes("refresh-1"))).toBe(true)
    expect(retention.channel_title).toBe(CHANNEL.title)
    expect(retention.posted).toMatchObject({
      youtube_video_id: VIDEO_ID,
      video_title: "Scene three needs a cut",
      length_seconds: 30,
      views: 1240,
      average_view_seconds: 18,
      other_channel: false,
    })
    expect(retention.posted?.points).toEqual([
      { ratio: 0.01, watch: 1, relative: 0.6 },
      { ratio: 0.4, watch: 0.4, relative: 0.3 },
      { ratio: 1, watch: 0.2, relative: 0.5 },
    ])
    expect(retention.posted?.read_at).not.toBeNull()
    expect(retention.scenes).toHaveLength(3)
    expect(retention.scenes_from_project_now).toBe(false)
  })

  it("asks YouTube nothing when the export is opened again", async () => {
    await connectChannel()
    const { job } = await exportRow()
    await postExportOnYoutube({
      userId: user.id,
      exportId: job.id,
      pasted: VIDEO_ID,
      database,
      fetchFn: fakeGoogle().fetchFn,
    })

    // `fetch` itself is never stubbed here: any call would go out and fail.
    const again = await getExportRetention(user.id, job.id, database)
    expect(again.posted?.views).toBe(1240)
    expect(again.posted?.points).toHaveLength(3)
  })

  it("refuses a video from another channel in words and keeps nothing", async () => {
    await connectChannel()
    const { job } = await exportRow()
    const google = fakeGoogle({
      "youtube/v3/videos": {
        body: {
          items: [
            {
              id: VIDEO_ID,
              snippet: { channelId: "UC-someone-else", title: "Not mine" },
              contentDetails: { duration: "PT30S" },
            },
          ],
        },
      },
    })

    await expect(
      postExportOnYoutube({
        userId: user.id,
        exportId: job.id,
        pasted: VIDEO_ID,
        database,
        fetchFn: google.fetchFn,
      })
    ).rejects.toThrow(notYourVideoMessage(CHANNEL.title))
    expect(await database.select().from(videoExportYoutube)).toHaveLength(0)
  })

  it("refuses something that is not a YouTube link before asking anybody", async () => {
    await connectChannel()
    const { job } = await exportRow()
    const google = fakeGoogle()
    await expect(
      postExportOnYoutube({
        userId: user.id,
        exportId: job.id,
        pasted: "https://vimeo.com/123",
        database,
        fetchFn: google.fetchFn,
      })
    ).rejects.toThrow(YOUTUBE_LINK_INVALID_MESSAGE)
    expect(google.calls).toHaveLength(0)
  })

  it("keeps the link when the figures cannot be read yet", async () => {
    await connectChannel()
    const { job } = await exportRow()
    const google = fakeGoogle({
      "metrics=views": { status: 500, body: { error: { message: "Backend Error" } } },
    })
    await expect(
      postExportOnYoutube({
        userId: user.id,
        exportId: job.id,
        pasted: VIDEO_ID,
        database,
        fetchFn: google.fetchFn,
      })
    ).rejects.toThrow("YouTube said: Backend Error")

    const kept = await getExportRetention(user.id, job.id, database)
    expect(kept.posted?.youtube_video_id).toBe(VIDEO_ID)
    expect(kept.posted?.read_at).toBeNull()
  })

  it("says to connect first when no channel is connected", async () => {
    const { job } = await exportRow()
    await expect(
      postExportOnYoutube({
        userId: user.id,
        exportId: job.id,
        pasted: VIDEO_ID,
        database,
        fetchFn: fakeGoogle().fetchFn,
      })
    ).rejects.toThrow(YOUTUBE_NOT_CONNECTED_MESSAGE)
  })

  it("refuses an export that is not finished, and somebody else's", async () => {
    await connectChannel()
    const { job } = await exportRow({ status: "error", storagePath: null })
    await expect(
      postExportOnYoutube({
        userId: user.id,
        exportId: job.id,
        pasted: VIDEO_ID,
        database,
        fetchFn: fakeGoogle().fetchFn,
      })
    ).rejects.toThrow(EXPORT_NOT_POSTABLE_MESSAGE)

    const stranger = await insertUser(database, { role: "admin" })
    const { job: mine } = await exportRow()
    await expect(
      getExportRetention(stranger.id, mine.id, database)
    ).rejects.toThrow(RENDER_NOT_FOUND_MESSAGE)
  })
})

describe("Refresh", () => {
  async function posted() {
    await connectChannel()
    const { job } = await exportRow()
    await postExportOnYoutube({
      userId: user.id,
      exportId: job.id,
      pasted: VIDEO_ID,
      database,
      fetchFn: fakeGoogle().fetchFn,
    })
    return job
  }

  it("reads the figures again with a token and two Analytics reads", async () => {
    const job = await posted()
    const google = fakeGoogle({
      "metrics=views": {
        body: {
          columnHeaders: [{ name: "views" }, { name: "averageViewDuration" }],
          rows: [[2000, 20]],
        },
      },
    })
    const retention = await refreshExportRetention({
      userId: user.id,
      exportId: job.id,
      database,
      fetchFn: google.fetchFn,
    })
    expect(google.calls).toHaveLength(3)
    expect(retention.posted?.views).toBe(2000)
  })

  it("refuses when the connected channel is not the one the video is on", async () => {
    const job = await posted()
    await connectChannel("UC-other")
    await expect(
      refreshExportRetention({
        userId: user.id,
        exportId: job.id,
        database,
        fetchFn: fakeGoogle().fetchFn,
      })
    ).rejects.toThrow(channelChangedMessage("Other channel"))
    const kept = await getExportRetention(user.id, job.id, database)
    expect(kept.posted?.other_channel).toBe(true)
  })

  it("says to connect again when Google refuses the sign-in", async () => {
    const job = await posted()
    const google = fakeGoogle({
      "oauth2.googleapis.com/token": { status: 400, body: { error: "invalid_grant" } },
    })
    await expect(
      refreshExportRetention({
        userId: user.id,
        exportId: job.id,
        database,
        fetchFn: google.fetchFn,
      })
    ).rejects.toThrow(YOUTUBE_SIGNED_OUT_MESSAGE)
  })

  it("says the client is wrong when Google refuses the client", async () => {
    const job = await posted()
    const google = fakeGoogle({
      "oauth2.googleapis.com/token": { status: 401, body: { error: "invalid_client" } },
    })
    await expect(
      refreshExportRetention({
        userId: user.id,
        exportId: job.id,
        database,
        fetchFn: google.fetchFn,
      })
    ).rejects.toThrow(YOUTUBE_CLIENT_REFUSED_MESSAGE)
  })

  it("keeps the curve on the export after Disconnect, and Remove link forgets it", async () => {
    const job = await posted()
    await disconnectYoutube(database, fakeGoogle().fetchFn)
    const kept = await getExportRetention(user.id, job.id, database)
    expect(kept.channel_title).toBeNull()
    expect(kept.posted?.points).toHaveLength(3)

    const removed = await removeExportYoutube(user.id, job.id, database)
    expect(removed.posted).toBeNull()
  })
})

describe("the scene columns", () => {
  it("come from the project as it is now when the export kept none", async () => {
    const { job, projectId } = await exportRow({ scenes: null })
    const [project] = await database
      .select({ version: videoProjects.version })
      .from(videoProjects)
      .where(eq(videoProjects.id, projectId))
    await writeProjectTimeline(user.id, projectId, PICTURES, project.version, database)
    const retention = await getExportRetention(user.id, job.id, database)
    expect(retention.scenes_from_project_now).toBe(true)
    expect(retention.scenes.map((scene) => scene.name)).toEqual([
      "Hook",
      "Kitchen",
      "Still frame",
    ])
  })
})

describe("connecting the channel", () => {
  it("keeps the refresh token scrambled and tells the browser only the channel's name", async () => {
    await saveYoutubeOauthClient({ clientId: "client-1" }, database)
    await saveYoutubeOauthClient({ clientSecret: "secret-1" }, database)
    const google = fakeGoogle({
      "oauth2.googleapis.com/token": {
        body: {
          access_token: "access-1",
          refresh_token: "refresh-plain",
          scope: YOUTUBE_SCOPES.join(" "),
        },
      },
    })

    const { channelTitle } = await finishYoutubeConnect(
      "code-1",
      "verifier-1",
      database,
      google.fetchFn
    )
    expect(channelTitle).toBe(CHANNEL.title)

    const [row] = await database.select().from(videoSettings)
    expect(row.youtubeOauth?.refreshToken).not.toContain("refresh-plain")
    expect(row.youtubeOauthClient?.clientSecret).not.toContain("secret-1")
    const status = await getYoutubeConnectionStatus(database)
    const shown = JSON.stringify(status)
    expect(shown).not.toContain("refresh-plain")
    expect(shown).not.toContain("secret-1")
    expect(status.channel?.title).toBe(CHANNEL.title)
    expect(status.maskedSecret).toBe("••••et-1")
  })

  it("refuses when a permission was unticked on Google's screen", async () => {
    await saveYoutubeOauthClient({ clientId: "client-1" }, database)
    await saveYoutubeOauthClient({ clientSecret: "secret-1" }, database)
    const google = fakeGoogle({
      "oauth2.googleapis.com/token": {
        body: {
          access_token: "access-1",
          refresh_token: "refresh-plain",
          scope: YOUTUBE_SCOPES[1],
        },
      },
    })
    const failure = await finishYoutubeConnect(
      "code-1",
      "verifier-1",
      database,
      google.fetchFn
    ).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(YoutubeConnectError)
    expect((failure as YoutubeConnectError).code).toBe("scopes")
    expect((await getYoutubeConnectionStatus(database)).channel).toBeNull()
  })

  it("deletes the sign-in on Disconnect even when Google cannot be reached", async () => {
    await connectChannel()
    const unreachable = (async () => {
      throw new Error("offline")
    }) as typeof fetch
    expect(await disconnectYoutube(database, unreachable)).toEqual({ revoked: false })
    const [row] = await database.select().from(videoSettings)
    expect(row.youtubeOauth).toBeNull()
  })

  it("disconnects the channel when the client id changes, and keeps it for a new secret", async () => {
    await connectChannel()
    await saveYoutubeOauthClient({ clientSecret: "secret-2" }, database)
    expect((await getYoutubeConnectionStatus(database)).channel).not.toBeNull()
    const google = fakeGoogle()
    await saveYoutubeOauthClient({ clientId: "client-2" }, database, google.fetchFn)
    expect((await getYoutubeConnectionStatus(database)).channel).toBeNull()
    // The old sign-in is cancelled at Google too, the same as Disconnect.
    expect(google.calls.map((call) => call.url)).toEqual([
      "https://oauth2.googleapis.com/revoke",
    ])
  })

  it("keeps both halves when the id and the secret save at the same moment", async () => {
    await Promise.all([
      saveYoutubeOauthClient({ clientId: "client-1" }, database),
      saveYoutubeOauthClient({ clientSecret: "secret-1" }, database),
    ])
    const status = await getYoutubeConnectionStatus(database)
    expect(status.clientId).toBe("client-1")
    expect(status.maskedSecret).toBe("••••et-1")
  })
})
