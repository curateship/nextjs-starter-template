import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * How often the app reads X on its own.
 *
 * Opening the same creator five times in a minute must not be five requests to
 * somebody else's server. Pressing Sync profile always reads, because that is
 * a person asking.
 *
 * The reader is replaced with a counter here rather than reaching the network,
 * so what is proved is how often it is called, which is the whole point.
 */
const reads = vi.hoisted(() => ({ count: 0 }))

vi.mock("@/server/trade/social-readers", async () => {
  const real = await vi.importActual<
    typeof import("@/server/trade/social-readers")
  >("@/server/trade/social-readers")
  return {
    ...real,
    readSocialPosts: () => {
      reads.count += 1
      return Promise.resolve({ ok: false } as const)
    },
  }
})

const { PGlite } = await import("@electric-sql/pglite")
const { createTestDatabase, insertUser } = await import("@/server/test-support")
const { addSocialCreator } = await import("@/server/trade/social-creators")
const { refreshSocialCreator } = await import("@/server/trade/social-posts")

let client: InstanceType<typeof PGlite>

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  reads.count = 0
  vi.useFakeTimers()
})

afterEach(async () => {
  vi.useRealTimers()
  await client.close()
})

async function trackedCreator() {
  const database = (await import("@/server/db")).db
  const user = await insertUser(database)
  await addSocialCreator(user.id, "cryptosam")
  return user.id
}

describe("how often the app reads X on its own", () => {
  it("reads once, then leaves the creator alone for five minutes", async () => {
    const userId = await trackedCreator()

    await refreshSocialCreator(userId, "cryptosam", false)
    await refreshSocialCreator(userId, "cryptosam", false)
    await refreshSocialCreator(userId, "cryptosam", false)

    expect(reads.count).toBe(1)
  })

  it("reads again once the five minutes are up", async () => {
    const userId = await trackedCreator()
    await refreshSocialCreator(userId, "cryptosam", false)

    vi.advanceTimersByTime(5 * 60_000 + 1)
    await refreshSocialCreator(userId, "cryptosam", false)

    expect(reads.count).toBe(2)
  })

  it("never holds back the button, however often it is pressed", async () => {
    const userId = await trackedCreator()

    await refreshSocialCreator(userId, "cryptosam", true)
    await refreshSocialCreator(userId, "cryptosam", true)
    await refreshSocialCreator(userId, "cryptosam", true)

    expect(reads.count).toBe(3)
  })
})
