import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  FOLLOW_UP_WINDOW_HOURS,
  REGISTRATION_HOLD_MINUTES,
  REMINDER_LEAD_HOURS,
  eventStartTimestamp,
  followUpTimestamp,
  formatReminderLeadTime,
  holdIsActive,
  isEventPast,
  isFollowUpDue,
  isReminderDue,
  isReminderSwitchOn,
  isSoldOut,
  normalizeCapacity,
  normalizeReminderLeadHours,
  normalizeTicketPriceId,
  readEventRegistrationSettings,
  reminderStartKey,
  sanitizeRegistrantEmail,
  sanitizeRegistrantName,
  seatsRemaining,
} from "./event-registration-core"

function blocksWith(content: Record<string, unknown>) {
  return {
    "event-content-default": {
      id: "event-content-default",
      type: "event-content",
      content,
    },
  }
}

describe("registration settings from block content", () => {
  it("reads a free RSVP with a seat limit", () => {
    const settings = readEventRegistrationSettings(blocksWith({ registrationMode: "free", capacity: 30 }))
    assert.equal(settings.mode, "free")
    assert.equal(settings.capacity, 30)
    assert.equal(settings.ticketPriceId, "")
  })

  it("reads a paid ticket with its Stripe price and display label", () => {
    const settings = readEventRegistrationSettings(blocksWith({
      registrationMode: "paid",
      capacity: 10,
      ticketPriceId: "price_ABC123",
      ticketPriceLabel: "  $25  ",
    }))
    assert.equal(settings.mode, "paid")
    assert.equal(settings.ticketPriceId, "price_ABC123")
    assert.equal(settings.ticketPriceLabel, "$25")
  })

  it("refuses to sell a paid ticket with no usable Stripe price", () => {
    const settings = readEventRegistrationSettings(blocksWith({ registrationMode: "paid", capacity: 10 }))
    assert.equal(settings.mode, "none")
  })

  it("ignores a paid price on a free event", () => {
    const settings = readEventRegistrationSettings(blocksWith({
      registrationMode: "free",
      ticketPriceId: "price_ABC123",
      ticketPriceLabel: "$25",
    }))
    assert.equal(settings.ticketPriceId, "")
    assert.equal(settings.ticketPriceLabel, "")
  })

  it("treats a missing, unknown or off mode as no registration", () => {
    assert.equal(readEventRegistrationSettings(blocksWith({})).mode, "none")
    assert.equal(readEventRegistrationSettings(blocksWith({ registrationMode: "nope" })).mode, "none")
    assert.equal(readEventRegistrationSettings(blocksWith({ registrationMode: "none" })).mode, "none")
    assert.equal(readEventRegistrationSettings(null).mode, "none")
    assert.equal(readEventRegistrationSettings({ "some-other-block": { type: "rich-text" } }).mode, "none")
  })

  it("normalizes capacity to a positive whole number or unlimited", () => {
    assert.equal(normalizeCapacity("30"), 30)
    assert.equal(normalizeCapacity(30.7), 30)
    assert.equal(normalizeCapacity(0), null)
    assert.equal(normalizeCapacity(-5), null)
    assert.equal(normalizeCapacity(""), null)
    assert.equal(normalizeCapacity("abc"), null)
    assert.equal(normalizeCapacity(undefined), null)
  })

  it("only accepts Stripe-shaped price ids", () => {
    assert.equal(normalizeTicketPriceId(" price_1Abc_XYZ "), "price_1Abc_XYZ")
    assert.equal(normalizeTicketPriceId("prod_123"), "")
    assert.equal(normalizeTicketPriceId("price_"), "")
    assert.equal(normalizeTicketPriceId(42), "")
  })
})

describe("seat counting", () => {
  it("reports remaining seats and sold-out state", () => {
    assert.equal(seatsRemaining(30, 12), 18)
    assert.equal(seatsRemaining(30, 30), 0)
    assert.equal(seatsRemaining(30, 40), 0)
    assert.equal(seatsRemaining(null, 40), null)

    assert.equal(isSoldOut(30, 29), false)
    assert.equal(isSoldOut(30, 30), true)
    assert.equal(isSoldOut(30, 31), true)
    assert.equal(isSoldOut(null, 9999), false)
  })

  it("keeps a fresh checkout hold and drops a stale one", () => {
    const now = new Date("2026-08-01T12:00:00Z")
    const fresh = new Date(now.getTime() - (REGISTRATION_HOLD_MINUTES - 1) * 60 * 1000)
    const stale = new Date(now.getTime() - (REGISTRATION_HOLD_MINUTES + 1) * 60 * 1000)

    assert.equal(holdIsActive(fresh, now), true)
    assert.equal(holdIsActive(stale, now), false)
    assert.equal(holdIsActive("not-a-date", now), false)
  })
})

describe("event timing", () => {
  it("reads a timed start in local wall-clock time", () => {
    const startMs = eventStartTimestamp("2026-08-15", "18:00")
    assert.equal(startMs, new Date(2026, 7, 15, 18, 0).getTime())
  })

  it("treats a date with no time as running to the end of that day", () => {
    const startMs = eventStartTimestamp("2026-08-15", null)
    assert.equal(startMs, new Date(2026, 7, 15, 23, 59).getTime())
  })

  it("rejects unusable dates and times", () => {
    assert.equal(eventStartTimestamp("", "18:00"), null)
    assert.equal(eventStartTimestamp("15-08-2026", "18:00"), null)
    assert.equal(eventStartTimestamp("2026-13-15", "18:00"), null)
    // An unparseable time falls back to the all-day rule rather than failing.
    assert.equal(eventStartTimestamp("2026-08-15", "25:00"), new Date(2026, 7, 15, 23, 59).getTime())
  })

  it("closes signups once the event has started", () => {
    assert.equal(isEventPast("2026-08-15", "18:00", new Date(2026, 7, 15, 17, 59)), false)
    assert.equal(isEventPast("2026-08-15", "18:00", new Date(2026, 7, 15, 18, 1)), true)
  })

  it("keeps signups open for an event with no usable date rather than calling it over", () => {
    assert.equal(isEventPast(null, null, new Date(2026, 7, 15)), false)
    assert.equal(isEventPast("", "18:00", new Date(2026, 7, 15)), false)
    assert.equal(isEventPast("15-08-2026", "18:00", new Date(2026, 7, 15)), false)
  })

  it("sends a reminder only inside the lead window and before the start", () => {
    const startMs = new Date(2026, 7, 15, 18, 0).getTime()
    const hourMs = 60 * 60 * 1000

    assert.equal(isReminderDue(startMs, new Date(startMs - (REMINDER_LEAD_HOURS + 1) * hourMs)), false)
    assert.equal(isReminderDue(startMs, new Date(startMs - (REMINDER_LEAD_HOURS - 1) * hourMs)), true)
    assert.equal(isReminderDue(startMs, new Date(startMs - 60 * 1000)), true)
    assert.equal(isReminderDue(startMs, new Date(startMs)), false)
    assert.equal(isReminderDue(startMs, new Date(startMs + hourMs)), false)
  })

  it("moves the reminder window with the lead time the event chose", () => {
    const startMs = new Date(2026, 7, 15, 18, 0).getTime()
    const hourMs = 60 * 60 * 1000

    // A one-week lead reminds a day out; a one-hour lead does not.
    assert.equal(isReminderDue(startMs, new Date(startMs - 24 * hourMs), 168), true)
    assert.equal(isReminderDue(startMs, new Date(startMs - 24 * hourMs), 1), false)
    assert.equal(isReminderDue(startMs, new Date(startMs - 30 * 60 * 1000), 1), true)
  })
})

describe("follow-up timing", () => {
  const startMs = new Date(2026, 7, 15, 18, 0).getTime()
  const hourMs = 60 * 60 * 1000

  it("lands at 9am the morning after the event", () => {
    assert.equal(followUpTimestamp(startMs), new Date(2026, 7, 16, 9, 0).getTime())
  })

  it("thanks an all-day event's attendees the next morning too, not a day later", () => {
    const allDayStart = eventStartTimestamp("2026-08-15", null) as number
    assert.equal(followUpTimestamp(allDayStart), new Date(2026, 7, 16, 9, 0).getTime())
  })

  it("rolls into the next month correctly", () => {
    const monthEnd = new Date(2026, 7, 31, 20, 0).getTime()
    assert.equal(followUpTimestamp(monthEnd), new Date(2026, 8, 1, 9, 0).getTime())
  })

  it("waits for the morning, then closes the window once the event is old news", () => {
    const dueMs = followUpTimestamp(startMs)

    assert.equal(isFollowUpDue(startMs, new Date(startMs + hourMs)), false)
    assert.equal(isFollowUpDue(startMs, new Date(dueMs - 60 * 1000)), false)
    assert.equal(isFollowUpDue(startMs, new Date(dueMs)), true)
    assert.equal(isFollowUpDue(startMs, new Date(dueMs + FOLLOW_UP_WINDOW_HOURS * hourMs)), true)
    assert.equal(isFollowUpDue(startMs, new Date(dueMs + (FOLLOW_UP_WINDOW_HOURS + 1) * hourMs)), false)
  })
})

describe("reminder settings", () => {
  it("reminds and thanks by default, so an untouched event behaves like every other one", () => {
    assert.equal(isReminderSwitchOn(undefined), true)
    assert.equal(isReminderSwitchOn(null), true)
    assert.equal(isReminderSwitchOn(true), true)
    assert.equal(normalizeReminderLeadHours(undefined), REMINDER_LEAD_HOURS)
  })

  it("turns an email off only when the event says false", () => {
    assert.equal(isReminderSwitchOn(false), false)
    // The cron reads block JSON out as text, so the string form has to count too.
    assert.equal(isReminderSwitchOn("false"), false)
    assert.equal(isReminderSwitchOn("true"), true)
    assert.equal(isReminderSwitchOn(0), true)
  })

  it("only accepts a lead time that is actually offered", () => {
    assert.equal(normalizeReminderLeadHours(1), 1)
    assert.equal(normalizeReminderLeadHours("168"), 168)
    assert.equal(normalizeReminderLeadHours(5), REMINDER_LEAD_HOURS)
    assert.equal(normalizeReminderLeadHours(-24), REMINDER_LEAD_HOURS)
    assert.equal(normalizeReminderLeadHours("soon"), REMINDER_LEAD_HOURS)
    assert.equal(normalizeReminderLeadHours(undefined), REMINDER_LEAD_HOURS)
  })

  it("reads every lead time back in words", () => {
    assert.equal(formatReminderLeadTime(1), "1 hour before")
    assert.equal(formatReminderLeadTime(3), "3 hours before")
    assert.equal(formatReminderLeadTime(24), "1 day before")
    assert.equal(formatReminderLeadTime(48), "2 days before")
    assert.equal(formatReminderLeadTime(168), "1 week before")
  })
})

describe("rescheduled events", () => {
  it("keys a reminder to the start time it described", () => {
    assert.equal(reminderStartKey("2026-08-15", "18:00"), "2026-08-15T18:00")
    assert.equal(reminderStartKey("2026-08-15", null), "2026-08-15")
    assert.equal(reminderStartKey("2026-08-15", "25:00"), "2026-08-15")
    assert.equal(reminderStartKey("", "18:00"), "")
    assert.equal(reminderStartKey("15-08-2026", "18:00"), "")
  })

  it("changes the key when the event moves, and only then", () => {
    const sent = reminderStartKey("2026-08-15", "18:00")
    assert.equal(reminderStartKey("2026-08-15", "18:00"), sent)
    assert.notEqual(reminderStartKey("2026-08-15", "20:00"), sent)
    assert.notEqual(reminderStartKey("2026-08-16", "18:00"), sent)
  })
})

describe("registrant input", () => {
  it("strips markup and clamps the name", () => {
    assert.equal(sanitizeRegistrantName("  <b>Jane</b> Doe  "), "Jane Doe")
    assert.equal(sanitizeRegistrantName('Jane "JD" Doe'), "Jane JD Doe")
    assert.equal(sanitizeRegistrantName(""), "")
    assert.equal(sanitizeRegistrantName(42), "")
    assert.equal(sanitizeRegistrantName("a".repeat(300)).length, 255)
  })

  it("flattens control characters so a pasted newline cannot mangle a subject line", () => {
    assert.equal(sanitizeRegistrantName("Jane\r\nBcc: someone@example.com"), "Jane Bcc: someone@example.com")
    assert.equal(sanitizeRegistrantName("Jane\tDoe"), "Jane Doe")
    assert.equal(sanitizeRegistrantName("\n\n"), "")
  })

  it("lowercases a valid email and rejects an invalid one", () => {
    assert.equal(sanitizeRegistrantEmail("  Jane@Example.COM "), "jane@example.com")
    assert.equal(sanitizeRegistrantEmail("jane@example"), "")
    assert.equal(sanitizeRegistrantEmail("not an email"), "")
    assert.equal(sanitizeRegistrantEmail(null), "")
  })
})
