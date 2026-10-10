import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { customShellMedia, customShellNotifications } from "@/server/schema"
import { now, uuid } from "@/server/auth/security"
import {
  pomodoroGenerations,
  pomodoroGenerationUsage,
} from "@/server/pomodoro/schema"
import {
  claimNextGeneration,
  creditsLeft,
  failGeneration,
  finishGeneration,
  generationMonth,
  listGenerations,
  monthlyLimitFor,
  requestGenerations,
  reserveGenerationCredit,
} from "@/server/pomodoro/generation"

/**
 * The credit ledger, against a real database.
 *
 * This is the part of AI generation that costs money, so it gets the tests
 * rather than the part that draws it. The rule it has to keep: a member is
 * never charged for a file they did not get.
 */

let client: PGlite
let db: CustomShellDb
let userId: string

const LIMITS = { background: 20, soundscape: 20 }

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  const user = await insertUser(db)
  userId = user.id
})

afterEach(async () => {
  await client.close()
})

const ledger = async () => {
  const [row] = await db
    .select()
    .from(pomodoroGenerationUsage)
    .where(eq(pomodoroGenerationUsage.userId, userId))
  return row
}

/** A real library row, because the generation's `media_id` points at one. */
async function insertMedia() {
  const workspace = await insertWorkspace(db)
  const id = uuid()
  const timestamp = now()
  await db.insert(customShellMedia).values({
    id,
    workspaceId: workspace.id,
    userId,
    filename: `${id}.mp3`,
    originalName: "rain on a tin roof.mp3",
    altText: null,
    fileSize: 1234,
    mimeType: "audio/mpeg",
    fileType: "audio",
    storagePath: `${userId}/${id}.mp3`,
    emailProtectedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return id
}

async function queueOne(prompt = "rain on a tin roof") {
  const { rows } = await requestGenerations(
    userId,
    [{ kind: "soundscape", prompt }],
    LIMITS
  )
  return rows[0]
}

describe("monthlyLimitFor", () => {
  it("reads the plan's own numbers for each kind", () => {
    const plan = { monthlyBackgrounds: 5, monthlySoundscapes: 20 }
    expect(monthlyLimitFor(plan, "background")).toBe(5)
    expect(monthlyLimitFor(plan, "soundscape")).toBe(20)
  })
})

describe("generationMonth", () => {
  it("is the first of the month, in UTC", () => {
    expect(generationMonth(new Date("2026-09-25T23:30:00Z"))).toBe("2026-09-01")
    // An hour either side of midnight UTC on the first must not disagree.
    expect(generationMonth(new Date("2026-10-01T00:30:00Z"))).toBe("2026-10-01")
  })
})

describe("reserveGenerationCredit", () => {
  it("takes one credit and says how many are left", async () => {
    const first = await reserveGenerationCredit(userId, "background", 5)
    expect(first.left).toBe(4)
    expect((await ledger()).reserved).toBe(1)
    expect(await creditsLeft(userId, "background", 5)).toBe(4)
  })

  it("refuses once the month's allowance is gone", async () => {
    for (let taken = 0; taken < 2; taken += 1) {
      await reserveGenerationCredit(userId, "background", 2)
    }
    await expect(
      reserveGenerationCredit(userId, "background", 2)
    ).rejects.toThrow("GENERATION_LIMIT_REACHED")
    // The refusal must not have taken a third one on the way out.
    expect((await ledger()).reserved).toBe(2)
  })

  it("refuses an account with no allowance at all, before touching the row", async () => {
    await expect(
      reserveGenerationCredit(userId, "background", 0)
    ).rejects.toThrow("GENERATION_NOT_ALLOWED")
    expect(await ledger()).toBeUndefined()
  })

  it("counts the two kinds separately", async () => {
    await reserveGenerationCredit(userId, "background", 5)
    expect(await creditsLeft(userId, "background", 5)).toBe(4)
    expect(await creditsLeft(userId, "soundscape", 20)).toBe(20)
  })
})

describe("when a generation fails", () => {
  it("puts the first attempt back in the queue and keeps the credit", async () => {
    const job = await queueOne()
    const claimed = await claimNextGeneration()
    expect(claimed?.attempts).toBe(1)

    const { refunded } = await failGeneration(claimed!, "provider had a moment")
    expect(refunded).toBe(false)

    const [row] = await db
      .select()
      .from(pomodoroGenerations)
      .where(eq(pomodoroGenerations.id, job.id))
    expect(row.status).toBe("queued")
    // Still spent, because it is going to be tried again.
    expect(await creditsLeft(userId, "soundscape", 20)).toBe(19)
  })

  it("hands the credit back once the attempts run out", async () => {
    await queueOne()
    expect(await creditsLeft(userId, "soundscape", 20)).toBe(19)

    let claimed = await claimNextGeneration()
    await failGeneration(claimed!, "first try")
    claimed = await claimNextGeneration()
    expect(claimed?.attempts).toBe(2)
    const { refunded } = await failGeneration(claimed!, "second try")

    expect(refunded).toBe(true)
    expect(await creditsLeft(userId, "soundscape", 20)).toBe(20)
    const usage = await ledger()
    // The attempt is still on record: refunded went up, reserved did not go
    // down, so the ledger shows what happened as well as what it cost.
    expect(usage.reserved).toBe(1)
    expect(usage.refunded).toBe(1)
    expect(usage.completed).toBe(0)
  })

  it("hands the credit straight back when trying again cannot help", async () => {
    await queueOne()
    const claimed = await claimNextGeneration()

    const { refunded } = await failGeneration(
      claimed!,
      "no key on this server",
      {
        retry: false,
      }
    )

    expect(refunded).toBe(true)
    expect(await creditsLeft(userId, "soundscape", 20)).toBe(20)
  })

  it("says why, in the member's words, on the row itself", async () => {
    const job = await queueOne()
    const claimed = await claimNextGeneration()
    await failGeneration(claimed!, "That took too long. Try again.", {
      retry: false,
    })

    const [row] = await db
      .select()
      .from(pomodoroGenerations)
      .where(eq(pomodoroGenerations.id, job.id))
    expect(row.status).toBe("failed")
    expect(row.failureReason).toBe("That took too long. Try again.")
  })
})

describe("when a generation works", () => {
  it("counts the credit as used and does not refund it", async () => {
    const job = await queueOne()
    const mediaId = await insertMedia()
    const claimed = await claimNextGeneration()
    await finishGeneration(claimed!, mediaId)

    const [row] = await db
      .select()
      .from(pomodoroGenerations)
      .where(eq(pomodoroGenerations.id, job.id))
    expect(row.status).toBe("ready")
    expect(row.mediaId).toBe(mediaId)

    const usage = await ledger()
    expect(usage.completed).toBe(1)
    expect(usage.refunded).toBe(0)
    expect(await creditsLeft(userId, "soundscape", 20)).toBe(19)
  })
})

describe("when two worker passes race on one request", () => {
  it("counts the credit once, however many passes finish it", async () => {
    await queueOne()
    const mediaId = await insertMedia()
    const claimed = await claimNextGeneration()

    const first = await finishGeneration(claimed!, mediaId)
    // The loser of a stolen claim arrives with the same job in hand.
    const second = await finishGeneration(claimed!, mediaId)

    expect(first.settled).toBe(true)
    expect(second.settled).toBe(false)
    const usage = await ledger()
    expect(usage.completed).toBe(1)
    expect(await creditsLeft(userId, "soundscape", 20)).toBe(19)
  })

  it("refunds the credit once, however many passes fail it", async () => {
    await queueOne()
    const claimed = await claimNextGeneration()

    const first = await failGeneration(claimed!, "no key", { retry: false })
    const second = await failGeneration(claimed!, "no key", { retry: false })

    expect(first.refunded).toBe(true)
    expect(second.refunded).toBe(false)
    const usage = await ledger()
    expect(usage.refunded).toBe(1)
    // Not 21: a double refund would hand out a credit nobody paid for.
    expect(await creditsLeft(userId, "soundscape", 20)).toBe(20)
  })

  it("does not let a failure undo a finish that already landed", async () => {
    await queueOne()
    const mediaId = await insertMedia()
    const claimed = await claimNextGeneration()

    await finishGeneration(claimed!, mediaId)
    const late = await failGeneration(claimed!, "too late")

    expect(late.refunded).toBe(false)
    const usage = await ledger()
    expect(usage.completed).toBe(1)
    expect(usage.refunded).toBe(0)
  })
})

describe("claimNextGeneration", () => {
  it("takes the oldest waiting request, and nothing when there is none", async () => {
    const first = await queueOne("first")
    await queueOne("second")

    expect((await claimNextGeneration())?.id).toBe(first.id)
    expect((await claimNextGeneration())?.prompt).toBe("second")
    // Both are running now, and neither is stale, so there is nothing to take.
    expect(await claimNextGeneration()).toBe(null)
  })
})

describe("a whole look from one prompt (task 06, part 7)", () => {
  const usageOf = async (kind: "background" | "soundscape") => {
    const [row] = await db
      .select()
      .from(pomodoroGenerationUsage)
      .where(eq(pomodoroGenerationUsage.kind, kind))
    return row
  }

  const look = () =>
    requestGenerations(
      userId,
      [
        { kind: "soundscape", prompt: "rain on a café window" },
        { kind: "background", prompt: "rain on a café window" },
      ],
      LIMITS
    )

  it("takes one credit of each kind and ties the two rows together", async () => {
    const { rows, left } = await look()
    expect(rows).toHaveLength(2)
    expect(rows[0].lookId).toBeTruthy()
    expect(rows[0].lookId).toBe(rows[1].lookId)
    expect(left).toEqual({ background: 19, soundscape: 19 })
  })

  it("refuses both, and takes neither, when one kind is used up", async () => {
    await expect(
      requestGenerations(
        userId,
        [
          { kind: "background", prompt: "rain" },
          { kind: "soundscape", prompt: "rain" },
        ],
        { background: 20, soundscape: 0 }
      )
    ).rejects.toThrow("GENERATION_NOT_ALLOWED")
    // The background's credit was taken first, and rolled back with the rest.
    expect(await creditsLeft(userId, "background", 20)).toBe(20)
    expect(await db.select().from(pomodoroGenerations)).toHaveLength(0)
  })

  it("refunds each half on its own", async () => {
    await look()
    const first = await claimNextGeneration()
    await failGeneration(first!, "no key", { retry: false })
    const second = await claimNextGeneration()
    await finishGeneration(second!, await insertMedia())

    const failedKind = first!.kind as "background" | "soundscape"
    const madeKind = second!.kind as "background" | "soundscape"
    expect((await usageOf(failedKind)).refunded).toBe(1)
    expect((await usageOf(madeKind)).completed).toBe(1)
    expect((await usageOf(madeKind)).refunded).toBe(0)
  })

  it("says nothing for the first half, then once that the look is ready", async () => {
    await look()
    const messages = async () =>
      (
        await db
          .select({ message: customShellNotifications.message })
          .from(customShellNotifications)
          .where(eq(customShellNotifications.recipientUserId, userId))
      ).map((row) => row.message)

    const first = await claimNextGeneration()
    await finishGeneration(first!, await insertMedia())
    expect(await messages()).toEqual([])

    const second = await claimNextGeneration()
    await finishGeneration(second!, await insertMedia())
    expect(await messages()).toEqual(["Your AI look is ready."])
  })

  it("announces a made half on its own when the other half gives up", async () => {
    await look()
    const first = await claimNextGeneration()
    await finishGeneration(first!, await insertMedia())
    const second = await claimNextGeneration()
    await failGeneration(second!, "no key", { retry: false })

    const rows = await db
      .select({ message: customShellNotifications.message })
      .from(customShellNotifications)
    const words = rows.map((row) => row.message).sort()
    expect(words).toHaveLength(2)
    expect(words.some((message) => message?.endsWith("couldn't be made."))).toBe(true)
    expect(words.some((message) => message?.endsWith(" is ready."))).toBe(true)
  })
})

describe("listGenerations", () => {
  it("says where a waiting request stands, and the style it asked for", async () => {
    const other = (await insertUser(db)).id
    // Someone else's background is ahead: 2 minutes.
    await requestGenerations(other, [{ kind: "background", prompt: "a forest" }], LIMITS)
    await requestGenerations(
      userId,
      [{ kind: "background", prompt: "a café", style: "anime" }],
      LIMITS
    )

    const [mine] = await listGenerations(userId, "background")
    expect(mine.queuePlace).toBe("1 ahead of you, about 2 minutes")
    expect(mine.styleLabel).toBe("Anime")

    const [theirs] = await listGenerations(other, "background")
    expect(theirs.queuePlace).toBe("Next in line")
  })
})
