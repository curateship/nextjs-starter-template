import { describe, expect, it } from "vitest"

import {
  createDefaultPublicSystemCopy,
  DEFAULT_HOME_DESCRIPTION,
  defaultPublicDescription,
  normalizePublicSeo,
  normalizePublicSystemCopy,
  normalizeShareImage,
  normalizeSocialCardType,
  normalizeSocialHandle,
  publicSocialMeta,
  resolveMaintenanceCopy,
  resolveNotFoundCopy,
  resolvePublicSeoMetadata,
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

  it("normalizes each site-wide SEO field without letting one bad field erase the others", () => {
    expect(
      normalizePublicSeo({
        homeTitle: "  Acme home  ",
        homeDescription: 42,
        siteDescription: "  The Acme site.  ",
      })
    ).toEqual({
      homeTitle: "Acme home",
      homeDescription: "",
      siteDescription: "The Acme site.",
    })
    expect(normalizePublicSeo(null)).toEqual({
      homeTitle: "",
      homeDescription: "",
      siteDescription: "",
    })
  })

  it("keeps the home fields on home and uses the site description only for gaps", () => {
    const seo = normalizePublicSeo({
      homeTitle: "Acme makes work simple",
      homeDescription: "The Acme front page.",
      siteDescription: "The default Acme description.",
    })

    expect(
      resolvePublicSeoMetadata({
        title: "Front page · Acme",
        description: DEFAULT_HOME_DESCRIPTION,
        appName: "Acme",
        home: true,
        seo,
      })
    ).toEqual({
      title: "Acme makes work simple",
      description: "The Acme front page.",
    })

    expect(
      resolvePublicSeoMetadata({
        title: "About · Acme",
        description: "About Acme.",
        appName: "Acme",
        home: false,
        seo,
      })
    ).toEqual({ title: "About · Acme", description: "About Acme." })

    expect(
      resolvePublicSeoMetadata({
        title: "Written page · Acme",
        description: "",
        appName: "Acme",
        home: false,
        seo,
      })
    ).toEqual({
      title: "Written page · Acme",
      description: "The default Acme description.",
    })
  })

  it("preserves today's public metadata when every SEO field is empty", () => {
    expect(
      resolvePublicSeoMetadata({
        title: "Front page · Acme",
        description: DEFAULT_HOME_DESCRIPTION,
        appName: "Acme",
        home: true,
      })
    ).toEqual({
      title: "Front page · Acme",
      description: DEFAULT_HOME_DESCRIPTION,
    })
    expect(
      resolvePublicSeoMetadata({
        title: "Written page · Acme",
        appName: "Acme",
        home: false,
      })
    ).toEqual({
      title: "Written page · Acme",
      description: "Visit Acme.",
    })
  })
})
