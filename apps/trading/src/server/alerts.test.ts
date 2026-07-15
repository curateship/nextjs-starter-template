import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { AlertRuleInput } from "@/lib/alerts"
import type { CustomShellDb } from "@/server/db"
import {
  activateAlertRule,
  clearAlertEvents,
  createAlertRule,
  deleteAlertRule,
  getAlertEventsPoll,
  getAlertEventsPage,
  getAlertRules,
  markAlertEventRead,
  markAllAlertEventsRead,
  pauseAlertRule,
  pruneAlertEvents,
  recordAlertEvent,
  updateAlertRule,
} from "@/server/alerts"
import * as schema from "@/server/schema"
import { now, uuid } from "@/server/util"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>

beforeEach(async () => {
  client = new PGlite()
  for (const file of [
    "../../drizzle/0000_custom_shell_baseline.sql",
    "../../drizzle/0003_custom_shell_workspaces.sql",
    "../../drizzle/0037_alert_dashboard.sql",
  ]) {
    await client.exec(await readFile(new URL(file, import.meta.url), "utf8"))
  }
  database = drizzle(client, { schema })
})

afterEach(async () => {
  await client.close()
})

async function createUser(email: string) {
  const id = uuid()
  const createdAt = now()
  await database.insert(schema.customShellUsers).values({
    id,
    email,
    name: "Trader",
    role: "user",
    passwordHash: "hash",
    createdAt,
    updatedAt: createdAt,
  })
  return id
}

const onceInput: AlertRuleInput = {
  name: "BTC breakout",
  message: "Watch the breakout",
  coin: "BTC",
  kind: "price_level",
  level: 69_500,
  operator: "crossing_up",
  triggerMode: "once",
}

const repeatInput: AlertRuleInput = {
  name: "ETH move",
  coin: "ETH",
  kind: "price_move",
  direction: "up",
  percent: 5,
  window: "15m",
  triggerMode: "repeat",
  cooldown: "5m",
}

const asDb = () => database as unknown as CustomShellDb

describe("alert storage", () => {
  it("enforces the 100-alert limit during simultaneous creates", async () => {
    const userId = await createUser("owner@example.test")
    const results = await Promise.allSettled(
      Array.from({ length: 101 }, (_, index) =>
        createAlertRule(
          userId,
          { ...onceInput, name: `Alert ${index + 1}` },
          asDb()
        )
      )
    )

    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(100)
    expect(await getAlertRules(userId, asDb())).toHaveLength(100)
  })

  it("keeps every read and mutation private to its owner", async () => {
    const ownerId = await createUser("owner@example.test")
    const otherId = await createUser("other@example.test")
    const rule = await createAlertRule(ownerId, onceInput, asDb())
    const event = await recordAlertEvent(
      {
        rule,
        observed: 69_503.2,
        occurredAt: new Date("2026-07-14T12:00:00.000Z"),
        eventKey: "event-1",
      },
      asDb()
    )

    expect(await getAlertRules(otherId, asDb())).toEqual([])
    expect((await getAlertEventsPage(otherId, {}, asDb())).items).toEqual([])
    await expect(
      updateAlertRule(otherId, rule.id, onceInput, asDb())
    ).rejects.toThrow("Alert not found")
    await expect(pauseAlertRule(otherId, rule.id, asDb())).rejects.toThrow(
      "Alert not found"
    )
    await expect(deleteAlertRule(otherId, rule.id, asDb())).rejects.toThrow(
      "Alert not found"
    )
    await expect(
      markAlertEventRead(otherId, event!.id, asDb())
    ).rejects.toThrow("Alert event not found")
  })

  it("pauses, resumes, and restarts one-time alerts", async () => {
    const userId = await createUser("owner@example.test")
    const rule = await createAlertRule(userId, onceInput, asDb())

    expect((await pauseAlertRule(userId, rule.id, asDb())).status).toBe(
      "paused"
    )
    const resumed = await activateAlertRule(userId, rule.id, asDb())
    expect(resumed.status).toBe("active")

    await recordAlertEvent(
      { rule: resumed, observed: 69_501, occurredAt: now(), eventKey: "once" },
      asDb()
    )
    expect((await getAlertRules(userId, asDb()))[0]?.status).toBe("triggered")
    expect((await activateAlertRule(userId, rule.id, asDb())).status).toBe(
      "active"
    )
  })

  it("atomically records and stops a one-time alert", async () => {
    const userId = await createUser("owner@example.test")
    const rule = await createAlertRule(userId, onceInput, asDb())
    const first = await recordAlertEvent(
      { rule, observed: 69_501, occurredAt: now(), eventKey: "first" },
      asDb()
    )
    const staleSecond = await recordAlertEvent(
      { rule, observed: 69_510, occurredAt: now(), eventKey: "second" },
      asDb()
    )

    expect(first).not.toBeNull()
    expect(staleSecond).toBeNull()
    expect((await getAlertRules(userId, asDb()))[0]?.status).toBe("triggered")
    expect((await getAlertEventsPage(userId, {}, asDb())).total).toBe(1)
  })

  it("keeps an event snapshot after its rule is deleted", async () => {
    const userId = await createUser("owner@example.test")
    const rule = await createAlertRule(userId, repeatInput, asDb())
    await recordAlertEvent(
      { rule, observed: 5.2, occurredAt: now(), eventKey: "snapshot" },
      asDb()
    )

    await deleteAlertRule(userId, rule.id, asDb())
    const page = await getAlertEventsPage(userId, {}, asDb())

    expect(page.items).toMatchObject([
      {
        ruleId: null,
        alertName: "ETH move",
        coin: "ETH",
        kind: "price_move",
        percent: 5,
        observed: 5.2,
      },
    ])
  })

  it("filters, sorts, and paginates event history on the server", async () => {
    const userId = await createUser("owner@example.test")
    const btc = await createAlertRule(userId, onceInput, asDb())
    const eth = await createAlertRule(userId, repeatInput, asDb())
    const first = await recordAlertEvent(
      {
        rule: eth,
        observed: 5.2,
        occurredAt: new Date("2026-07-14T12:00:00.000Z"),
        eventKey: "eth-1",
      },
      asDb()
    )
    await recordAlertEvent(
      {
        rule: btc,
        observed: 69_503,
        occurredAt: new Date("2026-07-14T12:01:00.000Z"),
        eventKey: "btc-1",
      },
      asDb()
    )
    await markAlertEventRead(userId, first!.id, asDb())

    const unread = await getAlertEventsPage(
      userId,
      {
        page: 1,
        pageSize: 1,
        search: "breakout",
        coin: "BTC",
        kind: "price_level",
        read: "unread",
        sortBy: "market",
        dir: "asc",
      },
      asDb()
    )
    const allByTime = await getAlertEventsPage(
      userId,
      { page: 1, pageSize: 1, sortBy: "time", dir: "desc" },
      asDb()
    )
    const secondPage = await getAlertEventsPage(
      userId,
      { page: 2, pageSize: 1, sortBy: "time", dir: "desc" },
      asDb()
    )

    expect(unread).toMatchObject({ total: 1, unreadCount: 1 })
    expect(unread.items[0]?.coin).toBe("BTC")
    expect(allByTime.items[0]?.coin).toBe("BTC")
    expect(secondPage.items[0]?.coin).toBe("ETH")

    const poll = await getAlertEventsPoll(userId, 1, asDb())
    expect(poll).toMatchObject({ unreadCount: 1 })
    expect(poll.events).toHaveLength(1)
    expect(poll.events[0]?.coin).toBe("BTC")
  })

  it("marks all read and clears only one user's history", async () => {
    const ownerId = await createUser("owner@example.test")
    const otherId = await createUser("other@example.test")
    const ownerRule = await createAlertRule(ownerId, repeatInput, asDb())
    const otherRule = await createAlertRule(otherId, repeatInput, asDb())
    await recordAlertEvent(
      { rule: ownerRule, observed: 5.2, occurredAt: now(), eventKey: "owner" },
      asDb()
    )
    await recordAlertEvent(
      { rule: otherRule, observed: 5.3, occurredAt: now(), eventKey: "other" },
      asDb()
    )

    const marked = await markAllAlertEventsRead(ownerId, asDb())
    expect(marked.ids).toHaveLength(1)
    expect((await getAlertEventsPage(ownerId, {}, asDb())).unreadCount).toBe(0)

    expect(await clearAlertEvents(ownerId, asDb())).toEqual({ count: 1 })
    expect((await getAlertEventsPage(ownerId, {}, asDb())).total).toBe(0)
    expect((await getAlertEventsPage(otherId, {}, asDb())).total).toBe(1)
  })

  it("prunes only history older than 30 days", async () => {
    const userId = await createUser("owner@example.test")
    const rule = await createAlertRule(userId, repeatInput, asDb())
    await recordAlertEvent(
      {
        rule,
        observed: 5.2,
        occurredAt: new Date("2026-06-01T00:00:00.000Z"),
        eventKey: "old",
      },
      asDb()
    )
    await recordAlertEvent(
      {
        rule: (await getAlertRules(userId, asDb()))[0]!,
        observed: 5.3,
        occurredAt: new Date("2026-07-01T00:00:01.000Z"),
        eventKey: "new",
      },
      asDb()
    )

    expect(
      await pruneAlertEvents(new Date("2026-07-01T00:00:00.000Z"), asDb())
    ).toEqual({ count: 1 })
    expect(
      (await getAlertEventsPage(userId, {}, asDb())).items[0]?.observed
    ).toBe(5.3)
  })
})
