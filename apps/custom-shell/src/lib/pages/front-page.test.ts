import { describe, expect, it } from "vitest"

import {
  FRONT_PAGE_ROW_KINDS,
  FRONT_PAGE_ROW_LAYOUTS,
  MAX_FRONT_PAGE_ROWS,
  frontPageHasPlans,
  normalizeFrontPageRows,
} from "@/lib/pages/front-page"

describe("front page rows", () => {
  it("keeps valid rows in their saved order", () => {
    const rows = normalizeFrontPageRows([
      {
        id: "welcome",
        heading: " Welcome ",
        intro: " Start here. ",
        kind: "text",
        layout: "narrow",
      },
      {
        id: "pricing",
        heading: "Plans",
        intro: "Pick one.",
        kind: "plans",
        layout: "wide",
      },
    ])

    expect(rows).toEqual([
      {
        id: "welcome",
        heading: "Welcome",
        intro: "Start here.",
        kind: "text",
        layout: "narrow",
      },
      {
        id: "pricing",
        heading: "Plans",
        intro: "Pick one.",
        kind: "plans",
        layout: "wide",
      },
    ])
    expect(frontPageHasPlans(rows)).toBe(true)
  })

  it("drops incomplete rows and repairs unsafe fields", () => {
    const rows = normalizeFrontPageRows([
      { id: "empty", heading: "   ", intro: "Not enough" },
      {
        id: "../../unsafe",
        heading: "About",
        kind: "unknown",
        layout: "unknown",
      },
      { id: "front-page-row-2", heading: "Again" },
    ])

    expect(rows).toEqual([
      {
        id: "front-page-row-2",
        heading: "About",
        intro: "",
        kind: FRONT_PAGE_ROW_KINDS[0],
        layout: FRONT_PAGE_ROW_LAYOUTS[0],
      },
      {
        id: "front-page-row-2-2",
        heading: "Again",
        intro: "",
        kind: "text",
        layout: "wide",
      },
    ])
  })

  it("keeps repaired duplicate ids within the stored length limit", () => {
    const id = "a".repeat(96)
    const rows = normalizeFrontPageRows([
      { id, heading: "First" },
      { id, heading: "Second" },
    ])

    expect(rows.map((row) => row.id)).toEqual([
      id,
      `${"a".repeat(94)}-2`,
    ])
    expect(new Set(rows.map((row) => row.id)).size).toBe(2)
  })

  it("keeps at most six usable rows", () => {
    const rows = normalizeFrontPageRows([
      { heading: "" },
      ...Array.from({ length: MAX_FRONT_PAGE_ROWS + 2 }, (_, index) => ({
        id: `row-${index}`,
        heading: `Row ${index}`,
      })),
    ])

    expect(rows).toHaveLength(MAX_FRONT_PAGE_ROWS)
    expect(rows.map((row) => row.heading)).toEqual([
      "Row 0",
      "Row 1",
      "Row 2",
      "Row 3",
      "Row 4",
      "Row 5",
    ])
    expect(frontPageHasPlans(rows)).toBe(false)
  })
})
