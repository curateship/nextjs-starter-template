import { beforeEach, describe, expect, it, vi } from "vitest"

import { Route } from "@/routes/api/v1/viral/download/$source/$id"

/**
 * The Download to computer route's own doors (more-features task part 5):
 * signed in, an admin, and a source it knows. Whose file it is, and the file
 * itself, are `downloads.ts`'s, tested in `vault-ideas.test.ts`.
 */

const session = vi.hoisted(() => ({ user: null as { id: string; role: string } | null }))
const asked = vi.hoisted(() => [] as unknown[][])

vi.mock("@/server/auth/security", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/security")>()),
  findCurrentUser: async () => session.user,
}))

vi.mock("@/server/viral/downloads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/viral/downloads")>()),
  downloadKeptFile: async (...args: unknown[]) => {
    asked.push(args)
    return new Response("file")
  },
}))

type Handler = (context: { params: { source: string; id: string } }) => Promise<Response>

function get(source: string, id = "abc") {
  const handlers = (Route.options as unknown as { server: { handlers: { GET: Handler } } }).server.handlers
  return handlers.GET({ params: { source, id } })
}

beforeEach(() => {
  session.user = null
  asked.length = 0
})

describe("the download route", () => {
  it("answers 401 with nobody signed in, and 403 for a member who isn't an admin", async () => {
    expect((await get("video")).status).toBe(401)
    session.user = { id: "u1", role: "member" }
    expect((await get("video")).status).toBe(403)
    expect(asked).toHaveLength(0)
  })

  it("answers No such file for a source it doesn't know, and asks for the signed-in admin's own file", async () => {
    session.user = { id: "u1", role: "admin" }
    const unknown = await get("media")
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toEqual({ detail: "No such file." })
    expect(await (await get("idea", "item-1")).text()).toBe("file")
    expect(asked).toEqual([["u1", "idea", "item-1"]])
  })
})
