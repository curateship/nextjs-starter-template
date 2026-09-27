import { describe, expect, it } from "vitest"

import {
  APP_FRONT_PAGE_ROW_KIND,
  FRONT_PAGE_ROW_KINDS,
  FRONT_PAGE_ROW_LAYOUTS,
  MAX_APP_FRONT_PAGE_ROW_SETTINGS_LENGTH,
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
        alignment: "inherit",
        hidden: false,
        showHeading: true,
        showIntro: true,
        showImage: true,
        showAction: true,
        showStars: true,
        showNote: true,
        showPictures: true,
        showRoles: true,
        showNumbers: true,
        showCaptions: true,
        device: "all",
      },
      {
        id: "pricing",
        heading: "Plans",
        intro: "Pick one.",
        kind: "plans",
        layout: "wide",
        alignment: "inherit",
        hidden: false,
        showHeading: true,
        showIntro: true,
        showImage: true,
        showAction: true,
        showStars: true,
        showNote: true,
        showPictures: true,
        showRoles: true,
        showNumbers: true,
        showCaptions: true,
        device: "all",
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
        alignment: "inherit",
        hidden: false,
        showHeading: true,
        showIntro: true,
        showImage: true,
        showAction: true,
        showStars: true,
        showNote: true,
        showPictures: true,
        showRoles: true,
        showNumbers: true,
        showCaptions: true,
        device: "all",
      },
      {
        id: "front-page-row-2-2",
        heading: "Again",
        intro: "",
        kind: "text",
        layout: "wide",
        alignment: "inherit",
        hidden: false,
        showHeading: true,
        showIntro: true,
        showImage: true,
        showAction: true,
        showStars: true,
        showNote: true,
        showPictures: true,
        showRoles: true,
        showNumbers: true,
        showCaptions: true,
        device: "all",
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
        alignment: "inherit",
        hidden: false,
        showHeading: true,
        showIntro: true,
        showImage: true,
        showAction: true,
        showStars: true,
        showNote: true,
        showPictures: true,
        showRoles: true,
        showNumbers: true,
        showCaptions: true,
        device: "all",
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

  /**
   * A row of a kind an app added. The shell keeps the app's key and its
   * settings and reads neither, so an app can change what its own rows hold
   * without the shell knowing.
   */
  it("keeps a row of a kind the app added, settings and all", () => {
    const rows = normalizeFrontPageRows([
      {
        id: "listings",
        heading: "New this week",
        kind: APP_FRONT_PAGE_ROW_KIND,
        appKind: "listings",
        settings: { category: "cafes", count: 8, featuredOnly: true },
      },
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: APP_FRONT_PAGE_ROW_KIND,
      appKind: "listings",
      settings: { category: "cafes", count: 8, featuredOnly: true },
    })
  })

  it("drops an app row whose key or settings are not what they should be", () => {
    const rows = normalizeFrontPageRows([
      {
        id: "shouty",
        heading: "Shouty",
        kind: APP_FRONT_PAGE_ROW_KIND,
        appKind: "Listings",
        settings: {},
      },
      {
        id: "listy",
        heading: "A list, not an object",
        kind: APP_FRONT_PAGE_ROW_KIND,
        appKind: "listings",
        settings: ["nope"],
      },
      {
        id: "huge",
        heading: "Too much",
        kind: APP_FRONT_PAGE_ROW_KIND,
        appKind: "listings",
        settings: { blob: "x".repeat(MAX_APP_FRONT_PAGE_ROW_SETTINGS_LENGTH) },
      },
    ])

    expect(rows).toEqual([])
  })
})
