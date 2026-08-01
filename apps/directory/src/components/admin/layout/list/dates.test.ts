import assert from "node:assert/strict"
import test from "node:test"

import { formatExactDateTime, formatRelativeDate, formatShortDate } from "./dates"

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function ago(ms: number) {
  return new Date(Date.now() - ms)
}

test("missing or invalid dates fall back", () => {
  assert.equal(formatRelativeDate(null), "-")
  assert.equal(formatRelativeDate(undefined), "-")
  assert.equal(formatRelativeDate("not a date"), "-")
  assert.equal(formatRelativeDate(null, "Never"), "Never")
  assert.equal(formatShortDate("not a date"), "-")
  assert.equal(formatExactDateTime(null), "-")
})

test("under a minute reads Just now", () => {
  assert.equal(formatRelativeDate(ago(5 * 1000)), "Just now")
})

test("minutes and hours are singular and plural correctly", () => {
  assert.equal(formatRelativeDate(ago(MINUTE + 1000)), "1 minute ago")
  assert.equal(formatRelativeDate(ago(5 * MINUTE)), "5 minutes ago")
  assert.equal(formatRelativeDate(ago(HOUR + MINUTE)), "1 hour ago")
  assert.equal(formatRelativeDate(ago(5 * HOUR)), "5 hours ago")
})

test("days and weeks are singular and plural correctly", () => {
  assert.equal(formatRelativeDate(ago(DAY + HOUR)), "1 day ago")
  assert.equal(formatRelativeDate(ago(3 * DAY)), "3 days ago")
  // 7-13 days is the range the old helper rendered as "1 weeks ago"
  assert.equal(formatRelativeDate(ago(8 * DAY)), "1 week ago")
  assert.equal(formatRelativeDate(ago(15 * DAY)), "2 weeks ago")
  assert.equal(formatRelativeDate(ago(29 * DAY)), "4 weeks ago")
})

test("30 days and beyond shows the exact date, never months ago", () => {
  const old = ago(45 * DAY)
  assert.equal(formatRelativeDate(old), formatShortDate(old))
  assert.match(formatRelativeDate(old), /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/)
})

test("a future date never reads as past", () => {
  const future = new Date(Date.now() + 3 * DAY)
  assert.equal(formatRelativeDate(future), formatShortDate(future))
  assert.doesNotMatch(formatRelativeDate(future), /ago/)
})

test("the exact-datetime title carries date and time", () => {
  const value = new Date("2026-07-17T15:42:00")
  assert.equal(formatExactDateTime(value), "Jul 17, 2026, 3:42 PM")
})
