import { PGlite } from "@electric-sql/pglite"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { voiceOrigin, type SpokenLine } from "@/lib/video/remake-clip"
import {
  requireCanonicalTimeline,
  type ProjectTimeline,
} from "@/lib/video/timeline-schema"
import { QUEUE_FULL_MESSAGE } from "@/lib/video/render"
import {
  TRANSLATE_ORIGINAL_VOLUME,
  TRANSLATE_PAST_THE_END_MESSAGE,
  TRANSLATE_SOURCE_GONE_MESSAGE,
} from "@/lib/video/translate"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { listOwnedExports } from "@/server/video/exports"
import {
  checkLanguageCopy,
  makeLanguageCopy,
} from "@/server/video/language-copies"
import {
  createOwnedProject,
  getOwnedProject,
  writeProjectTimeline,
} from "@/server/video/projects"
import { cancelRenderJob } from "@/server/video/render-queue"
import { videoProjects, videoRenderJobs } from "@/server/video/schema"

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

const TALK: ProjectTimeline = {
  aspect: "9:16",
  tracks: [
    {
      id: "talk-lane",
      muted: false,
      clips: [
        {
          id: "talk",
          kind: "audio",
          name: "Talking",
          startMs: 1000,
          durationMs: 4000,
          trimStartMs: 0,
        },
      ],
    },
  ],
}

/** A project called My Short with someone talking on it. */
async function myShort() {
  const project = await createOwnedProject(user.id, "My Short", database)
  await writeProjectTimeline(
    user.id,
    project.id,
    TALK as never,
    project.version,
    database
  )
  return project
}

function spoken(text: string): SpokenLine {
  return {
    mediaId: "voice-media",
    url: "https://media.example.test/voice.mp3",
    name: text,
    durationMs: 2000,
    captions: [
      {
        startMs: 0,
        endMs: 2000,
        text,
        words: [
          { startMs: 0, endMs: 900 },
          { startMs: 1000, endMs: 2000 },
        ],
      },
    ],
    origin: voiceOrigin("translate", {
      voiceId: "voice-1",
      voiceName: "Ana",
      text,
      modelId: "eleven_multilingual_v2",
    }),
  }
}

function check(projectId: string, sourceClipId = "talk", startsAtMs = 1000) {
  return checkLanguageCopy(
    { userId: user.id, projectId, sourceClipId, startsAtMs },
    database
  )
}

function make(projectId: string, language: "Spanish" | "Hindi") {
  return makeLanguageCopy(
    {
      userId: user.id,
      projectId,
      sourceClipId: "talk",
      language,
      said: spoken(language === "Spanish" ? "hola amigos" : "namaste dosto"),
      startsAtMs: 1000,
    },
    database
  )
}

describe("making a project in another language", () => {
  it("makes a named copy with the voice laid over the original turned down", async () => {
    const original = await myShort()
    const made = await make(original.id, "Spanish")

    expect(made.project.name).toBe("My Short (Spanish)")
    const [row] = await database
      .select()
      .from(videoProjects)
      .where(eq(videoProjects.id, made.project.id))
    expect(row).toMatchObject({ languageOf: original.id, language: "Spanish" })

    const timeline = requireCanonicalTimeline(row.timeline)
    // Captions on top, the original lane, then the new voice at the bottom.
    expect(timeline.tracks).toHaveLength(3)
    const [captions, talk, voice] = timeline.tracks
    expect(captions.clips[0]).toMatchObject({
      kind: "text",
      text: "hola amigos",
      startMs: 1000,
      spokenBy: voice.clips[0].id,
    })
    expect(talk.clips[0].volume).toBe(TRANSLATE_ORIGINAL_VOLUME)
    expect(voice.clips[0]).toMatchObject({
      kind: "audio",
      mediaId: "voice-media",
      startMs: 1000,
    })
  })

  it("leaves the original exactly as it was", async () => {
    const original = await myShort()
    const before = await getOwnedProject(user.id, original.id, database)
    await make(original.id, "Spanish")
    const after = await getOwnedProject(user.id, original.id, database)
    expect(after.timeline).toEqual(before.timeline)
    expect(after.version).toBe(before.version)
  })

  it("queues one export per copy, and stopping one leaves the others going", async () => {
    const original = await myShort()
    const spanish = await make(original.id, "Spanish")
    const hindi = await make(original.id, "Hindi")
    expect(spanish.exportProblem).toBeNull()
    expect(spanish.exports).toHaveLength(1)
    expect(spanish.exports?.[0].title).toBe("My Short (Spanish)")

    await cancelRenderJob(user.id, spanish.exports![0].id, database)
    const [stillGoing] = await database
      .select()
      .from(videoRenderJobs)
      .where(eq(videoRenderJobs.id, hindi.exports![0].id))
    expect(stillGoing.status).toBe("queued")
  })

  it("lists each copy's export with its language and its original", async () => {
    const original = await myShort()
    await make(original.id, "Hindi")
    const { exports } = await listOwnedExports({ userId: user.id, database })
    expect(exports[0]).toMatchObject({
      language: "Hindi",
      original_project_id: original.id,
      original_project_name: "My Short",
      project_name: "My Short (Hindi)",
    })
  })

  it("refuses before the voice is paid for when the talking has gone", async () => {
    const original = await myShort()
    await expect(check(original.id, "not-there")).rejects.toThrow(
      TRANSLATE_SOURCE_GONE_MESSAGE
    )
  })

  it("refuses before the voice is paid for when the voice would start after the end", async () => {
    const original = await myShort()
    // The talking ends at 5 seconds.
    await expect(check(original.id, "talk", 5000)).rejects.toThrow(
      TRANSLATE_PAST_THE_END_MESSAGE
    )
  })

  it("refuses before the voice is paid for when the export queue is full", async () => {
    const original = await myShort()
    await expect(check(original.id)).resolves.toBeUndefined()
    // Twenty exports already waiting, one on each of twenty other projects.
    const others = await Promise.all(
      Array.from({ length: 20 }, (_, at) =>
        createOwnedProject(user.id, `Other ${at}`, database)
      )
    )
    const at = new Date()
    await database.insert(videoRenderJobs).values(
      others.map((other) => ({
        id: randomUUID(),
        userId: user.id,
        projectId: other.id,
        status: "queued",
        quality: "high",
        aspect: "9:16",
        frameRate: 30,
        title: "Waiting",
        createdAt: at,
        updatedAt: at,
      }))
    )
    await expect(check(original.id)).rejects.toThrow(QUEUE_FULL_MESSAGE)
  })

  it("puts a copy made from a copy with the first original", async () => {
    const original = await myShort()
    const spanish = await make(original.id, "Spanish")
    const fromSpanish = await make(spanish.project.id, "Hindi")
    const [row] = await database
      .select()
      .from(videoProjects)
      .where(eq(videoProjects.id, fromSpanish.project.id))
    expect(row.languageOf).toBe(original.id)
  })

  it("never makes a copy of somebody else's project", async () => {
    const original = await myShort()
    const stranger = await insertUser(database)
    await expect(
      checkLanguageCopy(
        {
          userId: stranger.id,
          projectId: original.id,
          sourceClipId: "talk",
          startsAtMs: 1000,
        },
        database
      )
    ).rejects.toThrow()
  })
})
