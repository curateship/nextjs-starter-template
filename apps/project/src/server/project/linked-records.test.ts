import { createHmac } from "node:crypto"

import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import type { CustomShellDb } from "@/server/db"
import { inTeam } from "@/server/project/access"
import {
  NOTE_SECONDS,
  openLinkedRecord,
  readLinkedAddress,
  setTaskLink,
  type HandoffNote,
} from "@/server/project/linked-records"
import { addProjectMember } from "@/server/project/projects"
import { createTask, loadTaskDetail } from "@/server/project/tasks"
import type { TeamSummary } from "@/server/project/teams"
import { projectFor, startTeam } from "@/server/project/test-people"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

const VIDEO_KEY = "video-key-for-tests"
const ENV = {
  CONNECTED_VIDEO_URL: "https://video.example.test",
  CONNECTED_VIDEO_KEY: VIDEO_KEY,
  CONNECTED_PROMO_URL: "https://promo.example.test/",
  CONNECTED_PROMO_KEY: "promo-key-for-tests",
} as NodeJS.ProcessEnv
const VIDEO_ADDRESS = "https://video.example.test/admin/video-editor/3f2a9c1e-0000-4000-8000-000000000001"

let client: PGlite
let database: CustomShellDb
let sam: CustomShellUser
let ben: CustomShellUser
let admin: CustomShellUser
let team: TeamSummary
let taskId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  sam = await insertUser(database, { name: "Sam", email: "sam@example.test" })
  ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  ;({ admin, team } = await startTeam(database, [sam, ben]))
  const project = await projectFor(admin, sam.id, { name: "Launch", color: "blue", description: "" }, database)
  await addProjectMember(admin.id, project.id, ben.id, database)
  const task = await createTask(
    { id: admin.id, name: admin.name },
    { projectId: project.id, title: "Cut the launch video", notes: "", assigneeUserId: sam.id, dueDate: null, steps: [] },
    database
  )
  taskId = task.id
})

afterEach(async () => {
  await client.close()
})

const asAdmin = <T>(run: () => Promise<T>) => inTeam(team.id, run)

function readNote(url: string): HandoffNote {
  const note = new URL(url).searchParams.get("note") ?? ""
  const [body, stamp] = note.split(".")
  expect(createHmac("sha256", VIDEO_KEY).update(body).digest("base64url")).toBe(stamp)
  return JSON.parse(Buffer.from(body, "base64url").toString()) as HandoffNote
}

describe("reading a pasted address", () => {
  it("knows a Video editor address and a Promo project address", () => {
    expect(readLinkedAddress(`${VIDEO_ADDRESS}?tab=media`, ENV)).toEqual({
      app: "video",
      recordId: "3f2a9c1e-0000-4000-8000-000000000001",
    })
    expect(readLinkedAddress("https://promo.example.test/admin/projects/p-1", ENV)).toEqual({
      app: "promo",
      recordId: "p-1",
    })
  })

  it("refuses another site, another page of the app, and an app that isn't connected", () => {
    for (const address of [
      "https://evil.example.test/admin/video-editor/abc",
      "https://video.example.test/admin/projects/abc",
      "https://video.example.test/admin/video-editor/abc/extra",
      "http://video.example.test/admin/video-editor/abc",
      "not an address",
    ]) {
      expect(() => readLinkedAddress(address, ENV), address).toThrow(PROJECT_ERRORS.linkedAddressUnknown)
    }
    expect(() => readLinkedAddress(VIDEO_ADDRESS, {} as NodeJS.ProcessEnv)).toThrow(
      PROJECT_ERRORS.linkedAddressUnknown
    )
  })

  it("never treats a setting that isn't a web address as an app", () => {
    // Such an address has the origin "null", which a pasted "javascript:" address shares.
    const env = { CONNECTED_VIDEO_URL: "javascript:void 0", CONNECTED_VIDEO_KEY: VIDEO_KEY } as NodeJS.ProcessEnv
    expect(() => readLinkedAddress("javascript:/admin/video-editor/abc", env)).toThrow(
      PROJECT_ERRORS.linkedAddressUnknown
    )
  })
})

describe("pointing a task at a record", () => {
  it("is the site admin's alone", async () => {
    await expect(setTaskLink(sam, { taskId, address: VIDEO_ADDRESS }, database, ENV)).rejects.toThrow(
      PROJECT_ERRORS.notRunningTeam
    )
    await asAdmin(() => setTaskLink(admin, { taskId, address: VIDEO_ADDRESS }, database, ENV))
    const forAdmin = await asAdmin(() => loadTaskDetail(admin.id, taskId, database))
    expect(forAdmin.link).toMatchObject({ app: "video", address: VIDEO_ADDRESS, canOpen: true })
    expect(forAdmin.canSetLink).toBe(true)
  })

  it("shows the others a button or a line, never the address", async () => {
    await asAdmin(() => setTaskLink(admin, { taskId, address: VIDEO_ADDRESS }, database, ENV))
    const forSam = await loadTaskDetail(sam.id, taskId, database)
    expect(forSam.link).toMatchObject({ app: "video", address: null, canOpen: true })
    expect(forSam.canSetLink).toBe(false)
    const forBen = await loadTaskDetail(ben.id, taskId, database)
    expect(forBen.link).toMatchObject({ address: null, canOpen: false })
  })

  it("takes the record off with an empty address", async () => {
    await asAdmin(() => setTaskLink(admin, { taskId, address: VIDEO_ADDRESS }, database, ENV))
    await asAdmin(() => setTaskLink(admin, { taskId, address: "  " }, database, ENV))
    expect((await loadTaskDetail(sam.id, taskId, database)).link).toBeNull()
  })
})

describe("pressing the button", () => {
  beforeEach(async () => {
    await asAdmin(() => setTaskLink(admin, { taskId, address: VIDEO_ADDRESS }, database, ENV))
  })

  it("stamps a 60-second note for the person assigned", async () => {
    const now = Date.UTC(2099, 2, 2, 9)
    const { url } = await openLinkedRecord(sam, taskId, database, ENV, now)
    expect(url.startsWith("https://video.example.test/handoff/project?note=")).toBe(true)
    const note = readNote(url)
    expect(note).toMatchObject({
      v: 1,
      app: "video",
      record: "3f2a9c1e-0000-4000-8000-000000000001",
      sub: sam.id,
      name: "Sam",
      email: "sam@example.test",
      exp: now / 1000 + NOTE_SECONDS,
    })
    expect(note.jti).toMatch(/^[0-9a-f]{64}$/)
  })

  it("gives each press its own one-time id", async () => {
    const first = readNote((await openLinkedRecord(sam, taskId, database, ENV)).url)
    const second = readNote((await openLinkedRecord(sam, taskId, database, ENV)).url)
    expect(first.jti).not.toBe(second.jti)
  })

  it("works for the site admin too", async () => {
    const { url } = await asAdmin(() => openLinkedRecord(admin, taskId, database, ENV))
    expect(readNote(url).sub).toBe(admin.id)
  })

  it("makes no note for someone else on the task", async () => {
    await expect(openLinkedRecord(ben, taskId, database, ENV)).rejects.toThrow(PROJECT_ERRORS.linkedOpenNotAllowed)
  })

  it("makes no note for someone outside the project", async () => {
    const stranger = await insertUser(database, { name: "Stranger", email: "stranger@example.test" })
    await expect(openLinkedRecord(stranger, taskId, database, ENV)).rejects.toThrow()
  })

  it("says so when the app isn't connected on this server", async () => {
    await expect(
      openLinkedRecord(sam, taskId, database, { CONNECTED_VIDEO_URL: "https://video.example.test" } as NodeJS.ProcessEnv)
    ).rejects.toThrow(PROJECT_ERRORS.linkedAppNotSetUp)
  })
})
