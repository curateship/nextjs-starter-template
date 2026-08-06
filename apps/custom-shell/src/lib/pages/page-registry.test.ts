import { describe, expect, it } from "vitest"

import {
  buildPageDescriptors,
  pageForPath,
  publicPages,
} from "@/lib/pages/page-registry"

/**
 * The registry is the foundation of the Pages batch: every public page
 * declares itself in a `*.page.ts` beside its route, and everything else —
 * the dashboard, the on/off switch, the SEO fields, the menu, the sitemap —
 * reads that one list. These tests pin down the list's contract: the pages
 * that exist today are all in it, the ones the app cannot live without say
 * so, a stolen address is refused out loud, and asking twice costs nothing.
 */

const SIGN_IN_FAMILY = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/sign-in-link",
  "/verify-email",
  "/change-email",
  "/revoke-email-change",
]

describe("the registry finds every public page", () => {
  it("lists the pages that exist today", () => {
    const paths = publicPages().map((page) => page.path)

    expect(paths).toEqual(
      expect.arrayContaining([
        "/",
        "/pricing",
        "/maintenance",
        ...SIGN_IN_FAMILY,
      ])
    )
  })

  it("fills every page in completely", () => {
    for (const page of publicPages()) {
      expect(page.path.startsWith("/")).toBe(true)
      expect(page.name).not.toBe("")
      expect(page.summary).not.toBe("")
      expect(["marketing", "card"]).toContain(page.layout)
      expect(page.source).toBe("shell")
    }
  })

  it("keeps the list in address order", () => {
    const paths = publicPages().map((page) => page.path)
    // Character order, not locale order — the server and the browser have to
    // reach the same list, and locale collation differs between runtimes.
    expect(paths).toEqual(
      [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    )
  })
})

describe("pages the app cannot live without say so", () => {
  it("never lets the front page be switched off", () => {
    expect(pageForPath("/")?.canSwitchOff).toBe(false)
  })

  it("never lets the sign-in family be switched off", () => {
    for (const path of SIGN_IN_FAMILY) {
      expect(pageForPath(path)?.canSwitchOff, path).toBe(false)
    }
  })

  it("leaves everything else switchable", () => {
    expect(pageForPath("/pricing")?.canSwitchOff).toBe(true)
  })
})

describe("looking a page up", () => {
  it("finds a declared page by address", () => {
    expect(pageForPath("/pricing")?.name).toBe("Pricing")
  })

  it("answers null for an address nobody declared", () => {
    expect(pageForPath("/no-such-page")).toBeNull()
  })

  it("returns the same list every time it is asked", () => {
    expect(publicPages()).toBe(publicPages())
    expect(pageForPath("/pricing")).toBe(pageForPath("/pricing"))
  })
})

describe("building the list", () => {
  it("refuses two pages claiming the same address", () => {
    const declaration = { path: "/tour", name: "Tour", summary: "A tour." }

    expect(() =>
      buildPageDescriptors(
        [
          { file: "src/routes/tour.page.ts", declaration },
          { file: "src/routes/other.page.ts", declaration },
        ],
        "shell"
      )
    ).toThrow('Two pages both claim the address "/tour"')
  })

  it("refuses an address that is not an address", () => {
    // A missing slash would link nowhere and never match a visit count, but
    // nothing downstream would look broken — so it is caught here instead.
    expect(() =>
      buildPageDescriptors(
        [
          {
            file: "src/routes/tour.page.ts",
            declaration: { path: "tour", name: "Tour", summary: "A tour." },
          },
        ],
        "shell"
      )
    ).toThrow('declares the address "tour"')
  })

  it("fills in the defaults: switchable, card layout", () => {
    const [page] = buildPageDescriptors(
      [
        {
          file: "src/routes/tour.page.ts",
          declaration: { path: "/tour", name: "Tour", summary: "A tour." },
        },
      ],
      "app"
    )

    expect(page).toEqual({
      path: "/tour",
      name: "Tour",
      summary: "A tour.",
      canSwitchOff: true,
      layout: "card",
      source: "app",
    })
  })
})
