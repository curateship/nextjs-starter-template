import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { customShellMedia } from "@/server/schema"
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
  monthlyLimitFor,
  queueGeneration,
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
  const { month } = await reserveGenerationCredit(userId, "soundscape", 20)
  return queueGeneration({ userId, kind: "soundscape", prompt, month })
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
    await failGeneration(claimed!, "The provider took too long. Try again.", {
      retry: false,
    })

    const [row] = await db
      .select()
      .from(pomodoroGenerations)
      .where(eq(pomodoroGenerations.id, job.id))
    expect(row.status).toBe("failed")
    expect(row.failureReason).toBe("The provider took too long. Try again.")
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
