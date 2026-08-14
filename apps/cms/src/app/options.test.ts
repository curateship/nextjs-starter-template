import { describe, expect, it, vi } from "vitest"

import { loadDirectoryFrontPageOverride } from "@/app/options"

describe("directory front-page catch-all", () => {
  it("does not claim any address except the home page", async () => {
    const load = vi.fn()
    expect(await loadDirectoryFrontPageOverride("/about", load)).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it("falls through when the visited host does not enable the page", async () => {
    expect(
      await loadDirectoryFrontPageOverride("/", async () => null)
    ).toBeNull()
  })
})
