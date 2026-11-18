import { describe, expect, it } from "vitest"

import { forwardedSearch } from "@/lib/directory/listings-dashboard-search"

/**
 * Old Listings addresses, and the email links that still carry them, land on
 * the same row of the dashboard with the same record open.
 */

const ID = "065b2ed7-e7a4-49c8-b4b9-aeb8da722ee1"

describe("an old address forwarded", () => {
  it("opens a linked queue record under every status, so a decided one is still listed", () => {
    expect(forwardedSearch("claims", { open: ID })).toEqual({ section: "claims", open: ID, status: "all" })
    expect(forwardedSearch("reports", { open: ID })).toEqual({ section: "reports", open: ID, status: "all" })
  })

  it("sends a claims page's request to the Owner changes row", () => {
    expect(forwardedSearch("claims", { request: ID })).toEqual({ section: "changes", open: ID, status: "all" })
  })

  it("keeps a status the link already chose, and adds none without a record", () => {
    expect(forwardedSearch("claims", { open: ID, status: "approved" })).toEqual({ section: "claims", open: ID, status: "approved" })
    expect(forwardedSearch("submissions", {})).toEqual({ section: "submissions" })
    expect(forwardedSearch("guides", { open: ID })).toEqual({ section: "guides", open: ID })
  })
})
