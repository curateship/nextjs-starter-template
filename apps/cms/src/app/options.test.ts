import { describe, expect, it, vi } from "vitest"

import { loadDirectoryFrontPageOverride } from "@/app/options"

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

describe("the front page, per host", () => {
  it("does not claim any address except the home page", async () => {
    const load = vi.fn()
    expect(await loadDirectoryFrontPageOverride("/about", load)).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  /**
   * A site's own root belongs to the shell's front page now, which draws that
   * site's rows. This app answers "not mine" so it gets there.
   *
   * The bug this test exists for is the other half: reading "not mine" as
   * "this must be the platform" sent a site's public visitors to a sign-in
   * form.
   */
  it("leaves a site's own address to the shell's front page", async () => {
    expect(
      await loadDirectoryFrontPageOverride("/", async () => ({ host: "site" }))
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
