import { beforeEach, describe, expect, it } from "vitest"

import {
  AUTOMATION_PAGE_LOCKED,
  getAutomationPage,
  saveAutomationPageBody,
  setAutomationPageCover,
  setAutomationPageLock,
} from "@/server/automations/page"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertWorkspace } from "@/server/test-support"

const typesOf = (body: string) =>
  (JSON.parse(body) as { content: { type: string }[] }).content.map((node) => node.type)

/** The Automations dashboard's left page, against a real database. */
describe("the Automations page", () => {
  let db: CustomShellDb
  let site: string

  beforeEach(async () => {
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    site = (await insertWorkspace(db)).id
  })

  it("starts with the Dashboards block", async () => {
    const page = await getAutomationPage(site, db)
    expect(typesOf(page.body)).toEqual(["noteAutomationSections", "paragraph"])
    expect(page).toMatchObject({ locked: false, coverUrl: null, coverImages: [] })
  })

  it("keeps the words, drops another dashboard's block, and puts the Dashboards block back", async () => {
    await saveAutomationPageBody(
      site,
      JSON.stringify({
        type: "doc",
        content: [
          { type: "noteCrmStages" },
          { type: "paragraph", content: [{ type: "text", text: "Check the win-back on Mondays" }] },
        ],
      }),
      db
    )
    const page = await getAutomationPage(site, db)
    expect(typesOf(page.body)).toEqual(["noteAutomationSections", "paragraph"])
    expect(page.body).toContain("Check the win-back on Mondays")
  })

  it("keeps the Dashboards block where it was moved, and only one", async () => {
    await saveAutomationPageBody(
      site,
      JSON.stringify({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Above" }] },
          { type: "noteAutomationSections" },
          { type: "noteAutomationSections" },
        ],
      }),
      db
    )
    expect(typesOf((await getAutomationPage(site, db)).body)).toEqual(["paragraph", "noteAutomationSections"])
  })

  it("refuses a save while locked, and saves again once unlocked", async () => {
    await setAutomationPageLock(site, true, db)
    const body = JSON.stringify({ type: "doc", content: [{ type: "noteAutomationSections" }, { type: "paragraph" }] })
    await expect(saveAutomationPageBody(site, body, db)).rejects.toThrow(AUTOMATION_PAGE_LOCKED)
    expect((await getAutomationPage(site, db)).locked).toBe(true)

    await setAutomationPageLock(site, false, db)
    await expect(saveAutomationPageBody(site, body, db)).resolves.toBeUndefined()
  })

  it("keeps the cover and its pictures", async () => {
    await setAutomationPageCover(site, { coverUrl: "sky", coverImages: ["https://example.com/a.jpg"] }, db)
    expect(await getAutomationPage(site, db)).toMatchObject({
      coverUrl: "sky",
      coverImages: ["https://example.com/a.jpg"],
    })
  })
})
