import { describe, expect, it } from "vitest"

import { filterLibraryHooks, libraryFilters, type LibraryHook } from "@/lib/viral/library"
import { describeVaultView, vaultViewFilters } from "@/lib/viral/vault-saved-views"

const hook = (overrides: Partial<LibraryHook>): LibraryHook => ({
  savedVideoId: "v1",
  key: "youtube:v1",
  platform: "youtube",
  title: "Meal prep in 10 minutes",
  channelName: "Chef",
  thumbnailUrl: null,
  views: 1,
  hook: { startMs: 0, endMs: 2_000, text: "You are prepping lunch wrong." },
  projects: [{ id: "p1", name: "Meal prep" }],
  tags: [],
  analysedAt: "2099-01-01T00:00:00.000Z",
  ...overrides,
})

describe("Library → Hooks filters", () => {
  it("combines the project, the tag and the search", () => {
    const hooks = [
      hook({}),
      hook({ savedVideoId: "v2", projects: [{ id: "p2", name: "Lunch" }], tags: ["Mistakes"] }),
      hook({ savedVideoId: "v3", tags: ["mistakes"], hook: { startMs: 0, endMs: 1, text: "Nobody tells you this." } }),
    ]
    expect(filterLibraryHooks(hooks, { project: "p1" }).map((one) => one.savedVideoId)).toEqual(["v1", "v3"])
    expect(filterLibraryHooks(hooks, { tag: "MISTAKES" }).map((one) => one.savedVideoId)).toEqual(["v2", "v3"])
    expect(filterLibraryHooks(hooks, { q: "nobody" }).map((one) => one.savedVideoId)).toEqual(["v3"])
  })

  it("keeps only what a view may hold", () => {
    expect(libraryFilters({ q: " lunch ", tag: "  Hooks ", project: "../x", other: "y" })).toEqual({ q: "lunch", tag: "Hooks" })
  })
})

describe("the Vault page's Board", () => {
  it("keeps Board in a view, and leaves List out as the default", () => {
    expect(vaultViewFilters({ show: "board" })).toEqual({ show: "board" })
    expect(vaultViewFilters({ show: "list" })).toEqual({})
    expect(describeVaultView({ status: "posted", show: "board" })).toBe("Posted · Board")
  })
})
