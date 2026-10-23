import { describe, expect, it } from "vitest"

import { readDirection, readOneOf, readPage } from "@/lib/nav/list-search"
import { CONTACT_SORT_COLUMNS } from "@/lib/contacts/contact-sort"

/**
 * What a list page is allowed to read out of its own address.
 *
 * The sort column matters most. `CONTACT_SORT_COLUMNS` exists so the validator,
 * the endpoint and the query all read one list — and the failure it prevents is
 * silent: a column the validator does not know is dropped, the list quietly
 * reorders by the default, and nothing anywhere says so. Walking the whole list
 * here means adding a column without wiring it up cannot pass unnoticed.
 */
describe("the column a list is sorted by", () => {
  it("accepts every column the contacts list offers", () => {
    for (const column of CONTACT_SORT_COLUMNS) {
      expect(readOneOf(column, CONTACT_SORT_COLUMNS)).toBe(column)
    }
  })

  it("drops a column name nobody offers, rather than passing it on", () => {
    // The one that must never reach the database: it names a column, and
    // ordering by whatever the address said is how a list is made to sort by
    // something nobody chose.
    expect(readOneOf("password", CONTACT_SORT_COLUMNS)).toBeUndefined()
    expect(readOneOf("created; drop table", CONTACT_SORT_COLUMNS)).toBeUndefined()
    expect(readOneOf("", CONTACT_SORT_COLUMNS)).toBeUndefined()
    expect(readOneOf(undefined, CONTACT_SORT_COLUMNS)).toBeUndefined()
    expect(readOneOf(7, CONTACT_SORT_COLUMNS)).toBeUndefined()
  })

  it("is case-sensitive, so a near miss falls back rather than half-working", () => {
    expect(readOneOf("Emailed", CONTACT_SORT_COLUMNS)).toBeUndefined()
  })
})

describe("which way a list is sorted", () => {
  it("takes the two real answers and nothing else", () => {
    expect(readDirection("asc")).toBe("asc")
    expect(readDirection("desc")).toBe("desc")
    expect(readDirection("sideways")).toBeUndefined()
    expect(readDirection(undefined)).toBeUndefined()
  })
})

describe("which page a list is showing", () => {
  it("reads a real page number, however the address spells it", () => {
    expect(readPage(3)).toBe(3)
    expect(readPage("3")).toBe(3)
  })

  it("drops page one, because that is the default and never in the address", () => {
    expect(readPage(1)).toBeUndefined()
  })

  it("refuses a page nobody could have paged to", () => {
    expect(readPage(0)).toBeUndefined()
    expect(readPage(-1)).toBeUndefined()
    expect(readPage(1.5)).toBeUndefined()
    expect(readPage("lots")).toBeUndefined()
    // The ceiling, so an address cannot ask for an offset in the millions.
    expect(readPage(10_000)).toBe(10_000)
    expect(readPage(10_001)).toBeUndefined()
  })
})
