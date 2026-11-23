import { beforeEach, describe, expect, it } from "vitest"

import {
  cachedPublicDirectoryRead,
  clearPublicDirectoryCache,
  publicDirectoryCacheSizeForTests,
  resetPublicDirectoryCacheForTests,
} from "@/server/directory/public-cache"

beforeEach(() => resetPublicDirectoryCacheForTests())

describe("the public directory page cache", () => {
  it("keeps at most sixty of a thousand different pages", async () => {
    for (let page = 1; page <= 1_000; page += 1) {
      await cachedPublicDirectoryRead(
        "alpha",
        "browse",
        { page },
        async () => page
      )
    }

    expect(publicDirectoryCacheSizeForTests()).toBe(60)
  })

  it("keeps sites separate and clears only the chosen site", async () => {
    await cachedPublicDirectoryRead(
      "alpha",
      "listing",
      { slug: "cafe" },
      async () => "Alpha cafe"
    )
    await cachedPublicDirectoryRead(
      "beta",
      "listing",
      { slug: "cafe" },
      async () => "Beta cafe"
    )

    expect(clearPublicDirectoryCache("alpha")).toBe(1)
    expect(publicDirectoryCacheSizeForTests()).toBe(1)
    expect(
      await cachedPublicDirectoryRead(
        "beta",
        "listing",
        { slug: "cafe" },
        async () => "Wrong beta"
      )
    ).toBe("Beta cafe")
    expect(
      await cachedPublicDirectoryRead(
        "alpha",
        "listing",
        { slug: "cafe" },
        async () => "Fresh alpha"
      )
    ).toBe("Fresh alpha")
  })

  it("does not remember a read that finishes after a clear", async () => {
    let finish!: (value: string) => void
    const slow = cachedPublicDirectoryRead(
      "alpha",
      "browse",
      { page: 1 },
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        })
    )

    clearPublicDirectoryCache("alpha")
    finish("Stale")
    expect(await slow).toBe("Stale")
    expect(
      await cachedPublicDirectoryRead(
        "alpha",
        "browse",
        { page: 1 },
        async () => "Fresh"
      )
    ).toBe("Fresh")
  })

  it("does not remember missing pages or failed reads", async () => {
    await cachedPublicDirectoryRead(
      "alpha",
      "listing",
      { slug: "missing" },
      async () => null
    )
    await expect(
      cachedPublicDirectoryRead("alpha", "browse", { page: 1 }, async () => {
        throw new Error("Database unavailable")
      })
    ).rejects.toThrow("Database unavailable")

    expect(publicDirectoryCacheSizeForTests()).toBe(0)
  })
})
