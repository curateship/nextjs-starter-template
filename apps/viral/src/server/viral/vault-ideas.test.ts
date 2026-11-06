import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { contentDisposition, downloadKeptFile, downloadName } from "@/server/viral/downloads"
import { createSampleViralProject, createViralProject } from "@/server/viral/projects"
import { writePromoPost } from "@/server/viral/promo-posts"
import { viralSocialPosts, viralVaultItems, viralVideos } from "@/server/viral/schema"
import { loadTextSocials } from "@/server/viral/social-watches"
import { saveVideoApiKey, saveVideoUrl } from "@/server/viral/settings"
import {
  changeVaultItems,
  copyVaultItem,
  createOwnIdea,
  listVault,
  saveEditedScript,
  updateVaultItem,
} from "@/server/viral/vault"
import { OWN_IDEA_SCRIPT_FEATURE, POST_ANALYSIS_FEATURE, savePostToVault, writeOwnIdeaScript } from "@/server/viral/vault-ai"
import { sendToVideo } from "@/server/viral/video-sends"

/**
 * Vault ideas with no video, posts saved to the vault, your own ideas, your
 * edit of a script and Download to computer (more-features task parts 1 to
 * 5), against the database. The writer, Video and the bucket are stubbed;
 * nothing leaves the machine.
 */

const removed = vi.hoisted(() => [] as string[])

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  deleteFromR2: async (path: string) => {
    removed.push(path)
  },
  getPublicMediaUrl: async (path: string) => `https://media.test/${path}`,
  getFromR2: async () => ({
    Body: { transformToWebStream: () => new Blob(["fake mp4 bytes"]).stream() },
    ContentLength: 14,
    ContentType: "video/mp4",
  }),
}))

vi.mock("@/server/auth/encryption", () => ({
  encryptSecret: (value: string) => `enc:${value}`,
  decryptSecret: (value: string) => value.replace(/^enc:/, ""),
}))

/** The writer, answering by each call's label, writing every call down. */
const writer = vi.hoisted(() => ({
  calls: [] as { feature: string; metadata: Record<string, unknown>; prompt: string; label: string }[],
  answers: {} as Record<string, unknown>,
  /** Runs while the AI is "writing", for what happens meanwhile. */
  meanwhile: null as null | (() => Promise<void>),
}))
vi.mock("@/server/viral/writer", () => ({
  askWriter: async (input: {
    feature: string
    metadata: Record<string, unknown>
    prompt: string
    label: string
    schema: { parse: (value: unknown) => unknown }
  }) => {
    writer.calls.push({ feature: input.feature, metadata: input.metadata, prompt: input.prompt, label: input.label })
    await writer.meanwhile?.()
    return input.schema.parse(writer.answers[input.label])
  },
}))

const FOUR_PIECES = {
  "Why it works": { hook: "A question everyone has", parts: [{ role: "hook", summary: "Asks it" }], whySpread: "Everyone cooks chicken" },
  "The script": {
    script: [
      { role: "hook", seconds: 3, words: "Your chicken is dry for one reason." },
      { role: "solution", seconds: 20, words: "Brine it for 30 minutes." },
      { role: "cta", seconds: 2, words: "Follow for more." },
    ],
  },
  "More ideas": { ideas: [1, 2, 3].map((n) => ({ idea: `Idea ${n}`, hook: `Hook ${n}` })) },
  "The title": { title: "Never dry chicken again", caption: "Brine it.", hashtags: ["mealprep"] },
}

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
  removed.length = 0
  writer.calls = []
  writer.answers = { ...FOUR_PIECES }
  writer.meanwhile = null
})

afterEach(async () => {
  await client.close()
})

function project(name = "Meal prep", topic = "a meal-prep course for busy dads") {
  return createViralProject(user.id, { name, description: "", topic, socials: ["reddit"], keywords: [], folderId: null })
}

async function redditPost(projectId: string, change: Partial<typeof viralSocialPosts.$inferInsert> = {}) {
  const id = uuid()
  await database.insert(viralSocialPosts).values({
    id,
    ownerId: user.id,
    projectId,
    network: "reddit",
    postId: "t3_abc",
    url: "https://www.reddit.com/r/mealprep/comments/abc/",
    title: "How do you stop chicken going dry?",
    text: "Every time I meal prep chicken it is dry by Wednesday.",
    authorHandle: "u/cook",
    authorName: "cook",
    authorFollowers: null,
    views: null,
    likes: 4_000,
    replies: 300,
    reposts: null,
    link: "javascript:alert(1)",
    community: "mealprep",
    firstSeenAt: now(),
    updatedAt: now(),
    ...change,
  })
  return id
}

/** A Video that answers each draft, writing every message down. */
function fakeVideo() {
  const messages: Record<string, unknown>[] = []
  const fetchFn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    messages.push(init?.body ? JSON.parse(String(init.body)) : {})
    return Response.json({ videoId: "vid-1", editUrl: "http://video.test/admin/video-editor/p1?video=vid-1", status: "ready" })
  })
  return { fetchFn: fetchFn as unknown as typeof fetch, messages }
}

async function connectVideo() {
  await saveVideoUrl("http://video.test")
  await saveVideoApiKey("vv_secret_key_for_tests", user.id)
}

describe("part 1: an idea with no video", () => {
  it("is listed, dragged on the board, tagged, copied, sent to Video with no file, and deleted", async () => {
    const one = await project("One")
    const two = await project("Two")
    const idea = await createOwnIdea(user.id, { projectId: one.id, title: "  Three lunches   in ten minutes ", notes: "" })
    expect(idea).toMatchObject({ kind: "own", status: "idea", platform: null, sourceUrl: null, title: "Three lunches in ten minutes", hasFile: false })

    // The board's drag and Mass select's tag are both one request through changeVaultItems.
    expect((await changeVaultItems(user.id, [idea.id], { kind: "status", status: "scripted" })).completed).toEqual([idea.id])
    expect((await changeVaultItems(user.id, [idea.id], { kind: "tag", name: "Lunch" })).completed).toEqual([idea.id])
    const [listed] = await listVault(user.id, { projectId: one.id })
    expect(listed).toMatchObject({ id: idea.id, status: "scripted", tags: ["Lunch"] })

    const copied = await copyVaultItem(user.id, idea.id, two.id)
    expect(copied.state).toBe("copied")
    if (copied.state === "copied") expect(copied.item).toMatchObject({ kind: "own", projectId: two.id, tags: ["Lunch"] })

    await connectVideo()
    const video = fakeVideo()
    const sent = await sendToVideo(user.id, { itemId: idea.id, videoProjectId: "p1", mode: null }, video.fetchFn)
    expect(sent.status).toBe("sent")
    expect(video.messages[0]).toMatchObject({ title: "Three lunches in ten minutes", file: null, script: "" })

    const gone = await changeVaultItems(user.id, [idea.id], { kind: "delete" })
    expect(gone.completed).toEqual([idea.id])
    expect(removed).toEqual([])
    expect(await listVault(user.id, { projectId: one.id })).toHaveLength(0)
  })

  it("keeps your own idea's notes as the editor's document and sends their words, never the document", async () => {
    const one = await project()
    const doc = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Film on Sunday" }] }] })
    const idea = await createOwnIdea(user.id, { projectId: one.id, title: "Lunches", notes: doc })
    expect(JSON.parse(idea.notes).type).toBe("doc")
    await connectVideo()
    const video = fakeVideo()
    await sendToVideo(user.id, { itemId: idea.id, videoProjectId: "p1", mode: null }, video.fetchFn)
    expect(video.messages[0].notes).toBe("Film on Sunday")
    // An empty document is kept as nothing.
    expect((await updateVaultItem(user.id, idea.id, { notes: JSON.stringify({ type: "doc", content: [] }) })).notes).toBe("")
  })

  it("refuses your own idea in a sample project, and with no title", async () => {
    const sample = await createSampleViralProject(user.id)
    await expect(createOwnIdea(user.id, { projectId: sample.id, title: "Mine", notes: "" })).rejects.toThrow("sample project")
    const one = await project()
    await expect(createOwnIdea(user.id, { projectId: one.id, title: "   ", notes: "" })).rejects.toThrow("Give the idea a title first.")
  })
})

describe("part 2: posts into the vault", () => {
  it("writes all four pieces on the post meter and keeps the post's words and numbers", async () => {
    const one = await project()
    const postId = await redditPost(one.id)
    const item = await savePostToVault(user.id, postId)

    expect(writer.calls.map((call) => call.feature)).toEqual(Array(4).fill(POST_ANALYSIS_FEATURE))
    expect(writer.calls.every((call) => call.metadata.viralProjectId === one.id)).toBe(true)
    expect(writer.calls.find((call) => call.label === "The script")?.prompt).toContain("busy dads")
    expect(writer.calls.find((call) => call.label === "The script")?.prompt).toContain("The first part must be the hook")

    expect(item).toMatchObject({ kind: "post", platform: "reddit", platformVideoId: "t3_abc", status: "idea", channelName: "cook u/cook" })
    expect(item.title).toBe("How do you stop chicken going dry?")
    expect(item.stats).toMatchObject({ likes: 4_000, comments: 300, views: null })
    expect(item.post).toMatchObject({ community: "mealprep", text: "Every time I meal prep chicken it is dry by Wednesday.", link: "" })
    expect(item.analysis?.whyItWorks.hook).toBe("A question everyone has")
    expect(item.analysis?.script[0].role).toBe("hook")
    expect(item.analysis?.title.hashtags).toEqual(["#mealprep"])

    // The post's panel knows it is in the vault.
    expect((await loadTextSocials(user.id, one.id)).inVault[postId]).toBe(item.id)

    // Saving the same post again updates that idea, keeping its status and notes.
    await updateVaultItem(user.id, item.id, { status: "scripted", notes: "Film it" })
    const again = await savePostToVault(user.id, postId)
    expect(again.id).toBe(item.id)
    expect(again).toMatchObject({ status: "scripted", notes: "Film it" })
    expect(await database.select().from(viralVaultItems)).toHaveLength(1)
  })

  it("refuses a sample's posts and a project with no topic before the AI is asked", async () => {
    const sample = await createSampleViralProject(user.id)
    const samplePost = await redditPost(sample.id, { postId: "sample-r-9" })
    await expect(savePostToVault(user.id, samplePost)).rejects.toThrow("A sample's posts are made up")
    const bare = await project("Bare", "")
    await expect(savePostToVault(user.id, await redditPost(bare.id))).rejects.toThrow("Give the project a topic first")
    // The idea's Open link uses the post's address, so one that isn't a web address is never kept.
    const one = await project()
    await expect(savePostToVault(user.id, await redditPost(one.id, { postId: "r-js", url: "javascript:alert(1)" }))).rejects.toThrow(
      "no web address"
    )
    expect(writer.calls).toHaveLength(0)
  })

  it("refuses a script without a hook, keeping nothing", async () => {
    const one = await project()
    writer.answers["The script"] = { script: [{ role: "solution", seconds: 10, words: "Brine it." }] }
    await expect(savePostToVault(user.id, await redditPost(one.id))).rejects.toThrow("without a hook")
    expect(await database.select().from(viralVaultItems)).toHaveLength(0)
  })

  it("keeps a post's link only when it is http or https", async () => {
    const one = await project()
    const item = await savePostToVault(user.id, await redditPost(one.id, { link: "https://example.com/brine" }))
    expect(item.post?.link).toBe("https://example.com/brine")
  })
})

describe("part 3: your own idea's script", () => {
  it("writes one script for the topic, every part labelled, on its own meter", async () => {
    const one = await project()
    const idea = await createOwnIdea(user.id, { projectId: one.id, title: "Dry chicken", notes: "" })
    const written = await writeOwnIdeaScript(user.id, idea.id)
    expect(writer.calls).toHaveLength(1)
    expect(writer.calls[0]).toMatchObject({ feature: OWN_IDEA_SCRIPT_FEATURE, metadata: { vaultItemId: idea.id, viralProjectId: one.id } })
    expect(writer.calls[0].prompt).toContain("Dry chicken")
    expect(written.analysis?.script.map((part) => part.role)).toEqual(["hook", "solution", "cta"])
    expect(written.analysis?.ideas).toEqual([])
    expect(written.analysisTopic).toBe("a meal-prep course for busy dads")
  })

  it("says the idea is gone when it is deleted while the script is being written", async () => {
    const one = await project()
    const idea = await createOwnIdea(user.id, { projectId: one.id, title: "Dry chicken", notes: "" })
    writer.meanwhile = async () => {
      await database.delete(viralVaultItems)
    }
    await expect(writeOwnIdeaScript(user.id, idea.id)).rejects.toThrow("That idea is no longer in the vault.")
  })

  it("refuses a project with no topic before the AI is asked", async () => {
    const bare = await project("Bare", "")
    const idea = await createOwnIdea(user.id, { projectId: bare.id, title: "Dry chicken", notes: "" })
    await expect(writeOwnIdeaScript(user.id, idea.id)).rejects.toThrow("Give the project a topic first")
    expect(writer.calls).toHaveLength(0)
  })
})

describe("part 4: your edit of the script", () => {
  it("is what Send to Video and Post for Promo send, while the AI's stays behind Show original", async () => {
    const one = await project()
    const item = await savePostToVault(user.id, await redditPost(one.id))
    const edited = await saveEditedScript(user.id, item.id, ["Dads, your chicken is dry.", "Brine it for 30 minutes.", "Follow for more."])
    expect(edited.editedScript?.[0]).toEqual({ role: "hook", seconds: 3, words: "Dads, your chicken is dry." })
    expect(edited.analysis?.script[0].words).toBe("Your chicken is dry for one reason.")

    await connectVideo()
    const video = fakeVideo()
    await sendToVideo(user.id, { itemId: item.id, videoProjectId: "p1", mode: null }, video.fetchFn)
    expect(video.messages[0].script).toContain("Hook (3s)\nDads, your chicken is dry.")
    expect(video.messages[0].script).not.toContain("for one reason")

    writer.answers["The X post"] = { title: "", pieces: ["Dry chicken? Brine it."] }
    await writePromoPost(user.id, item.id, "x")
    expect(writer.calls.at(-1)?.prompt).toContain("Dads, your chicken is dry.")

    // Going back to the AI's version throws the edit away.
    expect((await saveEditedScript(user.id, item.id, null)).editedScript).toBeNull()
  })

  it("keeps no edit when the words match the AI's, and refuses a script that changed shape", async () => {
    const one = await project()
    const item = await savePostToVault(user.id, await redditPost(one.id))
    const same = item.analysis!.script.map((part) => part.words)
    expect((await saveEditedScript(user.id, item.id, same)).editedScript).toBeNull()
    await expect(saveEditedScript(user.id, item.id, ["Only one"])).rejects.toThrow("The script changed while you were editing")
    const idea = await createOwnIdea(user.id, { projectId: one.id, title: "No script", notes: "" })
    await expect(saveEditedScript(user.id, idea.id, ["Hi"])).rejects.toThrow("no script to edit")
  })

  it("is copied with the idea to another project", async () => {
    const one = await project("One")
    const two = await project("Two")
    const item = await savePostToVault(user.id, await redditPost(one.id))
    await saveEditedScript(user.id, item.id, ["Mine", "Brine it for 30 minutes.", "Follow for more."])
    const copied = await copyVaultItem(user.id, item.id, two.id)
    expect(copied.state === "copied" && copied.item.editedScript?.[0].words).toBe("Mine")
  })
})

describe("part 5: Download to computer", () => {
  async function keptVideo(ownerId: string) {
    const at = now()
    const mediaId = uuid()
    await database.insert(customShellMedia).values({
      id: mediaId,
      workspaceId,
      userId: ownerId,
      filename: `${mediaId}.mp4`,
      originalName: "x.mp4",
      fileSize: 14,
      mimeType: "video/mp4",
      fileType: "video",
      storagePath: `${ownerId}/${mediaId}.mp4`,
      createdAt: at,
      updatedAt: at,
    })
    const id = uuid()
    await database.insert(viralVideos).values({
      id,
      ownerId,
      platform: "youtube",
      platformVideoId: "abc123def45",
      sourceUrl: "https://www.youtube.com/shorts/abc123def45",
      status: "downloaded",
      wantsAnalysis: false,
      mediaId,
      title: 'Meal prep: "10 minutes" / day',
      createdAt: at,
      updatedAt: at,
    })
    return id
  }

  it("sends the kept copy as a download named after the title", async () => {
    const id = await keptVideo(user.id)
    const response = await downloadKeptFile(user.id, "video", id)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("video/mp4")
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="Meal prep 10 minutes day.mp4"; filename*=UTF-8''Meal%20prep%2010%20minutes%20day.mp4`
    )
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(await response.text()).toBe("fake mp4 bytes")
  })

  it("answers No such file for someone else's id, an idea with no copy, and a made-up id", async () => {
    const other = await insertUser(database)
    const theirs = await keptVideo(other.id)
    const response = await downloadKeptFile(user.id, "video", theirs)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ detail: "No such file." })

    const one = await project()
    const idea = await createOwnIdea(user.id, { projectId: one.id, title: "No file", notes: "" })
    expect((await downloadKeptFile(user.id, "idea", idea.id)).status).toBe(404)
    expect((await downloadKeptFile(user.id, "idea", "../../etc")).status).toBe(404)
  })

  it("makes a name a header and a file system can hold", () => {
    expect(downloadName("a\r\nb\\c", "video/webm", "x/y.webm")).toBe("a b c.webm")
    expect(downloadName("", "application/octet-stream", "x/y.mov")).toBe("video.mov")
    expect(contentDisposition("Café (1).mp4")).toBe(`attachment; filename="Cafe (1).mp4"; filename*=UTF-8''Caf%C3%A9%20%281%29.mp4`)
  })
})
