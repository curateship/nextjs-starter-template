import { describe, expect, it } from "vitest"

import {
  cleanCustomFields,
  cleanCustomValues,
  customSectionsForDisplay,
  formCustomValues,
  freeCustomKey,
  MAX_CUSTOM_REPEATER_ROWS,
  MAX_CUSTOM_TAGS,
  type CustomSection,
} from "@/lib/directory/custom-fields"

/**
 * The rules for a site's invented fields. Two things are being protected here
 * and everything else is detail: a value is only ever kept when the site
 * defines a field for it, and anything a browser would follow or render is
 * cleaned by the cleaners the rest of the app already uses.
 */

function section(fields: unknown, overrides: Partial<CustomSection> = {}) {
  return {
    id: "section-1",
    name: "The wine",
    slug: "the_wine",
    layout: "stack" as const,
    displayOrder: 0,
    fields: cleanCustomFields(fields),
    ...overrides,
  }
}

describe("field definitions", () => {
  it("makes a key from the label when a field has none", () => {
    const [field] = cleanCustomFields([{ label: "Grape variety", type: "text" }])
    expect(field.key).toBe("grape_variety")
  })

  it("keeps a field's key when its label is rewritten", () => {
    // The whole point: every listing's answers are filed under the key, so a
    // rename that moved it would lose them.
    const [field] = cleanCustomFields([
      { key: "grape", label: "Which grape, exactly", type: "text" },
    ])
    expect(field.key).toBe("grape")
  })

  it("does not give a new field a key an existing one is holding", () => {
    const fields = cleanCustomFields([
      { label: "Grape", type: "text" },
      { key: "grape", label: "Grape", type: "text" },
    ])
    expect(fields.map((field) => field.key)).toEqual(["grape_2", "grape"])
  })

  it("drops a field with no name and one of an unknown kind", () => {
    expect(
      cleanCustomFields([
        { label: "   ", type: "text" },
        { label: "Fine", type: "not-a-kind" },
        { label: "Kept", type: "text" },
      ])
    ).toHaveLength(1)
  })

  it("keeps a repeater one level deep", () => {
    const [field] = cleanCustomFields([
      {
        label: "Classes",
        type: "repeater",
        fields: [
          { label: "Name", type: "text" },
          { label: "Nested", type: "repeater", fields: [] },
        ],
      },
    ])
    expect(field.type).toBe("repeater")
    expect(field.type === "repeater" && field.fields.map((row) => row.label)).toEqual([
      "Name",
    ])
  })

  it("gives a new choice a value made from its wording and keeps an old one", () => {
    const [field] = cleanCustomFields([
      {
        label: "Colour",
        type: "select",
        options: [
          { label: "Deep red" },
          { value: "white", label: "Now called something else" },
        ],
      },
    ])
    expect(
      field.type === "select" && field.options.map((option) => option.value)
    ).toEqual(["deep_red", "white"])
  })

  it("only a choice keeps options", () => {
    const [field] = cleanCustomFields([
      { label: "Vintage", type: "number", options: [{ label: "Red" }] },
    ])
    expect(field.type !== "repeater" && field.options).toEqual([])
  })

  it("numbers a key past a clash", () => {
    expect(freeCustomKey("grape", ["grape", "grape_2"])).toBe("grape_3")
  })
})

describe("values", () => {
  it("keeps nothing for a field the site does not define", () => {
    const definitions = [section([{ label: "Grape", type: "text" }])]
    expect(
      cleanCustomValues(definitions, {
        the_wine: { grape: "Nebbiolo", secret: "not a field" },
        made_up: { anything: "at all" },
      })
    ).toEqual({ the_wine: { grape: "Nebbiolo" } })
  })

  it("stores nothing blank, so an untouched section has no key at all", () => {
    const definitions = [
      section([
        { label: "Grape", type: "text" },
        { label: "Organic", type: "toggle" },
      ]),
    ]
    expect(
      cleanCustomValues(definitions, {
        the_wine: { grape: "   ", organic: false },
      })
    ).toEqual({})
  })

  it("refuses a link the browser would treat as a script", () => {
    const definitions = [section([{ label: "Menu", type: "link" }])]
    expect(
      cleanCustomValues(definitions, {
        the_wine: { menu: "javascript:alert(1)" },
      })
    ).toEqual({})
  })

  it("puts https in front of a bare domain", () => {
    const definitions = [section([{ label: "Menu", type: "link" }])]
    expect(
      cleanCustomValues(definitions, { the_wine: { menu: "example.com" } })
    ).toEqual({ the_wine: { menu: "https://example.com" } })
  })

  it("refuses a picture address that is not a picture address", () => {
    const definitions = [section([{ label: "Label", type: "image" }])]
    expect(
      cleanCustomValues(definitions, {
        the_wine: { label: "data:text/html;base64,PHNjcmlwdD4=" },
      })
    ).toEqual({})
  })

  it("keeps written text as nodes and drops markup that is not allowed", () => {
    const definitions = [section([{ label: "Notes", type: "richText" }])]
    const cleaned = cleanCustomValues(definitions, {
      the_wine: {
        notes: {
          type: "doc",
          content: [
            { type: "script", content: [{ type: "text", text: "alert(1)" }] },
            { type: "paragraph", content: [{ type: "text", text: "Kept" }] },
          ],
        },
      },
    })
    expect(JSON.stringify(cleaned)).not.toContain("script")
    expect(JSON.stringify(cleaned)).toContain("Kept")
  })

  it("only accepts one of a choice's own answers", () => {
    const definitions = [
      section([
        {
          label: "Colour",
          type: "select",
          options: [{ label: "Red" }, { label: "White" }],
        },
      ]),
    ]
    expect(
      cleanCustomValues(definitions, { the_wine: { colour: "purple" } })
    ).toEqual({})
    expect(
      cleanCustomValues(definitions, { the_wine: { colour: "red" } })
    ).toEqual({ the_wine: { colour: "red" } })
  })

  it("caps tags and drops repeats", () => {
    const definitions = [section([{ label: "Notes", type: "tags" }])]
    const many = Array.from({ length: MAX_CUSTOM_TAGS + 10 }, (_, i) => `t${i}`)
    const cleaned = cleanCustomValues(definitions, {
      the_wine: { notes: [...many, "t0"] },
    })
    expect((cleaned.the_wine.notes as string[]).length).toBe(MAX_CUSTOM_TAGS)
  })

  it("drops a repeating row nobody filled in and caps the rest", () => {
    const definitions = [
      section([
        {
          label: "Classes",
          type: "repeater",
          fields: [{ label: "Name", type: "text" }],
        },
      ]),
    ]
    const rows = Array.from(
      { length: MAX_CUSTOM_REPEATER_ROWS + 5 },
      (_, index) => ({ name: `Class ${index}` })
    )
    const cleaned = cleanCustomValues(definitions, {
      the_wine: { classes: [{ name: "  " }, ...rows] },
    })
    expect((cleaned.the_wine.classes as unknown[]).length).toBe(
      MAX_CUSTOM_REPEATER_ROWS
    )
  })

  it("a number that is not a number is no answer", () => {
    const definitions = [section([{ label: "Vintage", type: "number" }])]
    expect(
      cleanCustomValues(definitions, { the_wine: { vintage: "twelve" } })
    ).toEqual({})
    expect(
      cleanCustomValues(definitions, { the_wine: { vintage: "1998" } })
    ).toEqual({ the_wine: { vintage: 1998 } })
  })
})

describe("what the page shows", () => {
  const definitions = [
    section([
      { label: "Grape", type: "text" },
      { label: "Organic", type: "toggle" },
      {
        label: "Colour",
        type: "select",
        options: [{ label: "Deep red" }],
      },
    ]),
  ]

  it("leaves out a section with nothing filled in", () => {
    expect(customSectionsForDisplay(definitions, {})).toEqual([])
  })

  it("shows a choice's wording, not what is stored", () => {
    const [view] = customSectionsForDisplay(definitions, {
      the_wine: { colour: "deep_red" },
    })
    expect(view.fields).toHaveLength(1)
    expect(view.fields[0].value).toBe("Deep red")
  })

  it("shows a choice's wording inside a repeating row too", () => {
    const withRows = [
      section([
        {
          label: "Classes",
          type: "repeater",
          fields: [
            { label: "Name", type: "text" },
            { label: "Level", type: "select", options: [{ label: "Beginners" }] },
          ],
        },
      ]),
    ]
    const [view] = customSectionsForDisplay(withRows, {
      the_wine: { classes: [{ name: "Pilates", level: "beginners" }] },
    })
    expect(view.fields[0].rows[0].map((entry) => entry.value)).toEqual([
      "Pilates",
      "Beginners",
    ])
  })

  it("shows a yes and stays quiet about a no", () => {
    expect(
      customSectionsForDisplay(definitions, { the_wine: { organic: true } })
    ).toHaveLength(1)
    expect(
      customSectionsForDisplay(definitions, { the_wine: { organic: false } })
    ).toEqual([])
  })
})

describe("the form's copy of the values", () => {
  it("fills in a blank for every field, so no control arrives empty-handed", () => {
    const definitions = [
      section([
        { label: "Grape", type: "text" },
        { label: "Organic", type: "toggle" },
      ]),
    ]
    expect(formCustomValues(definitions, { the_wine: { grape: "Merlot" } })).toEqual(
      { the_wine: { grape: "Merlot", organic: false } }
    )
  })
})
