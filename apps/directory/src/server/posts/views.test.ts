import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import { createPost, listPosts, updatePost } from "@/server/posts/posts"
import {
  createTestDatabase,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"
import { recordVisit } from "@/server/traffic"

/**
 * Post view counts on the Posts screen: the traffic the site already keeps,
 * matched on the post page's address as it is now, counted inside one site.
 */

let client: PGlite
let database: TestDatabase
let alpha: string
let beta: string

const DAY_MS = 24 * 60 * 60 * 1000
const today = new Date()
const longAgo = new Date(today.getTime() - 90 * DAY_MS)

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  alpha = (await insertWorkspace(database, { name: "Alpha" })).id
  beta = (await insertWorkspace(database, { name: "Beta" })).id
})

afterEach(async () => {
  await client.close()
})

async function view(workspaceId: string, path: string, at: Date = today) {
  await recordVisit(
    {
      workspaceId,
      path,
      referrerDomain: "direct",
      device: "computer",
      audience: "visitor",
      visitorHash: uuid(),
    },
    database,
    at
  )
}

function make(workspaceId: string, title: string, slug: string) {
  return createPost(workspaceId, { title, slug }, database)
}

async function viewsOn(
  workspaceId: string,
  options: Parameters<typeof listPosts>[1] = {}
) {
  const { posts } = await listPosts(workspaceId, options, database)
  return Object.fromEntries(posts.map((post) => [post.slug, post.views]))
}

describe("the Views column", () => {
  it("adds one for each time the post's page is opened", async () => {
    await make(alpha, "Patios", "patios")
    expect(await viewsOn(alpha)).toEqual({ patios: 0 })

    await view(alpha, "/posts/patios")
    expect(await viewsOn(alpha)).toEqual({ patios: 1 })

    await view(alpha, "/posts/patios")
    expect(await viewsOn(alpha)).toEqual({ patios: 2 })
  })

  it("counts only the chosen range, and all time counts everything", async () => {
    await make(alpha, "Patios", "patios")
    await view(alpha, "/posts/patios")
    await view(alpha, "/posts/patios", longAgo)

    expect(await viewsOn(alpha, { viewDays: 30 })).toEqual({ patios: 1 })
    expect(await viewsOn(alpha, { viewDays: 365 })).toEqual({ patios: 2 })
    expect(await viewsOn(alpha, { viewDays: "all" })).toEqual({ patios: 2 })
  })

  it("leaves out the Posts page itself and other kinds of page", async () => {
    await make(alpha, "Patios", "patios")
    await view(alpha, "/posts")
    await view(alpha, "/directory/patios")
    await view(alpha, "/events/patios")

    expect(await viewsOn(alpha)).toEqual({ patios: 0 })
  })

  it("keeps the same address's views inside its own site", async () => {
    await make(alpha, "Patios", "patios")
    await make(beta, "Patios", "patios")
    await view(beta, "/posts/patios")

    expect(await viewsOn(alpha)).toEqual({ patios: 0 })
    expect(await viewsOn(beta)).toEqual({ patios: 1 })
  })

  it("follows the current address, so views before a rename stay behind", async () => {
    const post = await make(alpha, "Patios", "patios")
    await view(alpha, "/posts/patios")
    await updatePost(alpha, post.id, { slug: "best-patios" }, database)
    await view(alpha, "/posts/best-patios")

    expect(await viewsOn(alpha)).toEqual({ "best-patios": 1 })
  })

  it("sorts the whole list by views, not only the page on screen", async () => {
    await make(alpha, "Quiet", "quiet")
    await make(alpha, "Busy", "busy")
    await make(alpha, "Middling", "middling")
    for (let i = 0; i < 3; i++) await view(alpha, "/posts/busy")
    await view(alpha, "/posts/middling")

    const most = await listPosts(
      alpha,
      { sort: "views", direction: "desc", limit: 1 },
      database
    )
    expect(most.posts.map((post) => [post.slug, post.views])).toEqual([
      ["busy", 3],
    ])
    expect(most.total).toBe(3)

    const least = await listPosts(
      alpha,
      { sort: "views", direction: "asc" },
      database
    )
    expect(least.posts.map((post) => post.slug)).toEqual([
      "quiet",
      "middling",
      "busy",
    ])
  })
})
