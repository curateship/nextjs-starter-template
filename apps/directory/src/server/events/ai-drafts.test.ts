import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MAX_DRAFTS_PER_RUN } from "@/lib/events/draft-events-step"
import { postBodyText } from "@/lib/posts/post-body"
import type {
  AutomationExecutorContext,
  AutomationExecutorResult,
} from "@/server/automations/executors"
import { createCategory } from "@/server/directory/categories"
import { categoryRelationships } from "@/server/directory/schema"
import {
  executeDraftEventsStep,
  readFoundEvents,
  type DraftEventsOutput,
} from "@/server/events/ai-drafts"
import { createEvent, findEvent } from "@/server/events/events"
import { EVENT_CONTENT_TYPE, siteEvents } from "@/server/events/schema"
import type { CustomShellAutomationRun } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * The Draft events step: what it writes, what it leaves out, and that no
 * answer from the AI can make it publish anything.
 */

let client: PGlite
let database: TestDatabase
let siteId: string
let otherSiteId: string
let authorId: string

const SOURCE = "https://venue.example/whats-on"
// Thursday 24 September 2026, midday in Toronto.
const NOW = new Date("2026-09-24T16:00:00Z")

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  siteId = (await insertWorkspace(database, { name: "Alpha" })).id
  otherSiteId = (await insertWorkspace(database, { name: "Beta" })).id
  authorId = (await insertUser(database)).id
})

afterEach(async () => {
  await client.close()
})

function gig(title: string, date: string, extra: Record<string, unknown> = {}) {
  return {
    title,
    date,
    startTime: "21:00",
    endTime: "",
    placeName: "The Horseshoe",
    placeAddress: "370 Queen St W, Toronto",
    description: "Loud guitars.\n\nDoors at 8.",
    ...extra,
  }
}

function run(settings: Record<string, unknown> = {}, answer: unknown = {}) {
  const ask = vi.fn(async () => answer)
  const readPage = vi.fn(async (url: string) => ({
    url,
    text: "Fri Oct 2: The Rusty Nails, 9pm",
  }))
  const context: AutomationExecutorContext = {
    database,
    run: {
      id: "run-1",
      automationId: "flow-1",
      userId: authorId,
      workspaceId: siteId,
    } as CustomShellAutomationRun,
    nodeId: "node-1",
    settings: {
      provider: "anthropic",
      model: "claude-opus-5",
      sourceUrl: SOURCE,
      categoryId: "",
      instructions: "",
      ...settings,
    },
    now: () => NOW,
  }
  return {
    ask,
    readPage,
    go: () => executeDraftEventsStep(context, { ask, readPage }),
  }
}

function outputOf(result: AutomationExecutorResult): DraftEventsOutput {
  if (result.type === "park") throw new Error("The step never waits.")
  return result.output as DraftEventsOutput
}

async function eventsOn(site: string) {
  return database
    .select()
    .from(siteEvents)
    .where(eq(siteEvents.workspaceId, site))
}

describe("executeDraftEventsStep", () => {
  it("writes each event on the page as a draft with the page as its source", async () => {
    const step = run({}, { events: [gig("The Rusty Nails", "2026-10-02")] })
    const result = await step.go()

    const rows = await eventsOn(siteId)
    expect(rows).toHaveLength(1)
    const event = await findEvent(siteId, rows[0].id, database)
    expect(event).toMatchObject({
      title: "The Rusty Nails",
      status: "draft",
      publishedAt: null,
      startDate: "2026-10-02",
      startTime: "21:00",
      placeName: "The Horseshoe",
      placeAddress: "370 Queen St W, Toronto",
      summary: "Loud guitars.",
      sourceUrl: SOURCE,
    })
    expect(postBodyText(event!.body)).toContain("Doors at 8.")
    expect(result).toMatchObject({
      type: "next",
      summary: "Drafted 1 event.",
    })
    expect(await eventsOn(otherSiteId)).toHaveLength(0)
  })

  it("can only ever write drafts, whatever the AI answers", async () => {
    const step = run(
      {},
      {
        events: [
          gig("Published please", "2026-10-02", {
            status: "published",
            publishedAt: "2026-09-01T00:00:00Z",
            visibility: "public",
          }),
        ],
        status: "published",
      }
    )
    await step.go()

    const rows = await eventsOn(siteId)
    expect(rows).toHaveLength(1)
    expect(rows.every((row) => row.status === "draft")).toBe(true)
    expect(rows.every((row) => row.publishedAt === null)).toBe(true)
  })

  it("makes no new drafts when run twice on the same page", async () => {
    const answer = {
      events: [
        gig("The Rusty Nails", "2026-10-02"),
        gig("Open mic", "2026-10-03"),
      ],
    }
    await run({}, answer).go()
    const second = await run({}, answer).go()

    expect(await eventsOn(siteId)).toHaveLength(2)
    expect(second.summary).toBe("No new events to draft. Skipped 2.")
    const output = outputOf(second)
    expect(output.skipped.map((item) => item.reason)).toEqual([
      "The site already has an event with this title on this day.",
      "The site already has an event with this title on this day.",
    ])
  })

  it("treats capitals and spacing as the same title, and a new day as a new event", async () => {
    await createEvent(
      siteId,
      {
        title: "The  Rusty Nails",
        when: { startDate: "2026-10-02", startTime: "20:00" },
      },
      database
    )
    await run(
      {},
      {
        events: [
          gig("the rusty nails", "2026-10-02"),
          gig("The Rusty Nails", "2026-10-09"),
          // The same event twice on one page is drafted once.
          gig("The Rusty Nails", "2026-10-09"),
        ],
      }
    ).go()

    const rows = await eventsOn(siteId)
    expect(rows.map((row) => row.startDate).sort()).toEqual([
      "2026-10-02",
      "2026-10-09",
    ])
  })

  it("drafts at most 25 a run and says how many were left for the next", async () => {
    const events = Array.from({ length: MAX_DRAFTS_PER_RUN + 4 }, (_, index) =>
      gig(`Show ${index + 1}`, "2026-10-10")
    )
    const first = await run({}, { events }).go()

    expect(await eventsOn(siteId)).toHaveLength(MAX_DRAFTS_PER_RUN)
    expect(first.summary).toBe(
      "Drafted 25 events. 4 more were left for the next run, because one run drafts at most 25."
    )
    expect(outputOf(first).overCap).toBe(4)

    // The next run skips the 25 as duplicates and drafts the other 4.
    const second = await run({}, { events }).go()
    expect(await eventsOn(siteId)).toHaveLength(MAX_DRAFTS_PER_RUN + 4)
    expect(second.summary).toBe("Drafted 4 events. Skipped 25.")
  })

  it("leaves out events with no exact day, no start time, or already over, and says why", async () => {
    const result = await run(
      {},
      {
        events: [
          gig("Every Friday jam", ""),
          gig("Sometime soon", "2026-02-30"),
          gig("No time given", "2026-10-02", { startTime: "" }),
          gig("Last week's show", "2026-09-17"),
        ],
      }
    ).go()

    expect(await eventsOn(siteId)).toHaveLength(0)
    expect(outputOf(result).skipped).toEqual([
      { title: "Every Friday jam", reason: "The page did not give an exact day." },
      { title: "Sometime soon", reason: "The page did not give an exact day." },
      { title: "No time given", reason: "The page did not give a start time." },
      { title: "Last week's show", reason: "It is already over." },
    ])
  })

  it("counts every event left out, while listing only the first 40", async () => {
    const events = Array.from({ length: 45 }, (_, index) =>
      gig(`Old show ${index + 1}`, "2026-09-01")
    )
    const result = await run({}, { events }).go()

    expect(result.summary).toBe("No new events to draft. Skipped 45.")
    expect(outputOf(result).skipped).toHaveLength(40)
  })

  it("an end time before the start runs into the next day", async () => {
    await run({}, { events: [gig("Late show", "2026-10-02", { endTime: "01:00" })] }).go()
    const [row] = await eventsOn(siteId)
    expect(row).toMatchObject({ endDate: "2026-10-03", endTime: "01:00:00" })
  })

  it("files every draft under the chosen category", async () => {
    const category = await createCategory(siteId, { name: "Live music" }, database)
    await run(
      { categoryId: category.id },
      { events: [gig("The Rusty Nails", "2026-10-02")] }
    ).go()

    const [row] = await eventsOn(siteId)
    const filed = await database
      .select()
      .from(categoryRelationships)
      .where(
        and(
          eq(categoryRelationships.contentType, EVENT_CONTENT_TYPE),
          eq(categoryRelationships.contentId, row.id)
        )
      )
    expect(filed.map((each) => each.categoryId)).toEqual([category.id])
  })

  it("stops before asking the AI when the category is not on the site", async () => {
    const elsewhere = await createCategory(otherSiteId, { name: "Theatre" }, database)
    const step = run({ categoryId: elsewhere.id })

    await expect(step.go()).rejects.toThrow(
      "The category picked in this step is no longer on this site."
    )
    expect(step.readPage).not.toHaveBeenCalled()
    expect(step.ask).not.toHaveBeenCalled()
  })

  it("does not ask the AI about an empty page", async () => {
    const step = run()
    step.readPage.mockResolvedValueOnce({ url: SOURCE, text: "" })
    const result = await step.go()

    expect(step.ask).not.toHaveBeenCalled()
    expect(result.summary).toBe(
      "The page had no words on it, so no events were drafted."
    )
  })

  it("bills the flow's author and gives the AI today's date on the site's clock", async () => {
    const step = run({}, { events: [] })
    await step.go()

    expect(step.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: authorId,
        feature: "draft-events",
        prompt: expect.stringContaining("Today is 2026-09-24."),
      })
    )
  })
})

describe("readFoundEvents", () => {
  it("refuses an answer that is not a list of events", () => {
    expect(() => readFoundEvents("nothing")).toThrow(
      "The AI's answer was not a list of events."
    )
  })

  it("drops an end time equal to the start", () => {
    const { events } = readFoundEvents({
      events: [gig("Same", "2026-10-02", { endTime: "21:00" })],
    })
    expect(events[0].endTime).toBeNull()
  })
})
