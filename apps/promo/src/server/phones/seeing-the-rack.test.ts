import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { phoneLane } from "@/lib/phones/options"
import { setDbForTests } from "@/server/db"
import { addAccount } from "@/server/social/accounts"
import { listLaneJobs } from "@/server/social/job-list"
import { queueJob } from "@/server/social/jobs"
import { createProject } from "@/server/social/projects"
import { promoAccounts } from "@/server/social/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

import { phoneProjects } from "./phone-projects"
import { holdPhones } from "./phones"
import { checkIn, createPairingCode, pairRack, type VerifiedRack } from "./rack"
import {
  askForLog,
  forgetRackLogsForTests,
  keepLog,
  LOG_MAX_LINES,
  readLog,
  takeLogRequest,
} from "./rack-log"
import { RACK_VERSION } from "./release"
import { promoPhones } from "./schema"
import { exchangeScreens, forgetScreensForTests, wallFrame, wantWall, watchScreen } from "./screens"

/**
 * Phone farm file 09, Promo's side: the wall's lane on the screen exchange
 * (part 57), a phone's own job list (part 58), the projects behind the
 * Project filter (part 59) and the rack's log inside Promo (part 61).
 */
describe("seeing the rack", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let rack: VerifiedRack
  let phones: Record<string, string>

  beforeEach(async () => {
    vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "a key for these tests only")
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    setDbForTests(db)
    userId = (await insertUser(db, { role: "admin" })).id
    const { code } = await createPairingCode(userId, db)
    const paired = await pairRack({ code, name: "Mac", platform: "", version: RACK_VERSION }, db)
    rack = { id: paired.rackId, userId, key: paired.key }
    await checkIn(
      rack,
      {
        version: RACK_VERSION,
        platform: "",
        phones: ["A1", "B2"].map((serial) => ({ serial, state: "device", usb: "", model: `Phone ${serial}`, android: "16", kind: "android" as const })),
        rolledBack: null,
      },
      db
    )
    phones = Object.fromEntries((await db.select().from(promoPhones)).map((phone) => [phone.serial, phone.id]))
  })

  afterEach(async () => {
    forgetScreensForTests()
    forgetRackLogsForTests()
    vi.unstubAllEnvs()
    await client.close()
  })

  const nothing = { frames: [], texts: [] }

  describe("the wall", () => {
    it("asks the rack for wall pictures of the connected phones only, while the wall is open", async () => {
      expect((await exchangeScreens(rack, nothing, db)).wall).toEqual([])
      await holdPhones(userId, [phones.B2], true, db)
      wantWall(userId)
      expect((await exchangeScreens(rack, nothing, db)).wall).toEqual(["A1"])
      // Ten seconds without an ask and the wall counts as closed.
      expect((await exchangeScreens(rack, nothing, db, new Date(Date.now() + 11_000))).wall).toEqual([])
    })

    it("keeps a wall picture apart from the window's, and lets it go stale after 30 seconds", async () => {
      wantWall(userId)
      await exchangeScreens(
        rack,
        { frames: [{ serial: "A1", jpeg: "/9j/WALL", width: 270, height: 600, lane: "wall" }], texts: [] },
        db
      )
      expect(wallFrame(phones.A1)).toMatchObject({ jpeg: "/9j/WALL", width: 270, seq: 1 })
      expect(watchScreen(phones.A1).frame).toBeNull()

      await exchangeScreens(rack, { frames: [{ serial: "A1", jpeg: "/9j/WINDOW", width: 540, height: 1200 }], texts: [] }, db)
      expect(watchScreen(phones.A1).frame).toMatchObject({ jpeg: "/9j/WINDOW" })
      expect(wallFrame(phones.A1)).toMatchObject({ jpeg: "/9j/WALL" })
      expect(wallFrame(phones.A1, Date.now() + 31_000)).toBeNull()
    })

    it("still answers the window with what it always did", async () => {
      watchScreen(phones.A1)
      expect(await exchangeScreens(rack, nothing, db)).toEqual({ wanted: ["A1"], inputs: {}, wall: [], control: [] })
    })
  })

  describe("a phone's jobs", () => {
    it("lists the jobs in the phone's lane, newest first, naming the account, the phone and the project", async () => {
      const projectId = await createProject(userId, "Running shoes", db)
      const accountId = await addAccount(userId, { profileId: null, phoneId: phones.A1, voiceId: null }, db)
      await db.update(promoAccounts).set({ projectId, handle: "quiet_builder" }).where(eq(promoAccounts.id, accountId))
      const first = await queueJob(userId, "health", { accountId }, db)
      await new Promise((resolve) => setTimeout(resolve, 5))
      const second = await queueJob(userId, "health", { accountId }, db)

      const list = await listLaneJobs(userId, phoneLane(phones.A1), db)
      expect(list.jobs.map((job) => job.id)).toEqual([second, first])
      expect(list.jobs[0]).toMatchObject({ where: "u/quiet_builder · Phone A1", project: "Running shoes", status: "queued" })
      expect((await listLaneJobs(userId, phoneLane(phones.B2), db)).jobs).toEqual([])

      expect(await phoneProjects(userId, db)).toEqual([{ id: projectId, name: "Running shoes", phoneIds: [phones.A1] }])
    })
  })

  describe("the rack's log", () => {
    it("tells the rack once per ask, keeps the lines it sends, and shows them to the rack's own person only", async () => {
      expect(takeLogRequest(rack.id)).toBe(false)
      askForLog(rack.id)
      expect(takeLogRequest(rack.id)).toBe(true)
      expect(takeLogRequest(rack.id)).toBe(false)

      expect(await readLog(userId, rack.id, db)).toBeNull()
      keepLog(rack.id, ["12:00 started", "12:01 reddit/comment on A1 failed: Could not find the reply box"])
      expect(await readLog(userId, rack.id, db)).toMatchObject({
        lines: ["12:00 started", "12:01 reddit/comment on A1 failed: Could not find the reply box"],
      })

      const stranger = (await insertUser(db, { role: "admin" })).id
      await expect(readLog(stranger, rack.id, db)).rejects.toThrow("That rack does not exist.")
    })

    it("forgets an ask the rack did not answer within a minute, and keeps at most 300 lines", () => {
      const now = Date.now()
      askForLog(rack.id, now)
      expect(takeLogRequest(rack.id, now + 61_000)).toBe(false)

      keepLog(rack.id, Array.from({ length: 320 }, (_, index) => `line ${index + 1}`))
      void expect(readLog(userId, rack.id, db)).resolves.toMatchObject({ lines: expect.arrayContaining(["line 320"]) })
      void expect(readLog(userId, rack.id, db)).resolves.toMatchObject({
        lines: expect.not.arrayContaining(["line 20"]),
      })
      return readLog(userId, rack.id, db).then((log) => expect(log?.lines).toHaveLength(LOG_MAX_LINES))
    })
  })
})
