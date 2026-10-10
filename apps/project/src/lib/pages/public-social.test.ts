import { describe, expect, it } from "vitest"

import {
  MAX_PUBLIC_SOCIAL_LINKS,
  normalizePublicSocialLinks,
} from "@/lib/pages/public-social"

describe("public social accounts", () => {
  it("keeps the saved order and drops what cannot be drawn", () => {
    expect(
      normalizePublicSocialLinks([
        { platform: "linkedin", url: "https://linkedin.com/company/acme" },
        { platform: "twitter", url: "https://x.com/acme" },
        // No mark for this one, so there is nothing to draw.
        { platform: "myspace", url: "https://myspace.com/acme" },
        // A button with no address goes nowhere.
        { platform: "github", url: "" },
        "not an account",
      ])
    ).toEqual([
      { platform: "linkedin", url: "https://linkedin.com/company/acme" },
      { platform: "twitter", url: "https://x.com/acme" },
    ])
  })

  it("refuses an address a browser would run", () => {
    expect(
      normalizePublicSocialLinks([
        { platform: "twitter", url: "javascript:alert(1)" },
        { platform: "github", url: "mailto:hi@example.test" },
      ])
    ).toEqual([])
  })

  it("stops at the limit", () => {
    const many = Array.from({ length: MAX_PUBLIC_SOCIAL_LINKS + 3 }, () => ({
      platform: "github",
      url: "https://github.com/acme",
    }))

    expect(normalizePublicSocialLinks(many)).toHaveLength(
      MAX_PUBLIC_SOCIAL_LINKS
    )
  })

  it("reads a platform saved in capitals", () => {
    expect(
      normalizePublicSocialLinks([
        { platform: "YouTube", url: "https://youtube.com/@acme" },
      ])
    ).toEqual([{ platform: "youtube", url: "https://youtube.com/@acme" }])
  })
})
