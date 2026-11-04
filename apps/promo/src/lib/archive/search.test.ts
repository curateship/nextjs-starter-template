import { describe, expect, it } from "vitest"

import { readArchiveSearch, readProjectArchiveSearch } from "./search"

describe("the Archive's address", () => {
  it("takes ?archive=1 and ?bin=1 whether the router reads them as the number or the word", () => {
    expect(readProjectArchiveSearch({ archive: 1, kind: "video" })).toEqual({ archive: "1", kind: "video" })
    expect(readProjectArchiveSearch({ archive: "1" })).toEqual({ archive: "1" })
    expect(readProjectArchiveSearch({ archive: 2 })).toEqual({})
    expect(readArchiveSearch({ bin: 1 }).bin).toBe("1")
  })

  it("drops anything that isn't one of its own values", () => {
    expect(readArchiveSearch({ kind: "song", posted: "yes", sort: "views", project: "<script>" })).toEqual({ sort: "views" })
  })
})
