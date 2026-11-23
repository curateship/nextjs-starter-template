import { describe, expect, it } from "vitest"

import {
  calendarFileName,
  meetingCalendarFile,
  type CalendarMeeting,
} from "@/lib/project/meeting-calendar-file"

const AT = new Date("2026-10-12T19:00:00Z")

function meeting(overrides: Partial<CalendarMeeting> = {}): CalendarMeeting {
  return {
    id: "m1",
    title: "Weekly client call",
    day: "2026-10-13",
    startTime: "10:00",
    endTime: "10:45",
    timeZone: "America/Toronto",
    repeatEvery: "week",
    videoUrl: "https://meet.google.com/abc-defg-hij",
    ...overrides,
  }
}

/** The file's lines with folded lines put back together. */
function linesOf(file: string) {
  return file.replace(/\r\n /g, "").split("\r\n")
}

describe("the calendar file", () => {
  it("sets the times in the meeting's own zone, with its clock changes, and repeats weekly", () => {
    const lines = linesOf(meetingCalendarFile(meeting(), AT))
    expect(lines).toContain("DTSTART;TZID=America/Toronto:20261013T100000")
    expect(lines).toContain("DTEND;TZID=America/Toronto:20261013T104500")
    expect(lines).toContain("RRULE:FREQ=WEEKLY")
    expect(lines).toContain("TZID:America/Toronto")
    // Toronto: clocks go forward on the second Sunday of March at 2 AM, and
    // back on the first Sunday of November at 2 AM.
    const daylight = lines.slice(lines.indexOf("BEGIN:DAYLIGHT"), lines.indexOf("END:DAYLIGHT"))
    expect(daylight).toEqual([
      "BEGIN:DAYLIGHT",
      "TZOFFSETFROM:-0500",
      "TZOFFSETTO:-0400",
      "DTSTART:19700308T020000",
      "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    ])
    const standard = lines.slice(lines.indexOf("BEGIN:STANDARD"), lines.indexOf("END:STANDARD"))
    expect(standard).toEqual([
      "BEGIN:STANDARD",
      "TZOFFSETFROM:-0400",
      "TZOFFSETTO:-0500",
      "DTSTART:19701101T020000",
      "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    ])
    expect(lines).toContain("UID:m1@project-meetings")
    expect(lines).toContain("DTSTAMP:20261012T190000Z")
  })

  it("writes Europe's last-Sunday changes as the last Sunday", () => {
    const lines = linesOf(meetingCalendarFile(meeting({ timeZone: "Europe/Berlin" }), AT))
    expect(lines).toContain("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU")
    expect(lines).toContain("RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU")
    expect(lines).toContain("DTSTART:19700329T020000")
    expect(lines).toContain("DTSTART:19701025T030000")
  })

  it("gives a zone without clock changes its one offset", () => {
    const lines = linesOf(meetingCalendarFile(meeting({ timeZone: "Asia/Kolkata" }), AT))
    expect(lines).toContain("TZOFFSETTO:+0530")
    expect(lines).not.toContain("BEGIN:DAYLIGHT")
  })

  it("repeats every 2 weeks, or not at all", () => {
    expect(linesOf(meetingCalendarFile(meeting({ repeatEvery: "two_weeks" }), AT))).toContain(
      "RRULE:FREQ=WEEKLY;INTERVAL=2"
    )
    expect(meetingCalendarFile(meeting({ repeatEvery: null }), AT)).not.toContain("RRULE:FREQ=WEEKLY")
  })

  it("carries the video link, escapes the name and folds long lines", () => {
    const file = meetingCalendarFile(meeting({ title: "Plans, prices; and \\ notes" }), AT)
    const lines = linesOf(file)
    expect(lines).toContain("SUMMARY:Plans\\, prices\\; and \\\\ notes")
    // A line break of any kind stays inside the one line.
    expect(linesOf(meetingCalendarFile(meeting({ title: "One\rTwo\r\nThree" }), AT))).toContain(
      "SUMMARY:One\\nTwo\\nThree"
    )
    expect(lines).toContain("URL:https://meet.google.com/abc-defg-hij")
    expect(lines.find((line) => line.startsWith("DESCRIPTION:"))).toContain(
      "Join: https://meet.google.com/abc-defg-hij\\n\\nAdded from Project."
    )
    for (const raw of file.split("\r\n")) expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(75)
    expect(file.endsWith("END:VCALENDAR\r\n")).toBe(true)
  })

  it("leaves the link out when there is none", () => {
    const file = meetingCalendarFile(meeting({ videoUrl: null }), AT)
    expect(file).not.toContain("URL:")
    expect(file).not.toContain("Join:")
  })

  it("names the file after the meeting", () => {
    expect(calendarFileName("Weekly client call")).toBe("weekly-client-call.ics")
    expect(calendarFileName("1:1 · Ben & Anna")).toBe("1-1-ben-anna.ics")
    expect(calendarFileName("…")).toBe("meeting.ics")
  })
})
