import { describe, expect, it } from "vitest"

import {
  DEAL_MARKER_ICON,
  DIRECTORY_MAP_LISTING_LIMIT,
  directoryMapCapNotice,
  directoryMapCentre,
  directoryPinLabel,
} from "@/lib/directory/listing-map"

/**
 * The two decisions the map makes without touching a database: whether to warn
 * that something is missing, and where to open.
 *
 * The cap sentence is the one worth pinning down. Off by one in either
 * direction is a real bug — too eager and every full map nags about nothing,
 * too shy and a map silently drops a listing.
 */

describe("directoryMapCapNotice", () => {
  it("says nothing when every matching listing is on the map", () => {
    expect(directoryMapCapNotice(100, 100)).toBeNull()
    expect(directoryMapCapNotice(7, 7)).toBeNull()
    expect(directoryMapCapNotice(0, 0)).toBeNull()
  })

  it("speaks up at one more than the cap", () => {
    const notice = directoryMapCapNotice(DIRECTORY_MAP_LISTING_LIMIT, 101)
    expect(notice).toContain("100")
    expect(notice).toContain("101")
    expect(notice).toContain("narrow")
  })

  it("counts in listings, not in pages", () => {
    expect(directoryMapCapNotice(100, 4_000)).toBe(
      "Showing 100 of 4000 listings on the map. Search or pick a category to narrow it down."
    )
  })
})

describe("directoryMapCentre", () => {
  it("has nowhere to open with no points", () => {
    expect(directoryMapCentre([])).toBeNull()
  })

  it("sits between the points it is given", () => {
    expect(
      directoryMapCentre([
        { latitude: 10, longitude: 20 },
        { latitude: 20, longitude: 40 },
      ])
    ).toEqual({ latitude: 15, longitude: 30 })
  })
})

describe("directoryPinLabel", () => {
  it("is the listing's name when it has no deal on", () => {
    expect(directoryPinLabel("43 Down", undefined)).toBe("43 Down")
  })

  it("says the deal as well, so the marker is not the only clue", () => {
    expect(directoryPinLabel("43 Down", "20% off")).toBe("43 Down, 20% off")
  })
})

describe("DEAL_MARKER_ICON", () => {
  /*
   * The drawing is pinned down because a marker that a browser refuses to
   * parse shows as nothing at all: the pin disappears from the map rather than
   * falling back to Google's red one.
   */
  it("is an SVG a browser can use as an image source", () => {
    expect(DEAL_MARKER_ICON.startsWith("data:image/svg+xml,")).toBe(true)
    const svg = decodeURIComponent(
      DEAL_MARKER_ICON.slice("data:image/svg+xml,".length)
    )
    expect(svg.startsWith("<svg ")).toBe(true)
    expect(svg.endsWith("</svg>")).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it("carries no character a data URL would cut the drawing short at", () => {
    for (const character of ["#", "?", "&", '"', "<", ">", " "]) {
      expect(DEAL_MARKER_ICON).not.toContain(character)
    }
  })

  it("is sized so the tip of the pin is the spot on the map", () => {
    const svg = decodeURIComponent(
      DEAL_MARKER_ICON.slice("data:image/svg+xml,".length)
    )
    // Google anchors an image marker at the bottom centre of these numbers.
    expect(svg).toContain('width="28"')
    expect(svg).toContain('height="40"')
  })

  it("names its colours rather than reading the theme", () => {
    // Google's map tiles stay light in dark mode, so a themed colour would go
    // pale on a pale map. A test, because "use the token" is the rule
    // everywhere else in the app and this is the documented exception.
    expect(DEAL_MARKER_ICON).not.toContain("var")
    expect(decodeURIComponent(DEAL_MARKER_ICON)).toContain("#ffffff")
  })
})
