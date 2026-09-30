import { describe, expect, it } from "vitest"

import {
  activeFilterCount,
  creatorsQuery,
  creatorsSearch,
  DEFAULT_CREATORS_QUERY,
  isNarrowed,
  MAX_SEARCH_LENGTH,
  readCreatorsSearch,
} from "@/lib/trade/social/creators-query"

describe("reading the address", () => {
  it("takes the search, the filters and the sort", () => {
    expect(
      readCreatorsSearch({
        q: "sol",
        posts: "50to500",
        last: "week",
        sort: "handle",
        dir: "asc",
      })
    ).toEqual({
      q: "sol",
      posts: "50to500",
      last: "week",
      sort: "handle",
      dir: "asc",
    })
  })

  it("throws away anything it does not recognise instead of failing", () => {
    expect(
      readCreatorsSearch({
        posts: "loads",
        last: "yesterday",
        sort: "money",
        dir: "sideways",
        somethingElse: "ignored",
      })
    ).toEqual({})
  })

  it("keeps a default out of the address", () => {
    expect(
      readCreatorsSearch({
        posts: "any",
        last: "any",
        sort: "last",
        dir: "desc",
      })
    ).toEqual({})
  })

  it("trims the search and caps how long it can be", () => {
    expect(readCreatorsSearch({ q: "  sol  " })).toEqual({ q: "sol" })
    expect(readCreatorsSearch({ q: "   " })).toEqual({})
    expect(readCreatorsSearch({ q: "a".repeat(500) }).q).toHaveLength(
      MAX_SEARCH_LENGTH
    )
  })

  it("drops the filter that no longer exists rather than choking on it", () => {
    // A bookmark saved while "gone quiet" was its own tick. The list opens;
    // the tick's job is the Last post list's "Gone quiet, over a month".
    expect(readCreatorsSearch({ quiet: true, q: "sol" })).toEqual({ q: "sol" })
  })

  it("ignores a value that is not text at all", () => {
    expect(
      readCreatorsSearch({ q: { evil: true }, posts: ["under50"] })
    ).toEqual({})
  })
})

describe("filling the address out and putting it back", () => {
  it("fills every blank with its default", () => {
    expect(creatorsQuery({})).toEqual(DEFAULT_CREATORS_QUERY)
  })

  it("comes back to the same address it went out as", () => {
    const search = {
      q: "sol",
      posts: "over500" as const,
      last: "older" as const,
    }

    expect(creatorsSearch(creatorsQuery(search))).toEqual(search)
  })

  it("writes nothing when nothing is narrowing the list", () => {
    expect(creatorsSearch(DEFAULT_CREATORS_QUERY)).toEqual({})
  })
})

describe("how many filters are on", () => {
  it("counts the two filters and not the search", () => {
    expect(activeFilterCount(DEFAULT_CREATORS_QUERY)).toBe(0)
    expect(activeFilterCount({ ...DEFAULT_CREATORS_QUERY, q: "sol" })).toBe(0)
    expect(
      activeFilterCount({
        ...DEFAULT_CREATORS_QUERY,
        posts: "under50",
        last: "week",
      })
    ).toBe(2)
  })

  it("counts the search when asking whether anything is narrowing the list", () => {
    expect(isNarrowed(DEFAULT_CREATORS_QUERY)).toBe(false)
    expect(isNarrowed({ ...DEFAULT_CREATORS_QUERY, q: " sol " })).toBe(true)
    expect(isNarrowed({ ...DEFAULT_CREATORS_QUERY, q: "   " })).toBe(false)
    expect(isNarrowed({ ...DEFAULT_CREATORS_QUERY, last: "older" })).toBe(true)
  })
})
