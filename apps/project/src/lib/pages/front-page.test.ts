import { describe, expect, it } from "vitest"

import {
  APP_FRONT_PAGE_ROW_KIND,
  FRONT_PAGE_ROW_KIND_LABELS,
  FRONT_PAGE_ROW_KINDS,
  FRONT_PAGE_ROW_LAYOUTS,
  MAX_APP_FRONT_PAGE_ROW_SETTINGS_LENGTH,
  MAX_FRONT_PAGE_FAQ_ITEMS,
  MAX_FRONT_PAGE_LOGOS,
  MAX_FRONT_PAGE_ROW_SPACE,
  MAX_FRONT_PAGE_ROWS,
  MAX_FRONT_PAGE_SCREENSHOTS,
  MAX_FRONT_PAGE_TESTIMONIALS,
  createAppFrontPageRowDraft,
  createFrontPageRowDraft,
  frontPageHasPlans,
  frontPageHeroBandColors,
  frontPageRowImageUrls,
  normalizeFrontPageHeroBackground,
  MAX_FRONT_PAGE_LISTED_PAGES,
  normalizeFrontPageListedPageIds,
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
        spaceAbove: null,
        spaceBelow: null,
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
        spaceAbove: null,
        spaceBelow: null,
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
        spaceAbove: null,
        spaceBelow: null,
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
        spaceAbove: null,
        spaceBelow: null,
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

  /**
   * A front page held six rows until 27 Sep 2026, when Tyler took the cap off.
   * A row with no heading is still dropped, and the stored list is still
   * bounded so a hand-edited settings row cannot be any length at all.
   */
  it("keeps every usable row, and drops the ones with no heading", () => {
    const rows = normalizeFrontPageRows([
      { heading: "" },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `row-${index}`,
        heading: `Row ${index}`,
      })),
    ])

    expect(rows.map((row) => row.heading)).toEqual(
      Array.from({ length: 10 }, (_, index) => `Row ${index}`)
    )
    expect(frontPageHasPlans(rows)).toBe(false)
  })

  it("stops at the stored list's own bound", () => {
    const rows = normalizeFrontPageRows(
      Array.from({ length: MAX_FRONT_PAGE_ROWS + 5 }, (_, index) => ({
        id: `row-${index}`,
        heading: `Row ${index}`,
      }))
    )

    expect(rows).toHaveLength(MAX_FRONT_PAGE_ROWS)
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

  it("strips an unusable entry and keeps the block it was in", () => {
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
        id: "safe-testimonial-2",
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

    // The half-typed question and the `javascript:` logo are gone, and the two
    // blocks that held them stay, empty, with their headings. A block is a
    // place for entries; it does not stop being one because the entry somebody
    // tried to put in it was unusable.
    expect(rows.map((row) => [row.id, row.kind])).toEqual([
      ["empty-faq", "faq"],
      ["safe-testimonial", "logos"],
      ["safe-testimonial-2", "testimonials"],
    ])
    expect(rows[0]).toMatchObject({ kind: "faq", items: [] })
    expect(rows[1]).toMatchObject({ kind: "logos", items: [] })

    expect(rows[2]).toEqual({
        id: "safe-testimonial-2",
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
        spaceAbove: null,
        spaceBelow: null,
        items: [
          {
            id: "front-page-testimonial-1",
            quote: "The words survive.",
            name: "Ava",
            role: "",
            picture: "",
          },
        ],
    })
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

describe("a block's own spacing", () => {
  const rowWith = (space: Record<string, unknown>) =>
    normalizeFrontPageRows([{ kind: "text", heading: "Words", ...space }])[0]

  it("keeps a whole number on either side, zero included", () => {
    const row = rowWith({ spaceAbove: 0, spaceBelow: 120 })
    expect(row.spaceAbove).toBe(0)
    expect(row.spaceBelow).toBe(120)
  })

  it("reads a block saved before these existed as following the page", () => {
    const row = rowWith({})
    expect(row.spaceAbove).toBeNull()
    expect(row.spaceBelow).toBeNull()
  })

  /**
   * Null is "follow the page", so anything unusable has to land there rather
   * than on a number nobody chose. A hand-edited row can only ever fall back
   * to the page's own spacing.
   */
  it("falls back to the page for anything out of range or not a number", () => {
    for (const bad of [-1, 161, 1e9, Number.NaN, "80", null, {}, []]) {
      expect(rowWith({ spaceAbove: bad }).spaceAbove).toBeNull()
    }
  })

  it("rounds a fraction rather than storing one", () => {
    expect(rowWith({ spaceAbove: 41.6 }).spaceAbove).toBe(42)
  })

  it("caps at the page's own ceiling", () => {
    expect(MAX_FRONT_PAGE_ROW_SPACE).toBe(160)
    expect(rowWith({ spaceBelow: MAX_FRONT_PAGE_ROW_SPACE }).spaceBelow).toBe(
      160
    )
  })

  it("starts a new block following the page on both sides", () => {
    for (const kind of FRONT_PAGE_ROW_KINDS) {
      const draft = createFrontPageRowDraft(kind)
      expect(draft.spaceAbove).toBeNull()
      expect(draft.spaceBelow).toBeNull()
    }
  })
})

describe("hero background", () => {
  it("keeps a muted grey and a hex, and drops anything else", () => {
    expect(normalizeFrontPageHeroBackground(" Grey-50 ")).toBe("grey-50")
    expect(normalizeFrontPageHeroBackground("grey-0")).toBe("grey-0")
    expect(normalizeFrontPageHeroBackground("#F4F4F5")).toBe("#f4f4f5")
    expect(normalizeFrontPageHeroBackground("grey-101")).toBe("")
    expect(normalizeFrontPageHeroBackground("grey")).toBe("")
    expect(normalizeFrontPageHeroBackground("red")).toBe("")
    expect(normalizeFrontPageHeroBackground("var(--muted)")).toBe("")
    expect(normalizeFrontPageHeroBackground("#fff")).toBe("")
  })

  it("darkens the grey in light mode and lightens it in dark as it strengthens", () => {
    const quiet = frontPageHeroBandColors("grey-0")
    const strong = frontPageHeroBandColors("grey-100")
    expect(quiet).toEqual({ light: "oklch(0.99 0 0)", dark: "oklch(0.175 0 0)" })
    expect(strong).toEqual({ light: "oklch(0.9 0 0)", dark: "oklch(0.32 0 0)" })
    expect(frontPageHeroBandColors("grey-50")).toEqual({
      light: "oklch(0.945 0 0)",
      dark: "oklch(0.2475 0 0)",
    })
  })

  it("paints a hex the same in both modes and nothing at all for junk", () => {
    expect(frontPageHeroBandColors("#f4f4f5")).toEqual({
      light: "#f4f4f5",
      dark: "#f4f4f5",
    })
    expect(frontPageHeroBandColors("url(evil)")).toEqual({ light: "", dark: "" })
  })
})

describe("a new block's starting values", () => {
  /**
   * Every kind, with nothing typed into it, survives the save. That is what
   * makes picking a kind the same thing as adding a block: the four list kinds
   * used to be dropped while they were empty, so an FAQ could not be written
   * at all and sat in the editor's list marked "Not added yet" with no way
   * out.
   */
  it("keeps a block of every kind the moment it is made", () => {
    for (const kind of FRONT_PAGE_ROW_KINDS) {
      const draft = createFrontPageRowDraft(kind)
      const [row] = normalizeFrontPageRows([{ ...draft, id: kind }])

      expect(row, `${kind} should survive`).toBeDefined()
      expect(row.kind).toBe(kind)
      // Nothing is lost or invented on the way through: what the editor starts
      // a block with is what the save keeps.
      expect(row).toEqual({ ...draft, id: kind })
    }
  })

  /**
   * Every kind arrives named after itself, so the block is something the page
   * can draw from the moment it is picked and joins the page there and then.
   * Left empty, a new block could not be added until a heading was typed,
   * which read as a block that could not be added at all.
   */
  it("names every kind after itself, so a new block can go on the page at once", () => {
    for (const kind of FRONT_PAGE_ROW_KINDS) {
      const draft = createFrontPageRowDraft(kind)
      expect(draft.heading).toBe(FRONT_PAGE_ROW_KIND_LABELS[kind])
      expect(draft.heading.trim()).not.toBe("")
    }
    // The divider's name is for the list beside it; its heading never reaches
    // the page at all.
    expect(createFrontPageRowDraft("divider").heading).toBe("Divider")
  })

  it("names an app's block after the app's own label for the kind", () => {
    expect(createAppFrontPageRowDraft("listings", "Latest listings").heading).toBe(
      "Latest listings"
    )
    // No label is still a name the page can draw rather than nothing.
    expect(createAppFrontPageRowDraft("listings").heading.trim()).not.toBe("")
  })

  it("starts an app's own block with no settings at all", () => {
    const draft = createAppFrontPageRowDraft("listings")
    expect(draft.kind).toBe(APP_FRONT_PAGE_ROW_KIND)
    const [row] = normalizeFrontPageRows([
      { ...draft, id: "listings", heading: "Latest listings" },
    ])
    expect(row).toEqual({
      ...draft,
      id: "listings",
      heading: "Latest listings",
    })
  })
})

describe("a Pages list block", () => {
  it("keeps the ids it names, once each, in order, and drops anything else", () => {
    const [row] = normalizeFrontPageRows([
      {
        id: "list",
        kind: "pages",
        heading: "What's on",
        pageIds: ["b", "a", "b", 7, "", "not an id", "x".repeat(37)],
      },
    ])
    expect(row).toMatchObject({ kind: "pages", pageIds: ["b", "a"] })
  })

  it("is kept with nothing picked yet, so it can be added and filled later", () => {
    const [row] = normalizeFrontPageRows([
      { ...createFrontPageRowDraft("pages"), id: "list" },
    ])
    expect(row).toMatchObject({ kind: "pages", pageIds: [] })
  })

  it("names at most as many pages as a block may show", () => {
    const ids = Array.from(
      { length: MAX_FRONT_PAGE_LISTED_PAGES + 5 },
      (_, index) => `page-${index}`
    )
    expect(normalizeFrontPageListedPageIds(ids)).toHaveLength(
      MAX_FRONT_PAGE_LISTED_PAGES
    )
  })
})
