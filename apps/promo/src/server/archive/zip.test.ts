import { describe, expect, it } from "vitest"

import { zipName } from "./zip"

describe("a name inside the zip", () => {
  it("never climbs out of its folder or hides itself", () => {
    expect(zipName("..", "Untitled")).toBe("Untitled")
    expect(zipName(".", "Untitled")).toBe("Untitled")
    expect(zipName("../../etc", "Untitled")).toBe("etc")
    expect(zipName(".hidden", "Untitled")).toBe("hidden")
    expect(zipName(" . . launch", "Untitled")).toBe("launch")
  })

  it("keeps an ordinary title, dots inside it included", () => {
    expect(zipName("Launch v1.2 (final)", "Untitled")).toBe("Launch v1.2 (final)")
    expect(zipName("a/b\\c", "Untitled")).toBe("a b c")
  })
})
