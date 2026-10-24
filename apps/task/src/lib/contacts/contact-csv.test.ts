import { describe, expect, it } from "vitest"

import {
  guessImportField,
  parseCsv,
  readImportRows,
  SAMPLE_CONTACTS_CSV,
} from "@/lib/contacts/contact-csv"

describe("parseCsv", () => {
  it("reads quoted cells holding commas, quotes and line breaks", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"\nthere'],
    ])
  })

  it("drops blank lines and the byte-order mark a spreadsheet adds", () => {
    expect(parseCsv("\uFEFFemail\n\n  \nmaya@example.com")).toEqual([
      ["email"],
      ["maya@example.com"],
    ])
  })

  it("reads a semicolon file, as European spreadsheets save one", () => {
    expect(parseCsv("email;name\nmaya@example.com;Maya Chen")).toEqual([
      ["email", "name"],
      ["maya@example.com", "Maya Chen"],
    ])
  })
})

describe("guessImportField", () => {
  it("knows the usual headings", () => {
    expect(
      ["Email Address", "first_name", "Surname", "Name", "Tags", "Phone"].map(guessImportField)
    ).toEqual(["email", "firstName", "lastName", "name", "tags", "skip"])
  })
})

describe("readImportRows", () => {
  it("reads the sample file as three people", () => {
    const [heading = [], ...rows] = parseCsv(SAMPLE_CONTACTS_CSV)
    const { rows: read, invalid } = readImportRows(rows, heading.map(guessImportField))
    expect(invalid).toBe(0)
    expect(read).toEqual([
      { email: "maya@example.com", firstName: "Maya", lastName: "Chen", tags: ["creator", "podcast"] },
      { email: "jordan@example.com", firstName: "Jordan", lastName: "Reyes", tags: ["course"] },
      { email: "sam@example.com", firstName: "Sam", lastName: null, tags: [] },
    ])
  })

  it("counts a row with no real address instead of sending it", () => {
    const { rows, invalid } = readImportRows(
      [["not an address"], [""], ["Ada@Example.com"]],
      ["email"]
    )
    expect(invalid).toBe(2)
    expect(rows.map((row) => row.email)).toEqual(["ada@example.com"])
  })

  it("splits a full name and adds the tags picked for everybody", () => {
    const { rows } = readImportRows(
      [["ada@example.com", "Ada King Lovelace"]],
      ["email", "name"],
      ["imported"]
    )
    expect(rows[0]).toEqual({
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "King Lovelace",
      tags: ["imported"],
    })
  })
})
