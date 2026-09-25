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
      fullWidth: false,
      width: null,
      blur: "medium",
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
        fullWidth: true,
        width: 1400,
        blur: "heavy",
      })
    ).toEqual({
      sticky: true,
      menuAlignment: "center",
      logoSize: "large",
      fullWidth: true,
      width: 1400,
      blur: "heavy",
    })

    expect(
      normalizePublicHeader({
        sticky: "yes",
        menuAlignment: "right",
        logoSize: 72,
        fullWidth: "yes",
        width: 100,
        blur: "extreme",
      })
    ).toEqual(createDefaultPublicHeader())
  })

  it("reads a header saved before width and blur existed as it looked then", () => {
    expect(
      normalizePublicHeader({
        sticky: true,
        menuAlignment: "left",
        logoSize: "small",
      })
    ).toMatchObject({ fullWidth: false, width: null, blur: "medium" })
    expect(normalizePublicHeader({ width: 1200.5 }).width).toBeNull()
    expect(normalizePublicHeader({ width: 2560 }).width).toBe(2560)
  })
})
