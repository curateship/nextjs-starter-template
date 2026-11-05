import { describe, expect, it } from "vitest"

import type { VaultItem } from "@/lib/viral/vault"
import { filterVaultItems } from "@/lib/viral/vault-view"

function item(id: string, change: Partial<VaultItem>): VaultItem {
  return {
    id,
    projectId: "p1",
    projectName: "Meal prep",
    platform: "youtube",
    platformVideoId: id,
    sourceUrl: `https://www.youtube.com/watch?v=${id}`,
    title: `Video ${id}`,
    channelName: "Chef",
    thumbnailUrl: null,
    playbackUrl: null,
    stats: { views: 1, likes: null, comments: null, subscribers: null, durationSeconds: null, postedAt: null, score: null, outlier: null },
    analysisTopic: null,
    analysis: null,
    notes: "",
    status: "idea",
    tags: [],
    sentEditUrl: null,
    sentAt: null,
    send: null,
    createdAt: "2099-01-01T00:00:00.000Z",
    ...change,
  }
}

const items = [
  item("a", { status: "scripted", tags: ["Hooks", "Q1"] }),
  item("b", { status: "scripted", tags: ["Q1"] }),
  item("c", { status: "idea", tags: ["hooks"] }),
  item("d", { status: "posted", tags: [], projectId: "p2", notes: "Great hook about lunch" }),
]

describe("filterVaultItems", () => {
  it("combines status and tag, matching the tag in any case", () => {
    expect(filterVaultItems(items, { status: "scripted", tag: "hooks" }).map((one) => one.id)).toEqual(["a"])
  })

  it("keeps every idea with no filters", () => {
    expect(filterVaultItems(items, {})).toHaveLength(4)
  })

  it("keeps the list to a picked project and searches the notes", () => {
    expect(filterVaultItems(items, { project: "p2" }).map((one) => one.id)).toEqual(["d"])
    expect(filterVaultItems(items, { q: "LUNCH" }).map((one) => one.id)).toEqual(["d"])
  })
})
