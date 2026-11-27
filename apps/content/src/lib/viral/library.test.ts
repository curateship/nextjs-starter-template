import { describe, expect, it } from "vitest"

import { hookTypeChoices, hookTypeFromName, winnersByType } from "@/lib/viral/hook-types"
import {
  filterLibraryHooks,
  libraryFilters,
  type LibraryHook,
  type OwnLibraryHook,
  type VideoLibraryHook,
} from "@/lib/viral/library"
import { describeVaultView, vaultViewFilters } from "@/lib/viral/vault-saved-views"

const hook = (overrides: Partial<VideoLibraryHook>): LibraryHook => ({
  kind: "video",
  id: "v1",
  key: "youtube:v1",
  platform: "youtube",
  title: "Meal prep in 10 minutes",
  channelName: "Chef",
  thumbnailUrl: null,
  views: 1,
  text: overrides.hook?.text ?? "You are prepping lunch wrong.",
  hook: { startMs: 0, endMs: 2_000, text: "You are prepping lunch wrong." },
  projects: [{ id: "p1", name: "Meal prep" }],
  tags: [],
  typeId: null,
  winner: false,
  at: "2099-01-01T00:00:00.000Z",
  ...overrides,
})

const own = (overrides: Partial<OwnLibraryHook>): LibraryHook => ({
  kind: "own",
  id: "o1",
  text: "Stop doing this with your rice.",
  link: null,
  tags: [],
  typeId: "mistake",
  winner: false,
  at: "2099-01-02T00:00:00.000Z",
  ...overrides,
})

describe("Library → Hooks filters", () => {
  it("combines the project, the tag and the search", () => {
    const hooks = [
      hook({}),
      hook({ id: "v2", projects: [{ id: "p2", name: "Lunch" }], tags: ["Mistakes"] }),
      hook({ id: "v3", tags: ["mistakes"], hook: { startMs: 0, endMs: 1, text: "Nobody tells you this." } }),
    ]
    expect(filterLibraryHooks(hooks, { project: "p1" }).map((one) => one.id)).toEqual(["v1", "v3"])
    expect(filterLibraryHooks(hooks, { tag: "MISTAKES" }).map((one) => one.id)).toEqual(["v2", "v3"])
    expect(filterLibraryHooks(hooks, { q: "nobody" }).map((one) => one.id)).toEqual(["v3"])
  })

  it("keeps only the type picked, and shows your own hooks under All projects only", () => {
    const hooks = [hook({ typeId: "question" }), hook({ id: "v2", typeId: "mistake" }), own({})]
    expect(filterLibraryHooks(hooks, { type: "mistake" }).map((one) => one.id)).toEqual(["v2", "o1"])
    expect(filterLibraryHooks(hooks, { type: "mistake", project: "p1" }).map((one) => one.id)).toEqual(["v2"])
    expect(filterLibraryHooks(hooks, {}).map((one) => one.id)).toEqual(["v1", "v2", "o1"])
  })

  it("keeps only what a view may hold, the type included", () => {
    expect(libraryFilters({ q: " lunch ", tag: "  Hooks ", project: "../x", other: "y" })).toEqual({ q: "lunch", tag: "Hooks" })
    expect(libraryFilters({ type: "bold-claim" })).toEqual({ type: "bold-claim" })
    expect(libraryFilters({ type: "../x" })).toEqual({})
  })
})

describe("hook types", () => {
  it("matches the AI's answer to the list and counts winners per type", () => {
    const choices = hookTypeChoices([{ id: "t-1", name: "Callback" }])
    expect(hookTypeFromName("bold  CLAIM", choices)?.id).toBe("bold-claim")
    expect(hookTypeFromName("how to", choices)?.id).toBe("how-to")
    expect(hookTypeFromName("callback", choices)).toEqual({ id: "t-1", label: "Callback", own: true })
    expect(hookTypeFromName("Something else", choices)).toBeNull()
    const counts = winnersByType([
      { typeId: "mistake", winner: true },
      { typeId: "mistake", winner: true },
      { typeId: "mistake", winner: false },
      { typeId: null, winner: true },
    ])
    expect(counts.get("mistake")).toBe(2)
    expect(counts.size).toBe(1)
  })
})

describe("the Vault page's Board", () => {
  it("keeps Board in a view, and leaves List out as the default", () => {
    expect(vaultViewFilters({ show: "board" })).toEqual({ show: "board" })
    expect(vaultViewFilters({ show: "list" })).toEqual({})
    expect(describeVaultView({ status: "posted", show: "board" })).toBe("Posted · Board")
  })
})
