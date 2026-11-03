import { describe, expect, it } from "vitest"

import { isGoogle, largerPhoto, searchAddress } from "@/server/travel/maps-browser"

describe("reading a venue in the hidden browser", () => {
  it("opens only Google's own addresses", () => {
    for (const ok of ["https://www.google.com/maps", "https://www.google.co.jp/", "https://google.com.au/", "https://lh3.googleusercontent.com/p/x", "https://maps.gstatic.com/a"]) {
      expect(isGoogle(new URL(ok))).toBe(true)
    }
    for (const bad of ["https://google.evil.io/", "https://notgoogle.com/", "http://www.google.com/", "https://www.google.com.evil.net/", "https://127.0.0.1/"]) {
      expect(isGoogle(new URL(bad))).toBe(false)
    }
  })

  it("asks Google for the photo at card size", () => {
    expect(largerPhoto("https://lh3.googleusercontent.com/grass-cs/ABC=w408-h306-k-no")).toBe(
      "https://lh3.googleusercontent.com/grass-cs/ABC=w1200-h900-k-no"
    )
    expect(largerPhoto("https://lh3.googleusercontent.com/p/ABC")).toBe("https://lh3.googleusercontent.com/p/ABC")
  })

  it("searches a venue at its pin when the link holds no place", () => {
    expect(searchAddress("Ichiran Shibuya", 35.661, 139.7012)).toBe(
      "https://www.google.com/maps/search/Ichiran%20Shibuya/@35.661,139.7012,17z?hl=en"
    )
    expect(searchAddress("Park Hyatt Tokyo", null, null)).toBe("https://www.google.com/maps/search/Park%20Hyatt%20Tokyo?hl=en")
  })
})
