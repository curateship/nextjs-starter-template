import { describe, expect, it } from "vitest"

import { guessLeadImportField, readLeadImportRows } from "@/lib/crm/lead-csv"

describe("reading a leads CSV file", () => {
  it("guesses the usual headings", () => {
    expect(["Email", "Name", "First name", "Surname", "Company", "Mobile phone", "Notes"].map(guessLeadImportField)).toEqual([
      "email",
      "name",
      "firstName",
      "lastName",
      "company",
      "phone",
      "skip",
    ])
  })

  it("joins first and last name, and leaves out a row with no real address", () => {
    const read = readLeadImportRows(
      [
        ["ADA@Example.com", "Ada", "Lovelace", "Engines Ltd", "0123"],
        ["not an address", "Bob", "", "", ""],
      ],
      ["email", "firstName", "lastName", "company", "phone"]
    )
    expect(read).toEqual({
      rows: [{ email: "ada@example.com", name: "Ada Lovelace", company: "Engines Ltd", phone: "0123" }],
      invalid: 1,
    })
  })
})
