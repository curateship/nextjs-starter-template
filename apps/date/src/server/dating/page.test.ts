import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DATING_BLOCK_NODES, DATING_SECTIONS_NODE, DEFAULT_DATING_WIDGET_LAYOUT } from "@/lib/dating/dating-page"
import type { CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { insertAccount } from "@/server/tinder/fixtures/accounts"

import type { DatingAccount } from "./accounts"
import {
  DATING_PAGE_LOCKED,
  getDatingPage,
  getDatingSections,
  getDatingWidgets,
  saveDatingHiddenSections,
  saveDatingPageBody,
  saveDatingSectionOrder,
  saveDatingWidgets,
  setDatingPageCover,
  setDatingPageLock,
} from "./page"

const T0 = new Date("2099-01-01T12:00:00Z")

function blockTypes(body: string): string[] {
  return ((JSON.parse(body) as { content?: { type: string }[] }).content ?? []).map((node) => node.type)
}

/** Task "features/07-three-panel-design": the left page and Overview's layout, one per profile. */
describe("the Dating dashboard's page", () => {
  let client: PGlite
  let db: CustomShellDb
  let tinder: DatingAccount
  let facebook: DatingAccount

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    const userId = (await insertUser(db, { role: "admin" })).id
    const workspaceId = (await insertWorkspace(db)).id
    tinder = await insertAccount(db, { userId, workspaceId, name: "Tyler" })
    facebook = await insertAccount(db, { userId, workspaceId, name: "Weekends", app: "facebook" })
  })

  afterEach(async () => {
    await client.close()
  })

  it("starts a page nobody wrote on with today's sections as blocks, Second Look only on Facebook Dating", async () => {
    const onTinder = blockTypes((await getDatingPage(tinder, db)).body)
    expect(onTinder[0]).toBe(DATING_SECTIONS_NODE)
    expect(onTinder).toContain(DATING_BLOCK_NODES.needsYou)
    expect(onTinder).toContain(DATING_BLOCK_NODES.myProfile)
    expect(onTinder).not.toContain(DATING_BLOCK_NODES.secondLook)

    const onFacebook = blockTypes((await getDatingPage(facebook, db)).body)
    expect(onFacebook).toContain(DATING_BLOCK_NODES.secondLook)
    expect(onFacebook).not.toContain(DATING_BLOCK_NODES.myProfile)
  })

  it("keeps each profile's page apart", async () => {
    const words = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Only on Tinder" }] }] })
    await saveDatingPageBody(tinder, words, db, T0)
    await setDatingPageCover(tinder, { coverUrl: "sky", coverImages: [] }, db, T0)

    expect((await getDatingPage(tinder, db)).body).toContain("Only on Tinder")
    expect((await getDatingPage(tinder, db)).coverUrl).toBe("sky")
    const other = await getDatingPage(facebook, db)
    expect(other.body).not.toContain("Only on Tinder")
    expect(other.coverUrl).toBeNull()
  })

  it("puts the Dashboards block back on a page saved without it", async () => {
    await saveDatingPageBody(tinder, JSON.stringify({ type: "doc", content: [{ type: DATING_BLOCK_NODES.phone }] }), db, T0)
    const types = blockTypes((await getDatingPage(tinder, db)).body)
    expect(types.filter((type) => type === DATING_SECTIONS_NODE)).toHaveLength(1)
    expect(types).toContain(DATING_BLOCK_NODES.phone)
  })

  it("refuses to save a locked page, and saves again once it is unlocked", async () => {
    const words = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] })
    await setDatingPageLock(tinder, true, db, T0)
    await expect(saveDatingPageBody(tinder, words, db, T0)).rejects.toThrow(DATING_PAGE_LOCKED)
    await setDatingPageLock(tinder, false, db, T0)
    await saveDatingPageBody(tinder, words, db, T0)
    expect((await getDatingPage(tinder, db)).body).toContain("Hello")
  })

  it("keeps Overview's layout per profile, cleaned, and starts from the default", async () => {
    expect(await getDatingWidgets(tinder, db)).toEqual(DEFAULT_DATING_WIDGET_LAYOUT)
    const saved = await saveDatingWidgets(
      tinder,
      { top: { columns: 1, spots: ["compare"] }, bottom: { columns: 2, spots: ["compare", "not-a-widget"] } },
      db,
      T0
    )
    // A widget shows once, and one Date does not have is dropped.
    expect(saved.top.spots).toEqual(["compare"])
    expect(saved.bottom.spots).toEqual([null, null])
    expect(await getDatingWidgets(tinder, db)).toEqual(saved)
    expect(await getDatingWidgets(facebook, db)).toEqual(DEFAULT_DATING_WIDGET_LAYOUT)
  })
})

describe("the Dashboards block's rows", () => {
  let client: PGlite
  let db: CustomShellDb
  let account: DatingAccount

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    const userId = (await insertUser(db, { role: "admin" })).id
    const workspaceId = (await insertWorkspace(db)).id
    account = await insertAccount(db, { userId, workspaceId })
  })

  afterEach(async () => {
    await client.close()
  })

  it("keeps hidden rows and order, never Overview and never a row Date does not have", async () => {
    expect(await getDatingSections(account, db)).toEqual({ hidden: [], order: [] })
    await saveDatingHiddenSections(account, ["dates", "overview", "nope", "dates"], db, T0)
    await saveDatingSectionOrder(account, ["matches", "all"], db, T0)
    expect(await getDatingSections(account, db)).toEqual({ hidden: ["dates"], order: ["matches", "all"] })
  })
})
