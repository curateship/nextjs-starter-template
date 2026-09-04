import { describe, expect, it } from "vitest"

import {
  createDefaultPublicHeader,
  normalizePublicHeader,
} from "@/lib/pages/public-header"

describe("public header settings", () => {
  it("keeps the existing header layout as its default", () => {
    expect(createDefaultPublicHeader()).toEqual({
      sticky: false,
      menuAlignment: "left",
      logoSize: "standard",
    })
    expect(normalizePublicHeader(undefined)).toEqual(
      createDefaultPublicHeader()
    )
  })

  it("keeps valid choices and repairs malformed saved values", () => {
    expect(
      normalizePublicHeader({
        sticky: true,
        menuAlignment: "center",
        logoSize: "large",
      })
    ).toEqual({
      sticky: true,
      menuAlignment: "center",
      logoSize: "large",
    })

    expect(
      normalizePublicHeader({
        sticky: "yes",
        menuAlignment: "right",
        logoSize: 72,
      })
    ).toEqual(createDefaultPublicHeader())
  })
})
