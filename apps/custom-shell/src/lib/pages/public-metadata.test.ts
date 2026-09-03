import { describe, expect, it } from "vitest"

import {
  createDefaultPublicSystemCopy,
  defaultPublicDescription,
  normalizePublicSystemCopy,
  normalizeShareImage,
  normalizeSocialCardType,
  normalizeSocialHandle,
  publicSocialMeta,
  resolveMaintenanceCopy,
  resolveNotFoundCopy,
  versionedShareImage,
} from "@/lib/pages/public-metadata"

describe("public metadata", () => {
  it("builds complete share tags and leaves optional tags out when empty", () => {
    expect(
      publicSocialMeta({
        title: "Pricing · Acme",
        description: "The plans on offer.",
        image: "https://media.example.test/share.png?v=2",
        cardType: "summary_large_image",
        handle: "acme",
      })
    ).toEqual([
      { name: "description", content: "The plans on offer." },
      { property: "og:title", content: "Pricing · Acme" },
      { property: "og:description", content: "The plans on offer." },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@acme" },
      {
        property: "og:image",
        content: "https://media.example.test/share.png?v=2",
      },
      {
        name: "twitter:image",
        content: "https://media.example.test/share.png?v=2",
      },
    ])

    const minimal = publicSocialMeta({
      title: "Home · Acme",
      description: "Visit Acme.",
      image: "",
      cardType: "summary",
      handle: "",
    })
    expect(minimal).not.toContainEqual(
      expect.objectContaining({ name: "twitter:site" })
    )
    expect(minimal).not.toContainEqual(
      expect.objectContaining({ property: "og:image" })
    )
  })

  it("normalizes card settings and refuses unsafe image addresses", () => {
    expect(normalizeSocialCardType("summary_large_image")).toBe(
      "summary_large_image"
    )
    expect(normalizeSocialCardType("player")).toBe("summary")
    expect(normalizeSocialHandle("  @custom_shell ")).toBe("custom_shell")
    expect(normalizeSocialHandle("not-a-handle")).toBe("")
    expect(normalizeShareImage("javascript:alert(1)")).toBe("")
    expect(normalizeShareImage("https://media.example.test/share.png")).toBe(
      "https://media.example.test/share.png"
    )
  })

  it("versions replacement images without dropping an existing query", () => {
    expect(
      versionedShareImage(
        "https://media.example.test/share.png?width=1200",
        "2026-09-02T12:00:00.000Z"
      )
    ).toBe(
      "https://media.example.test/share.png?width=1200&v=2026-09-02T12%3A00%3A00.000Z"
    )
  })

  it("uses saved system-page copy and today's wording when fields are empty", () => {
    const empty = createDefaultPublicSystemCopy()
    expect(resolveNotFoundCopy(empty)).toEqual({
      heading: "That page does not exist",
      body: "We could not find the page you requested.",
    })
    expect(resolveNotFoundCopy(empty, "Acme").body).toBe(
      "Acme could not find the page you requested."
    )
    expect(resolveMaintenanceCopy(empty)).toEqual({
      heading: "We will be back soon",
      body: "We are making some improvements and will be back shortly.",
    })

    const saved = normalizePublicSystemCopy({
      notFoundHeading: "  Lost?  ",
      notFoundBody: "  Try the front page.  ",
      maintenanceHeading: "  Taking a short break  ",
      maintenanceBody: "  Back at noon.  ",
    })
    expect(resolveNotFoundCopy(saved)).toEqual({
      heading: "Lost?",
      body: "Try the front page.",
    })
    expect(resolveMaintenanceCopy(saved)).toEqual({
      heading: "Taking a short break",
      body: "Back at noon.",
    })
    expect(defaultPublicDescription("Acme")).toBe("Visit Acme.")
  })
})
