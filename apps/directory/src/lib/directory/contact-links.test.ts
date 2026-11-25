import { describe, expect, it } from "vitest"

import {
  buildUrlHref,
  cleanContactLinks,
  isJunkEmail,
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

describe("emails that are nobody's inbox", () => {
  it("drops the addresses the import read off website source", () => {
    for (const email of [
      "605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com",
      "mailto:13e49d785d8d4f828038b6136f3b48ba@sentry.io",
      "ef5d9bbac3354b759bfd7a23c3313b3f@o244637.ingest.us.sentry.io",
      "account-default@2x.png",
      "georgest_diner_170x@2x.jpg",
      "example@domain.com",
      "example@mail.com",
      "info@mysite.com",
      "hi@mystore.com",
    ]) {
      expect(isJunkEmail(email), email).toBe(true)
    }
  })

  it("keeps real-looking addresses, example.com included", () => {
    for (const email of [
      "135ossington@gmail.com",
      "mailto:info@terroni.com",
      "owner@example.com",
      "sentry@restaurant.ca",
      "info@sentryhouse.ca",
      "hello@mail.com",
    ]) {
      expect(isJunkEmail(email), email).toBe(false)
    }
  })

  it("takes a junk email out of a listing's links and leaves the rest", () => {
    const links = cleanContactLinks({
      menuLinks: [
        { id: "a", type: "email", label: "", value: "x@sentry.io" },
        { id: "b", type: "email", label: "", value: "info@terroni.com" },
        { id: "c", type: "phone", label: "", value: "416 555 0100" },
      ],
    })
    expect(links.menuLinks.map((link) => link.id)).toEqual(["b", "c"])
  })
})
