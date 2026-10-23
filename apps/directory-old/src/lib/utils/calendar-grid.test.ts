import assert from "node:assert/strict"
import test from "node:test"

import {
  addMonths,
  formatMonthLabel,
  formatTimeLabel,
  isValidDateString,
  monthMatrix,
  parseYearMonth,
  toDateString,
} from "./calendar-grid"

test("isValidDateString accepts real dates and rejects malformed or impossible ones", () => {
  assert.equal(isValidDateString("2026-07-25"), true)
  assert.equal(isValidDateString("2026-02-28"), true)
  assert.equal(isValidDateString("2026-02-30"), false) // Feb never has 30 days
  assert.equal(isValidDateString("2026-13-01"), false)
  assert.equal(isValidDateString("2026-7-5"), false) // must be zero-padded
  assert.equal(isValidDateString("not-a-date"), false)
  assert.equal(isValidDateString(undefined), false)
  assert.equal(isValidDateString(20260725), false)
})

test("addMonths rolls over year boundaries in both directions", () => {
  assert.deepEqual(addMonths({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 })
  assert.deepEqual(addMonths({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 })
  assert.deepEqual(addMonths({ year: 2026, month: 6 }, 8), { year: 2027, month: 2 })
  assert.deepEqual(addMonths({ year: 2026, month: 3 }, -14), { year: 2025, month: 1 })
})

test("monthMatrix returns whole weeks starting on Sunday and covering every day", () => {
  const cells = monthMatrix({ year: 2026, month: 7 })

  // Whole weeks only.
  assert.equal(cells.length % 7, 0)

  // First cell is a Sunday (UTC math, no timezone drift).
  assert.equal(new Date(`${cells[0].date}T00:00:00Z`).getUTCDay(), 0)

  // Every day of July 2026 appears exactly once and is flagged in-month.
  const inMonth = cells.filter((cell) => cell.inCurrentMonth).map((cell) => cell.date)
  assert.equal(inMonth.length, 31)
  assert.equal(inMonth[0], "2026-07-01")
  assert.equal(inMonth[30], "2026-07-31")
  assert.equal(new Set(inMonth).size, 31)
})

test("monthMatrix places the 1st at its real weekday offset", () => {
  const cells = monthMatrix({ year: 2026, month: 2 })
  const firstIndex = cells.findIndex((cell) => cell.date === "2026-02-01")
  const firstWeekday = new Date("2026-02-01T00:00:00Z").getUTCDay()
  assert.equal(firstIndex, firstWeekday)
})

test("parseYearMonth and toDateString round-trip", () => {
  assert.deepEqual(parseYearMonth("2026-07-25"), { year: 2026, month: 7 })
  assert.equal(parseYearMonth("bad"), null)
  assert.equal(toDateString(2026, 7, 5), "2026-07-05")
})

test("formatMonthLabel and formatTimeLabel produce human labels", () => {
  assert.equal(formatMonthLabel({ year: 2026, month: 7 }), "July 2026")
  assert.equal(formatTimeLabel("18:00"), "6:00 PM")
  assert.equal(formatTimeLabel("09:30"), "9:30 AM")
  assert.equal(formatTimeLabel(undefined), "")
  assert.equal(formatTimeLabel("25:61"), "")
})
