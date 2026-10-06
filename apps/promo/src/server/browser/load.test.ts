import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

import { DockerRequestError } from "./docker"
import { promoBrowserSessions, promoBrowserSettings } from "./schema"

vi.mock("./docker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./docker")>()
  return { ...actual, dockerRequest: vi.fn() }
})

const docker = vi.mocked((await import("./docker")).dockerRequest)
const { createProfile } = await import("./profiles")
const { browserLoad, memoryInUse } = await import("./load")

const MB = 1024 * 1024

/** The line at the top of the Browser profiles dashboard, from Docker's figures. */
describe("how full the machine is", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string

  beforeEach(async () => {
    docker.mockReset()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
  })

  afterEach(async () => {
    await client.close()
  })

  async function openBrowser(containerId: string, port: number, status: "running" | "stopped" = "running") {
    const profileId = await createProfile(userId, { name: containerId }, db)
    await db.insert(promoBrowserSessions).values({
      id: uuid(),
      userId,
      profileId,
      status,
      containerId,
      commandPort: port,
      streamPort: port + 1000,
      streamPasswordEncrypted: "x.y.z",
    })
  }

  it("reads memory the way docker stats prints it, less the cache the kernel can drop", () => {
    expect(memoryInUse({ memory_stats: { usage: 900 * MB, stats: { inactive_file: 100 * MB } } })).toBe(800 * MB)
    expect(memoryInUse({ memory_stats: { usage: 900 * MB, stats: { total_inactive_file: 50 * MB } } })).toBe(850 * MB)
    expect(memoryInUse({})).toBeNull()
  })

  it("counts open browsers against the limit, and one Docker will not report on at its ceiling", async () => {
    await db.update(promoBrowserSettings).set({ maxOpen: 4 })
    await openBrowser("measured", 7900)
    await openBrowser("silent", 7901)
    await openBrowser("closed", 7902, "stopped")
    docker.mockImplementation(async (_connection, _method, path) => {
      if (path.includes("/measured/")) return { memory_stats: { usage: 700 * MB } }
      throw new DockerRequestError("GET", path, 500, "busy")
    })

    expect(await browserLoad(db)).toEqual({ open: 2, maxOpen: 4, memoryBytes: (700 + 1536) * MB })
  })

  it("asks Docker nothing when no browser is open", async () => {
    expect(await browserLoad(db)).toEqual({ open: 0, maxOpen: 3, memoryBytes: 0 })
    expect(docker).not.toHaveBeenCalled()
  })
})
