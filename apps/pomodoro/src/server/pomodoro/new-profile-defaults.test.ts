import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { handleCandidatesFor } from "@/lib/pomodoro/public-profile"
import { type CustomShellDb } from "@/server/db"
import { loadOrCreateProfile } from "@/server/pomodoro/profile"
import { pomodoroProfiles } from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * What a brand-new profile row starts with. Tyler, 17 Oct 2026: public, every
 * section on, on the leaderboard, and the first name as the handle.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

describe("loadOrCreateProfile", () => {
  it("starts a new row public, on the leaderboard, with the first name as handle and display name", async () => {
    const user = await insertUser(db, { name: "Tyler Pham" })
    const profile = await loadOrCreateProfile(user.id, "UTC", db)
    expect(profile).toMatchObject({
      handle: "tyler",
      publicDisplayName: "Tyler",
      profilePublic: true,
      leaderboardOptIn: true,
      listed: true,
      showFigures: true,
      showBadges: true,
      showHeatmap: true,
      showProjects: true,
      showFocusingNow: true,
      showRoom: true,
      showSharedMedia: true,
    })
  })

  it("numbers the second person with the same first name", async () => {
    const first = await insertUser(db, { name: "Sam One" })
    const second = await insertUser(db, { name: "sam two" })
    await loadOrCreateProfile(first.id, "UTC", db)
    expect((await loadOrCreateProfile(second.id, "UTC", db)).handle).toBe("sam2")
  })

  it("leaves a row that already exists exactly as it was", async () => {
    const user = await insertUser(db, { name: "Kept Private" })
    await db.insert(pomodoroProfiles).values({ userId: user.id })
    const profile = await loadOrCreateProfile(user.id, "UTC", db)
    expect(profile.handle).toBeNull()
    expect(profile.profilePublic).toBe(false)
    expect(profile.leaderboardOptIn).toBe(false)
  })
})

describe("handleCandidatesFor", () => {
  it("drops accents, skips short and reserved names, and falls back to member", () => {
    expect(handleCandidatesFor("José Ríos").slice(0, 2)).toEqual(["jose", "jose2"])
    expect(handleCandidatesFor("Al")[0]).toBe("al2")
    expect(handleCandidatesFor("Admin")[0]).toBe("admin2")
    expect(handleCandidatesFor("李")[0]).toBe("member")
  })
})
