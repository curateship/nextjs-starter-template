import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { getPageVisibilityErrorMessage } from "@/lib/api/content/pages"
import { publicPages } from "@/lib/pages/page-registry"
import {
  MAX_PAGE_OVERRIDES,
  normalizePageOverrides,
  pageVisibility,
} from "@/lib/pages/page-visibility"

/**
 * Two things have to stay true for page visibility to be safe.
 *
 * The first is that a page nobody has touched behaves exactly as the shell
 * ships it — the whole batch rests on "a page needs no saved row to work", so
 * anything unreadable in the settings row has to read as "everyone" rather
 * than accidentally hiding a page.
 *
 * The second is the lockout defence: a page the shell refuses to switch off
 * stays visible whatever the settings row says, because the row can be edited
 * by hand and the sign-in page being hidden would lock every admin out.
 */

const everyone = { path: "/pricing", canSwitchOff: true }
const alwaysOn = { path: "/login", canSwitchOff: false }

describe("reading a saved settings row", () => {
  it("treats anything that is not a map as no overrides at all", () => {
    for (const junk of [undefined, null, "off", 7, [], [{ path: "/" }]]) {
      expect(normalizePageOverrides(junk)).toEqual({})
    }
  })

  it("keeps a real override", () => {
    expect(normalizePageOverrides({ "/pricing": { visibility: "off" } })).toEqual(
      { "/pricing": { visibility: "off" } }
    )
  })

  it("drops entries it cannot read rather than guessing", () => {
    const overrides = normalizePageOverrides({
      "/pricing": { visibility: "off" },
      // Not an address.
      "pricing": { visibility: "off" },
      // Not one of the three choices.
      "/tour": { visibility: "invisible" },
      // Not an entry.
      "/contact": "off",
      "/terms": null,
    })

    expect(overrides).toEqual({ "/pricing": { visibility: "off" } })
  })

  it("stores nothing for a page set back to the default", () => {
    // "Untouched" and "set back to normal" have to be one state, or the row
    // grows an entry for every page an admin ever looked at.
    expect(normalizePageOverrides({ "/pricing": { visibility: "everyone" } }))
      .toEqual({})
  })

  it("refuses to read an unbounded number of entries", () => {
    const huge = Object.fromEntries(
      Array.from({ length: MAX_PAGE_OVERRIDES + 50 }, (_, index) => [
        `/page-${index}`,
        { visibility: "off" },
      ])
    )

    expect(Object.keys(normalizePageOverrides(huge))).toHaveLength(
      MAX_PAGE_OVERRIDES
    )
  })
})

describe("who may see a page", () => {
  it("says everyone when nothing is saved", () => {
    expect(pageVisibility({}, everyone)).toBe("everyone")
  })

  it("says what was saved", () => {
    expect(
      pageVisibility({ "/pricing": { visibility: "members" } }, everyone)
    ).toBe("members")
  })

  it("ignores a hand-edited override on a page that cannot be hidden", () => {
    // The screen greys the control out, but the settings row can be edited
    // straight in the database. This is what stops that locking everyone out.
    expect(
      pageVisibility({ "/login": { visibility: "off" } }, alwaysOn)
    ).toBe("everyone")
  })
})

describe("the pages the app cannot live without", () => {
  it("keeps the front page, not-found, the sign-in family and maintenance always on", () => {
    const alwaysOnPaths = publicPages()
      .filter((page) => !page.canSwitchOff)
      .map((page) => page.path)

    expect(alwaysOnPaths).toEqual([
      "/",
      // Where a dead link goes. Hiding it would mean nowhere to send one.
      "/404",
      "/change-email",
      "/forgot-password",
      "/login",
      "/maintenance",
      "/register",
      "/reset-password",
      "/revoke-email-change",
      "/sign-in-link",
      "/verify-email",
    ])
  })
})

describe("when a save is refused, the reason reaches the admin", () => {
  it("passes the server's own sentence straight through", () => {
    // The server already writes these for the reader. Running them through the
    // loader's lookup would replace every one with "the pages list could not
    // be loaded" — wrong, and about the opposite action.
    const refusal =
      '"Sign in" is part of how people reach the app, so it cannot be hidden.'

    expect(getPageVisibilityErrorMessage(new Error(refusal))).toBe(refusal)
  })

  it("says the guard codes in words rather than showing the code", () => {
    expect(getPageVisibilityErrorMessage(new Error("FORBIDDEN"))).toBe(
      "You do not have access to that."
    )
  })

  it("falls back to something honest when there is no message", () => {
    expect(getPageVisibilityErrorMessage(new Error(""))).toBe(
      "That change could not be saved. Please try again."
    )
  })
})

describe("every switchable page enforces its own setting", () => {
  /**
   * The registry's promise is that dropping in a `*.page.ts` makes a page
   * appear everywhere at once. Enforcement is the one part that cannot be
   * automatic — it lives in the page's own loader — so this walks the pages
   * the shell lets an admin hide and insists each route file asks.
   *
   * Same idea as `guards.test.ts`: a convention no single file can enforce,
   * checked across all of them.
   */
  it("calls requirePageVisible in its route loader", () => {
    const missing = publicPages()
      .filter((page) => page.canSwitchOff)
      .filter((page) => {
        const file = page.path === "/" ? "index" : page.path.slice(1)
        const source = readFileSync(
          join(process.cwd(), "src/routes", `${file}.tsx`),
          "utf8"
        )
        return !source.includes(`requirePageVisible("${page.path}")`)
      })
      .map((page) => page.path)

    expect(missing).toEqual([])
  })
})
