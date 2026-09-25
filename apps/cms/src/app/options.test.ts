import { describe, expect, it, vi } from "vitest"

import { loadDirectoryFrontPageOverride } from "@/app/options"
import type { DirectoryFrontPageData } from "@/lib/directory/front-page"

/**
 * Where a thrown `redirect()` points.
 *
 * The router hands back a `Response` and keeps the arguments on `options`, so
 * reading `to` off the thrown value itself quietly gives undefined and an
 * assertion against it would pass for the wrong reason.
 */
function redirectFrom(error: unknown) {
  return (error as { options?: { to?: string; replace?: boolean } }).options
}

const somePage = { heading: "Eat Drink Toronto" } as DirectoryFrontPageData

describe("the front page, per host", () => {
  it("does not claim any address except the home page", async () => {
    const load = vi.fn()
    expect(await loadDirectoryFrontPageOverride("/about", load)).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it("gives a site's own address that site's front page", async () => {
    expect(
      await loadDirectoryFrontPageOverride("/", async () => ({
        host: "site",
        page: somePage,
      }))
    ).toBe(somePage)
  })

  /**
   * The bug this test exists for. A site with no home page, and one whose rows
   * all came back empty, both answer "no page" — and the shell's own front page
   * is what draws for them. Reading that as "this must be the platform" sent a
   * site's public visitors to a sign-in form.
   */
  it("lets a site with no home page fall through, rather than sending its visitors to sign in", async () => {
    expect(
      await loadDirectoryFrontPageOverride("/", async () => ({
        host: "site",
        page: null,
      }))
    ).toBeNull()
  })

  it("sends a signed-out reader on the platform's own address to sign in", async () => {
    const error = await loadDirectoryFrontPageOverride("/", async () => ({
      host: "platform",
      signedIn: false,
    })).catch((thrown: unknown) => thrown)

    expect(redirectFrom(error)?.to).toBe("/login")
    expect(redirectFrom(error)?.replace).toBe(true)
  })

  it("sends a signed-in reader to their home, which knows the admin route", async () => {
    const error = await loadDirectoryFrontPageOverride("/", async () => ({
      host: "platform",
      signedIn: true,
    })).catch((thrown: unknown) => thrown)

    expect(redirectFrom(error)?.to).toBe("/home")
    expect(redirectFrom(error)?.replace).toBe(true)
  })
})
