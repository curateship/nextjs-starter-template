import { describe, expect, it } from "vitest"

import {
  buildUrlHref,
  cleanContactLinks,
  menuLinkHref,
  menuLinkLabel,
  sanitizeContactHref,
} from "@/lib/directory/contact-links"

/**
 * A listing's links are the one place it hands the browser something it will
 * follow, so the rule under test is simple: nothing executable ever survives,
 * and everything an admin plausibly types still works.
 */

describe("which addresses a link may carry", () => {
  it("refuses every scheme that would run instead of navigate", () => {
    for (const href of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      " javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:x",
      "file:///etc/passwd",
      "blob:something",
      "about:blank",
      "//evil.example",
    ]) {
      expect(sanitizeContactHref(href), href).toBe("")
    }
  })

  it("lets the ordinary ways of writing a link through unchanged", () => {
    for (const href of [
      "https://example.com/menu",
      "http://example.com",
      "mailto:hello@example.com",
      "tel:+16072478870",
      "/about",
    ]) {
      expect(sanitizeContactHref(href), href).toBe(href)
    }
  })

  it("turns a bare domain into a real address", () => {
    expect(buildUrlHref("example.com")).toBe("https://example.com")
    expect(buildUrlHref("javascript:alert(1)")).toBe("")
  })
})

describe("what a link points at, by kind", () => {
  it("makes a phone number dialable and shows it nicely", () => {
    const link = { id: "m1", type: "phone" as const, label: "", value: "607-247-8870" }
    expect(menuLinkHref(link)).toBe("tel:6072478870")
    expect(menuLinkLabel(link)).toBe("(607) 247-8870")
  })

  it("makes an email writable and a website readable", () => {
    expect(
      menuLinkHref({ id: "m1", type: "email", label: "", value: "a@b.co" })
    ).toBe("mailto:a@b.co")
    expect(
      menuLinkLabel({
        id: "m2",
        type: "website",
        label: "",
        value: "https://www.example.com/path",
      })
    ).toBe("example.com")
  })

  it("sends a typed street address to a maps search", () => {
    const href = menuLinkHref({
      id: "m1",
      type: "directions",
      label: "",
      value: "1245 Broadway, New York",
    })
    expect(href).toContain("https://www.google.com/maps/search/")
    expect(href).toContain(encodeURIComponent("1245 Broadway, New York"))
  })

  it("gives a poisoned value no address at all", () => {
    expect(
      menuLinkHref({
        id: "m1",
        type: "custom",
        label: "Click",
        value: "javascript:alert(1)",
      })
    ).toBe("")
  })
})

describe("cleaning what arrives from a form or the database", () => {
  it("keeps only the allowed shape and drops empty rows", () => {
    const cleaned = cleanContactLinks({
      address: "  12 Main St  ",
      menuLinks: [
        { id: "m1", type: "phone", label: "", value: "555", extra: "dropped" },
        { type: "not-a-type", label: "", value: "x" },
        { id: "m3", type: "email", label: "", value: "" },
      ],
      socialLinks: [{ platform: "Instagram", url: "instagram.com/joes" }],
      somethingElse: true,
    })

    expect(cleaned.address).toBe("12 Main St")
    expect(cleaned.menuLinks).toHaveLength(2)
    expect(cleaned.menuLinks[0]).toEqual({
      id: "m1",
      type: "phone",
      label: "",
      value: "555",
    })
    // An unknown kind becomes a plain link rather than being trusted.
    expect(cleaned.menuLinks[1].type).toBe("custom")
    expect(cleaned.socialLinks[0].id).toBeTruthy()
    expect("somethingElse" in cleaned).toBe(false)
  })

  it("answers the empty shape for anything that is not links at all", () => {
    for (const raw of [null, undefined, "words", 7, []]) {
      expect(cleanContactLinks(raw)).toEqual({
        address: "",
        menuLinks: [],
        socialLinks: [],
      })
    }
  })
})
