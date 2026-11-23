import { describe, expect, it } from "vitest"

import { buildCsv, buildFocusHistoryCsv, csvCell, focusHistoryFileName } from "@/lib/report-csv"

describe("csvCell", () => {
  it("passes plain values through unchanged", () => {
    expect(csvCell("Write launch notes")).toBe("Write launch notes")
    expect(csvCell(25)).toBe("25")
    expect(csvCell(12.5)).toBe("12.5")
  })

  it("quotes commas, quotes, and newlines per RFC 4180", () => {
    expect(csvCell("plan, review")).toBe('"plan, review"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"')
    expect(csvCell("line one\r\nline two")).toBe('"line one\r\nline two"')
  })

  it("keeps unicode intact", () => {
    expect(csvCell("café ☕ 集中")).toBe("café ☕ 集中")
  })

  it("neutralizes formula-leading cells for spreadsheets", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)")
    expect(csvCell("+123")).toBe("'+123")
    expect(csvCell("-payload")).toBe("'-payload")
    expect(csvCell("@import")).toBe("'@import")
    expect(csvCell("\tstart")).toBe("'\tstart")
  })

  it("quotes a formula cell that also contains separators", () => {
    expect(csvCell('=HYPERLINK("http://x", "y")')).toBe('"\'=HYPERLINK(""http://x"", ""y"")"')
  })
})

describe("buildCsv", () => {
  it("joins rows with CRLF and ends with a newline", () => {
    expect(buildCsv([["a", "b"], ["1", "2"]])).toBe("a,b\r\n1,2\r\n")
  })
})

describe("buildFocusHistoryCsv", () => {
  it("renders sessions with minutes and neutral labels for removed tasks", () => {
    const csv = buildFocusHistoryCsv([
      { localDate: "2026-07-15", localTime: "09:30", taskTitle: "Deep work, part 1", plannedSeconds: 1_500, accumulatedSeconds: 1_500 },
      { localDate: "2026-07-16", localTime: "14:05", taskTitle: null, plannedSeconds: 1_500, accumulatedSeconds: 903 },
      { localDate: "2026-07-16", localTime: "15:00", taskTitle: "=2+5", plannedSeconds: 3_000, accumulatedSeconds: 3_000 },
    ])
    expect(csv.split("\r\n")).toEqual([
      "Date,Completed at,Task,Planned minutes,Focused minutes",
      '2026-07-15,09:30,"Deep work, part 1",25,25',
      "2026-07-16,14:05,No task,25,15.1",
      "2026-07-16,15:00,'=2+5,50,50",
      "",
    ])
  })
})

describe("focusHistoryFileName", () => {
  it("is stable and derived from the local report range", () => {
    expect(focusHistoryFileName("30d", "2026-06-17", "2026-07-16")).toBe("pomoder-focus-30d-2026-06-17-to-2026-07-16.csv")
  })
})
