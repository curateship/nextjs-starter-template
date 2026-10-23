import { describe, expect, it } from "vitest"

import { exportGroupId, groupLanguageCopies } from "./export-groups"

function row(id: string, project: string, language?: string, original?: string) {
  return {
    id,
    project_id: project,
    language: language ?? null,
    original_project_id: original ?? null,
  }
}

describe("grouping language copies on the Exports page", () => {
  it("pulls each language's export up under the original's", () => {
    const sorted = [
      row("spanish", "copy-es", "Spanish", "short"),
      row("other", "other"),
      row("hindi", "copy-hi", "Hindi", "short"),
      row("short", "short"),
    ]
    const { rows, originals } = groupLanguageCopies(sorted)
    expect(rows.map((item) => item.id)).toEqual([
      "spanish",
      "hindi",
      "short",
      "other",
    ])
    expect([...originals]).toEqual(["short"])
    expect(exportGroupId(rows[2], originals)).toBe("short")
    expect(exportGroupId(rows[3], originals)).toBeNull()
  })

  it("leaves the order alone when nothing is a language copy", () => {
    const sorted = [row("b", "p1"), row("a", "p2"), row("c", "p1")]
    expect(groupLanguageCopies(sorted).rows).toEqual(sorted)
  })

  it("keeps a copy whose original was deleted out of any group", () => {
    const orphan = row("es", "copy-es", "Spanish")
    expect(exportGroupId(orphan, new Set())).toBeNull()
  })
})
