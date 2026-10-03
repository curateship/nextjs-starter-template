import { describe, expect, it } from "vitest"

import {
  publicPageUrl,
  publicStructuredData,
  publicStructuredDataText,
} from "@/lib/pages/public-structured-data"

describe("public structured data", () => {
  it("describes the organization and public page in one graph", () => {
    expect(
      publicStructuredData({
        organization: {
          name: "Acme",
          url: "https://acme.example/",
          logo: "https://media.example/acme.png",
          socialProfiles: [
            "https://social.example/acme",
            "https://social.example/acme",
          ],
        },
        page: {
          name: "About Acme",
          url: "https://acme.example/about",
          description: "How Acme works.",
        },
      })
    ).toEqual({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          name: "Acme",
          url: "https://acme.example/",
          logo: "https://media.example/acme.png",
          sameAs: ["https://social.example/acme"],
        },
        {
          "@type": "WebPage",
          name: "About Acme",
          url: "https://acme.example/about",
          description: "How Acme works.",
        },
      ],
    })
  })

  it("leaves empty and unsafe optional fields out", () => {
    const graph = publicStructuredData({
      organization: {
        name: "Acme",
        logo: "javascript:alert(1)",
        socialProfiles: ["", "mailto:hello@example.com"],
      },
      page: { name: "Home", description: "  " },
    })["@graph"] as Record<string, unknown>[]

    expect(graph[0]).toEqual({ "@type": "Organization", name: "Acme" })
    expect(graph[1]).toEqual({ "@type": "WebPage", name: "Home" })
  })

  it("cannot close its own script element", () => {
    const text = publicStructuredDataText({
      organization: { name: "Acme" },
      page: { name: "</script><img onerror=x>" },
    })

    expect(text).not.toContain("</script>")
    expect(text).toContain("\\u003c/script>")
    expect(JSON.parse(text)).toMatchObject({
      "@context": "https://schema.org",
    })
  })

  it("adds the trail only when the page shows one", () => {
    const withoutTrail = publicStructuredData({
      organization: { name: "Acme" },
      page: { name: "Pricing" },
    })
    expect(
      (withoutTrail["@graph"] as { "@type": string }[]).map(
        (node) => node["@type"]
      )
    ).toEqual(["Organization", "WebPage"])

    const withTrail = publicStructuredData({
      organization: { name: "Acme" },
      page: { name: "Pricing" },
      breadcrumbs: [
        { name: "Home", url: "https://acme.example/" },
        { name: "Pricing", url: "" },
      ],
    })
    expect((withTrail["@graph"] as unknown[])[2]).toEqual({
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://acme.example/",
        },
        { "@type": "ListItem", position: 2, name: "Pricing" },
      ],
    })
  })

  it("refuses a trail of one step or one with a nameless step", () => {
    const oneStep = publicStructuredData({
      organization: { name: "Acme" },
      page: { name: "Pricing" },
      breadcrumbs: [{ name: "Home", url: "https://acme.example/" }],
    })
    expect((oneStep["@graph"] as unknown[]).length).toBe(2)

    const nameless = publicStructuredData({
      organization: { name: "Acme" },
      page: { name: "Pricing" },
      breadcrumbs: [{ name: "Home" }, { name: "  " }],
    })
    expect((nameless["@graph"] as unknown[]).length).toBe(2)
  })

  it("builds the page address from the visited origin", () => {
    expect(publicPageUrl("https://acme.example", "/about")).toBe(
      "https://acme.example/about"
    )
    expect(publicPageUrl("javascript:alert(1)", "/about")).toBe("")
    expect(publicPageUrl("https://acme.example", "//other.example/about")).toBe(
      ""
    )
    expect(
      publicPageUrl("https://user:secret@acme.example", "/about")
    ).toBe("")
  })
})
