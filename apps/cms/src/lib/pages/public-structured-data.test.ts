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
