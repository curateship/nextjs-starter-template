import { describe, expect, it } from "vitest"

import {
  AUTOMATION_TIMEZONES,
  automationScheduleSchema,
  changeAutomationScheduleTimezone,
  formatRunAtForTimezoneInput,
  getNextAutomationRunAt,
  runAtFromTimezoneInput,
} from "@/lib/automations/schedule"

describe("automation schedules", () => {
  it("offers the ten timezone choices shown in the editor", () => {
    expect(AUTOMATION_TIMEZONES).toHaveLength(10)
    expect(AUTOMATION_TIMEZONES).toContain("UTC")
    expect(AUTOMATION_TIMEZONES).toContain("America/Toronto")
  })

  it("finds the next daily run in the configured timezone", () => {
    const next = getNextAutomationRunAt(
      { frequency: "daily", time: "09:00", timezone: "America/Toronto" },
      new Date("2026-07-15T12:00:00.000Z")
    )

    expect(next?.toISOString()).toBe("2026-07-15T13:00:00.000Z")
  })

  it("finds the chosen weekday", () => {
    const next = getNextAutomationRunAt(
      {
        frequency: "weekly",
        time: "09:00",
        timezone: "UTC",
        dayOfWeek: 5,
      },
      new Date("2026-08-10T12:00:00.000Z")
    )

    expect(next?.toISOString()).toBe("2026-08-14T09:00:00.000Z")
  })

  it("uses the final day of a shorter month", () => {
    const next = getNextAutomationRunAt(
      {
        frequency: "monthly",
        time: "10:00",
        timezone: "UTC",
        dayOfMonth: 31,
      },
      new Date("2026-04-01T00:00:00.000Z")
    )

    expect(next?.toISOString()).toBe("2026-04-30T10:00:00.000Z")
  })

  it("finishes a one-time schedule after its chosen moment", () => {
    const next = getNextAutomationRunAt(
      {
        frequency: "once",
        runAt: "2026-07-15T12:00:00.000Z",
        timezone: "UTC",
      },
      new Date("2026-07-15T13:00:00.000Z")
    )

    expect(next).toBeNull()
  })

  it("converts a one-time input through its timezone", () => {
    const runAt = runAtFromTimezoneInput("2026-07-15T09:00", "America/Toronto")

    expect(runAt).toBe("2026-07-15T13:00:00.000Z")
    expect(formatRunAtForTimezoneInput(runAt!, "America/Toronto")).toBe(
      "2026-07-15T09:00"
    )
  })

  it("keeps the chosen wall-clock time when its timezone changes", () => {
    const changed = changeAutomationScheduleTimezone(
      {
        frequency: "once",
        runAt: "2026-07-15T13:00:00.000Z",
        timezone: "America/Toronto",
      },
      "America/Los_Angeles"
    )

    expect(changed).toMatchObject({
      frequency: "once",
      runAt: "2026-07-15T16:00:00.000Z",
    })
  })

  it("skips a wall-clock time that does not exist during spring forward", () => {
    const next = getNextAutomationRunAt(
      {
        frequency: "daily",
        time: "02:30",
        timezone: "America/Toronto",
      },
      new Date("2026-03-08T00:00:00.000Z")
    )

    expect(next?.toISOString()).toBe("2026-03-09T06:30:00.000Z")
  })

  it("uses one occurrence when fall back repeats a wall-clock time", () => {
    const first = getNextAutomationRunAt(
      {
        frequency: "daily",
        time: "01:30",
        timezone: "America/Toronto",
      },
      new Date("2026-11-01T00:00:00.000Z")
    )
    const afterFirst = getNextAutomationRunAt(
      {
        frequency: "daily",
        time: "01:30",
        timezone: "America/Toronto",
      },
      new Date("2026-11-01T05:31:00.000Z")
    )

    expect(first?.toISOString()).toBe("2026-11-01T05:30:00.000Z")
    expect(afterFirst?.toISOString()).toBe("2026-11-02T06:30:00.000Z")
  })

  it("refuses invalid timezones and calendar choices", () => {
    expect(
      automationScheduleSchema.safeParse({
        frequency: "daily",
        time: "09:00",
        timezone: "Toronto-ish",
      }).success
    ).toBe(false)
    expect(
      automationScheduleSchema.safeParse({
        frequency: "monthly",
        time: "09:00",
        timezone: "UTC",
        dayOfMonth: 32,
      }).success
    ).toBe(false)
  })
})
