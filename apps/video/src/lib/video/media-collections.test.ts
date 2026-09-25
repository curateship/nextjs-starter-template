import { describe, expect, it } from "vitest"

import {
  cleanCollectionName,
  COLLECTION_NAME_REQUIRED_MESSAGE,
  MEDIA_COLLECTION_NAME_MAX,
} from "@/lib/video/media-collections"

describe("cleanCollectionName", () => {
  it("trims the edges", () => {
    expect(cleanCollectionName("  Logos  ")).toBe("Logos")
  })

  it("collapses inner whitespace to single spaces", () => {
    // The unique index compares lowercased names, so two spellings that only
    // differ by whitespace must land on the same stored name.
    expect(cleanCollectionName("B-roll   —\tgym")).toBe("B-roll — gym")
  })

  it("leaves an already-clean name alone", () => {
    expect(cleanCollectionName("Hooks")).toBe("Hooks")
  })

  it("refuses emptiness in every disguise", () => {
    for (const value of ["", "   ", "\t\n"]) {
      expect(() => cleanCollectionName(value)).toThrowError(
        COLLECTION_NAME_REQUIRED_MESSAGE
      )
    }
  })

  it("caps an over-long name instead of failing the insert", () => {
    const name = cleanCollectionName("x".repeat(160))
    expect(name).toHaveLength(MEDIA_COLLECTION_NAME_MAX)
  })
})
