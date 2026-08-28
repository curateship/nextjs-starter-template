import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearVenueTouched,
  venueTouched,
  venueTouchedAt,
} from "@/server/protocols/touched"

beforeEach(() => {
  clearVenueTouched("kucoin")
  clearVenueTouched("phemex")
})

describe("exchange account change marks", () => {
  it("keeps each exchange independent", () => {
    vi.spyOn(Date, "now").mockReturnValue(123)
    venueTouched("phemex")

    expect(venueTouchedAt("phemex")).toBe(123)
    expect(venueTouchedAt("kucoin")).toBe(0)

    clearVenueTouched("kucoin")
    expect(venueTouchedAt("phemex")).toBe(123)
  })
})
