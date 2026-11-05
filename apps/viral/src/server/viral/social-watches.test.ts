import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  createSampleViralProject,
  createViralProject,
  duplicateViralProject,
  removeViralSocial,
  setViralSocialPaused,
} from "@/server/viral/projects"
import { applyPromoReadAnswer } from "@/server/viral/promo-reads"
import { viralPromoReads, viralSocialWatches } from "@/server/viral/schema"
import { savePromoApiKey, savePromoUrl } from "@/server/viral/settings"
import {
  addSocialWatch,
  loadTextSocials,
  readSocialWatchNow,
  removeSocialWatch,
  socialWatchTick,
  watchIsDue,
} from "@/server/viral/social-watches"

/**
 * X, Reddit and LinkedIn on a Viral project (features task parts 12 to 14),
 * with Promo stubbed: what a project keeps reading, how each read stands,
 * taking one off, and the watch that reads them again on its own.
 */

vi.mock("@/server/auth/encryption", () => ({
  encryptSecret: (value: string) => `enc:${value}`,
  decryptSecret: (value: string) => value.replace(/^enc:/, ""),
}))

const PROMO = "http://promo.test"
const KEY = "pvr_test_key_for_viral_links_000000000000000000"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let projectId: string
let calls: { path: string; body: Record<string, unknown> }[]

/** Promo, answering every read with "waiting" and recording what was asked. */
function stubPromo() {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
      calls.push({ path: url.slice(PROMO.length), body })
      return Response.json({ readId: String(body.readId ?? "read"), status: "waiting", posts: [], error: "" })
    })
  )
}

async function connectPromo() {
  await savePromoUrl(PROMO)
  await savePromoApiKey(KEY, user.id)
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  projectId = (
    await createViralProject(user.id, { name: "Meal prep", description: "", keywords: [], folderId: null, socials: ["youtube", "x", "reddit"] })
  ).id
  stubPromo()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  delete process.env.VIRAL_WATCH_ENABLED
  await client.close()
})

const xPost = (postId: string) => ({
  postId,
  url: `https://x.com/dad/status/${postId}`,
  text: "Meal prep thread",
  authorHandle: "dad",
  views: 120_000,
  likes: 900,
  replies: 40,
  reposts: 12,
})

describe("adding what a project reads", () => {
  it("keeps the watch and asks Promo to read it at once", async () => {
    await connectPromo()
    const { watch, readError } = await addSocialWatch(user.id, { projectId, network: "x", kind: "account", value: "@dadcooks" })
    expect(readError).toBeNull()
    expect(watch).toMatchObject({ network: "x", kind: "account", value: "dadcooks", status: "waiting" })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ path: "/api/connect/viral/reads", body: { network: "x", kind: "account", value: "dadcooks" } })
  })

  it("keeps the watch without reading it while Promo isn't connected", async () => {
    const { watch } = await addSocialWatch(user.id, { projectId, network: "reddit", kind: "subreddit", value: "r/MealPrepSunday" })
    expect(watch).toMatchObject({ value: "MealPrepSunday", status: "never" })
    expect(calls).toHaveLength(0)
    const screen = await loadTextSocials(user.id, projectId)
    expect(screen.connected).toBe(false)
    expect(screen.watches).toHaveLength(1)
  })

  it("refuses what the social can't read, a social the project lacks, and one already there", async () => {
    await expect(addSocialWatch(user.id, { projectId, network: "reddit", kind: "account", value: "dad" })).rejects.toThrow(
      "Reddit can't read accounts."
    )
    await expect(addSocialWatch(user.id, { projectId, network: "linkedin", kind: "person", value: "sam" })).rejects.toThrow(
      "Add LinkedIn to this project first."
    )
    await addSocialWatch(user.id, { projectId, network: "reddit", kind: "subreddit", value: "Fitness" })
    await expect(addSocialWatch(user.id, { projectId, network: "reddit", kind: "subreddit", value: "r/fitness" })).rejects.toThrow(
      "r/fitness is already on Reddit here."
    )
  })

  it("refuses on the sample, which never reads anything", async () => {
    const sample = await createSampleViralProject(user.id)
    await expect(addSocialWatch(user.id, { projectId: sample.id, network: "x", kind: "search", value: "desk" })).rejects.toThrow(
      "The sample project never reads anything."
    )
  })

  it("refuses another person's project", async () => {
    const other = await insertUser(database)
    await expect(addSocialWatch(other.id, { projectId, network: "x", kind: "search", value: "meal prep" })).rejects.toThrow()
  })
})

describe("how a watch stands", () => {
  it("shows the newest read's posts and count once Promo answers", async () => {
    await connectPromo()
    const { watch } = await addSocialWatch(user.id, { projectId, network: "x", kind: "search", value: "meal prep" })
    await applyPromoReadAnswer(user.id, { readId: watch.readId!, status: "done", posts: [xPost("1"), xPost("2")].map(fill), error: "" })
    const screen = await loadTextSocials(user.id, projectId)
    expect(screen.watches[0]).toMatchObject({ status: "done", found: 2 })
    expect(screen.posts.map((post) => post.postId).sort()).toEqual(["1", "2"])
  })

  it("refuses to read again while the last read still waits", async () => {
    await connectPromo()
    const { watch } = await addSocialWatch(user.id, { projectId, network: "x", kind: "search", value: "meal prep" })
    await expect(readSocialWatchNow(user.id, watch.id)).rejects.toThrow("Promo is still reading it.")
  })

  it("is due by kind: searches daily, accounts every 6 hours, a lost read after 2 hours", () => {
    const at = new Date("2099-01-02T12:00:00Z")
    const hoursAgo = (hours: number) => new Date(at.getTime() - hours * 60 * 60 * 1000)
    expect(watchIsDue("search", undefined, at)).toBe(true)
    expect(watchIsDue("search", { status: "done", createdAt: hoursAgo(23) }, at)).toBe(false)
    expect(watchIsDue("search", { status: "done", createdAt: hoursAgo(25) }, at)).toBe(true)
    expect(watchIsDue("account", { status: "done", createdAt: hoursAgo(7) }, at)).toBe(true)
    expect(watchIsDue("account", { status: "waiting", createdAt: hoursAgo(1) }, at)).toBe(false)
    expect(watchIsDue("account", { status: "waiting", createdAt: hoursAgo(3) }, at)).toBe(true)
  })
})

describe("taking one off", () => {
  it("takes its posts with it", async () => {
    await connectPromo()
    const { watch } = await addSocialWatch(user.id, { projectId, network: "x", kind: "search", value: "meal prep" })
    await applyPromoReadAnswer(user.id, { readId: watch.readId!, status: "done", posts: [fill(xPost("1"))], error: "" })
    await removeSocialWatch(user.id, watch.id)
    const screen = await loadTextSocials(user.id, projectId)
    expect(screen.watches).toHaveLength(0)
    expect(screen.posts).toHaveLength(0)
  })

  it("keeps the social on while it still reads something, and says how many", async () => {
    await addSocialWatch(user.id, { projectId, network: "x", kind: "search", value: "meal prep" })
    await expect(removeViralSocial(user.id, projectId, "x")).rejects.toThrow("X still has 1 thing it reads in this project.")
  })

  it("is copied with a duplicated project", async () => {
    await addSocialWatch(user.id, { projectId, network: "x", kind: "search", value: "meal prep" })
    const copy = await duplicateViralProject(user.id, projectId)
    const rows = await database.select().from(viralSocialWatches).where(eq(viralSocialWatches.projectId, copy.id))
    expect(rows.map((row) => row.value)).toEqual(["meal prep"])
  })
})

describe("the watch", () => {
  it("does nothing unless VIRAL_WATCH_ENABLED=1", async () => {
    await connectPromo()
    await database.insert(viralSocialWatches).values(watchRow("search", "meal prep"))
    expect(await socialWatchTick()).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it("reads what is due and skips a paused social", async () => {
    process.env.VIRAL_WATCH_ENABLED = "1"
    await connectPromo()
    await database.insert(viralSocialWatches).values([watchRow("search", "meal prep"), { ...watchRow("subreddit", "Fitness"), network: "reddit" }])
    await setViralSocialPaused(user.id, projectId, "reddit", true)
    expect(await socialWatchTick()).toBe(1)
    expect(calls.map((call) => call.body.value)).toEqual(["meal prep"])
    // Read a moment ago, so not due again.
    expect(await socialWatchTick()).toBe(0)
    const reads = await database.select().from(viralPromoReads)
    expect(reads).toHaveLength(1)
  })

  it("does nothing while Promo isn't connected", async () => {
    process.env.VIRAL_WATCH_ENABLED = "1"
    await database.insert(viralSocialWatches).values(watchRow("search", "meal prep"))
    expect(await socialWatchTick()).toBe(0)
  })
})

function watchRow(kind: "search" | "subreddit", value: string) {
  return { id: crypto.randomUUID(), ownerId: user.id, projectId, network: "x" as const, kind, value, createdAt: new Date() }
}

/** A post with every field Promo's answer carries. */
function fill(post: ReturnType<typeof xPost>) {
  return {
    title: "",
    authorName: "",
    authorFollowers: null,
    postedSeconds: null,
    link: "",
    community: "",
    topReplies: [],
    ...post,
  }
}
