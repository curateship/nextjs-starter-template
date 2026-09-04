import { describe, expect, it } from "vitest"

import {
  FRONT_PAGE_ROW_KINDS,
  FRONT_PAGE_ROW_LAYOUTS,
  MAX_FRONT_PAGE_FAQ_ITEMS,
  MAX_FRONT_PAGE_LOGOS,
  MAX_FRONT_PAGE_ROWS,
  MAX_FRONT_PAGE_SCREENSHOTS,
  MAX_FRONT_PAGE_TESTIMONIALS,
  frontPageHasPlans,
  frontPageRowImageUrls,
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

  it("normalizes every fixed content kind and keeps its entry order", () => {
    const rows = normalizeFrontPageRows([
      {
        id: "testimonials",
        heading: "What customers say",
        kind: "testimonials",
        layout: "wide",
        items: [
          {
            id: "first",
            quote: " Fast and clear. ",
            name: " Ava ",
            role: " Founder ",
            picture: "https://media.example.test/ava.png",
          },
          { id: "empty", quote: "", name: "Nobody" },
          { id: "second", quote: "Easy to use.", name: "Noah" },
        ],
      },
      {
        id: "faq",
        heading: "Questions",
        kind: "faq",
        items: [
          { id: "price", question: " How much? ", answer: " Ten dollars. " },
        ],
      },
      {
        id: "logos",
        heading: "Used by",
        kind: "logos",
        items: [
          {
            id: "acme",
            image: "https://media.example.test/acme.png",
            alt: " Acme ",
          },
        ],
      },
      {
        id: "screens",
        heading: "See the product",
        kind: "screenshots",
        items: [
          {
            id: "dashboard",
            image: "https://media.example.test/dashboard.png",
            caption: " Dashboard overview ",
          },
        ],
      },
    ])

    expect(rows).toMatchObject([
      {
        kind: "testimonials",
        items: [
          { id: "first", quote: "Fast and clear.", name: "Ava" },
          { id: "second", quote: "Easy to use.", name: "Noah" },
        ],
      },
      {
        kind: "faq",
        items: [{ id: "price", question: "How much?", answer: "Ten dollars." }],
      },
      { kind: "logos", items: [{ id: "acme", alt: "Acme" }] },
      {
        kind: "screenshots",
        items: [{ id: "dashboard", caption: "Dashboard overview" }],
      },
    ])
    expect(frontPageRowImageUrls(rows)).toEqual([
      "https://media.example.test/ava.png",
      "https://media.example.test/acme.png",
      "https://media.example.test/dashboard.png",
    ])
  })

  it("drops empty content rows and unsafe image addresses", () => {
    const rows = normalizeFrontPageRows([
      {
        id: "empty-faq",
        heading: "Questions",
        kind: "faq",
        items: [{ question: "Question without an answer", answer: "" }],
      },
      {
        id: "safe-testimonial",
        heading: "Customers",
        kind: "logos",
        items: [{ image: "javascript:alert(1)", alt: "Bad logo" }],
      },
      {
        id: "safe-testimonial",
        heading: "Customers",
        kind: "testimonials",
        items: [
          {
            quote: "The words survive.",
            name: "Ava",
            picture: "file:///tmp/avatar.png",
          },
        ],
      },
    ])

    expect(rows).toEqual([
      {
        id: "safe-testimonial",
        heading: "Customers",
        intro: "",
        kind: "testimonials",
        layout: "wide",
        items: [
          {
            id: "front-page-testimonial-1",
            quote: "The words survive.",
            name: "Ava",
            role: "",
            picture: "",
          },
        ],
      },
    ])
  })

  it("caps the number of entries stored by every content kind", () => {
    const rows = normalizeFrontPageRows([
      {
        heading: "Testimonials",
        kind: "testimonials",
        items: Array.from(
          { length: MAX_FRONT_PAGE_TESTIMONIALS + 2 },
          (_, index) => ({ quote: `Quote ${index}`, name: `Name ${index}` })
        ),
      },
      {
        heading: "FAQ",
        kind: "faq",
        items: Array.from(
          { length: MAX_FRONT_PAGE_FAQ_ITEMS + 2 },
          (_, index) => ({
            question: `Question ${index}`,
            answer: `Answer ${index}`,
          })
        ),
      },
      {
        heading: "Logos",
        kind: "logos",
        items: Array.from({ length: MAX_FRONT_PAGE_LOGOS + 2 }, (_, index) => ({
          image: `https://media.example.test/logo-${index}.png`,
          alt: `Logo ${index}`,
        })),
      },
      {
        heading: "Screenshots",
        kind: "screenshots",
        items: Array.from(
          { length: MAX_FRONT_PAGE_SCREENSHOTS + 2 },
          (_, index) => ({
            image: `https://media.example.test/screen-${index}.png`,
            caption: `Screen ${index}`,
          })
        ),
      },
    ])

    expect(rows.map((row) => ("items" in row ? row.items.length : 0))).toEqual([
      MAX_FRONT_PAGE_TESTIMONIALS,
      MAX_FRONT_PAGE_FAQ_ITEMS,
      MAX_FRONT_PAGE_LOGOS,
      MAX_FRONT_PAGE_SCREENSHOTS,
    ])
  })
})
