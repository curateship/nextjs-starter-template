import { describe, expect, it } from "vitest"

import { cleanCustomFields, type CustomSection } from "@/lib/directory/custom-fields"
import {
  fieldFilterConditions,
  fieldFilterToken,
  readDirectoryFieldFilters,
  tickedFieldFilterNames,
  toggleDirectoryFieldFilter,
} from "@/lib/directory/field-filters"

const section: CustomSection = {
  id: "s1",
  name: "Amenities",
  slug: "amenities",
  layout: "stack",
  displayOrder: 0,
  fields: cleanCustomFields([
    { label: "Has wifi", type: "toggle", filter: true },
    {
      label: "Price",
      type: "select",
      filter: true,
      options: [
        { label: "Cheap", value: "cheap" },
        { label: "Fancy", value: "fancy" },
      ],
    },
    { label: "Dog friendly", type: "toggle" },
  ]),
}

describe("the field filters in the address", () => {
  it("reads a comma list, dropping blanks and repeats", () => {
    expect(
      readDirectoryFieldFilters(" amenities.has_wifi,,amenities.has_wifi,x ")
    ).toEqual(["amenities.has_wifi", "x"])
    expect(readDirectoryFieldFilters(undefined)).toEqual([])
    expect(readDirectoryFieldFilters(42)).toEqual([])
  })

  it("caps a pasted address at twenty", () => {
    const many = Array.from({ length: 50 }, (_, index) => `a.f${index}`)
    expect(readDirectoryFieldFilters(many.join(","))).toHaveLength(20)
  })

  it("adds a box on the first click and takes it out on the second", () => {
    const on = toggleDirectoryFieldFilter(undefined, "amenities.has_wifi")
    expect(on).toBe("amenities.has_wifi")
    expect(toggleDirectoryFieldFilter(on, "amenities.has_wifi")).toBeUndefined()
  })

  it("keeps a comma inside an answer from splitting the list", () => {
    const token = fieldFilterToken("amenities", "price", "a, b")
    expect(token).toBe("amenities.price:a%2C%20b")
    expect(readDirectoryFieldFilters(`${token},amenities.has_wifi`)).toEqual([
      token,
      "amenities.has_wifi",
    ])
  })
})

describe("matching the address against the site's fields", () => {
  it("turns ticked boxes into one condition per field", () => {
    expect(
      fieldFilterConditions(
        [section],
        [
          "amenities.price:fancy",
          "amenities.has_wifi",
          "amenities.price:cheap",
        ]
      )
    ).toEqual([
      { section: "amenities", key: "has_wifi", kind: "toggle" },
      {
        section: "amenities",
        key: "price",
        kind: "select",
        answers: ["cheap", "fancy"],
      },
    ])
  })

  it("drops a field that is not a filter, an unknown answer and another section", () => {
    expect(
      fieldFilterConditions(
        [section],
        [
          "amenities.dog_friendly",
          "amenities.price:pricey",
          "other.has_wifi",
        ]
      )
    ).toEqual([])
  })

  it("names the ticked boxes the way a visitor reads them", () => {
    expect(
      tickedFieldFilterNames(
        [
          {
            id: "amenities.has_wifi",
            name: "Has wifi",
            sectionName: "Amenities",
            kind: "toggle",
            options: [{ slug: "amenities.has_wifi", name: "Has wifi", count: 3 }],
          },
          {
            id: "amenities.price",
            name: "Price",
            sectionName: "Amenities",
            kind: "select",
            options: [
              { slug: "amenities.price:cheap", name: "Cheap", count: 2 },
            ],
          },
        ],
        ["amenities.price:cheap", "amenities.has_wifi"]
      )
    ).toEqual(["Has wifi", "Price: Cheap"])
  })
})

describe("which fields may be filters", () => {
  it("keeps the mark on a yes or no and a choice only", () => {
    const fields = cleanCustomFields([
      { label: "Wifi", type: "toggle", filter: true },
      { label: "Price", type: "select", filter: true, options: [] },
      { label: "Notes", type: "text", filter: true },
      { label: "Seats", type: "number", filter: true },
      { label: "Tags", type: "tags", filter: true },
      {
        label: "Classes",
        type: "repeater",
        filter: true,
        fields: [{ label: "Open", type: "toggle", filter: true }],
      },
    ])
    expect(
      fields.map((field) =>
        field.type === "repeater"
          ? field.fields.map((row) => row.filter)
          : field.filter
      )
    ).toEqual([true, true, false, false, false, [false]])
  })

  it("leaves a field unmarked when the mark is anything but true", () => {
    const [field] = cleanCustomFields([
      { label: "Wifi", type: "toggle", filter: "yes" },
    ])
    expect(field?.type !== "repeater" && field?.filter).toBe(false)
  })
})
