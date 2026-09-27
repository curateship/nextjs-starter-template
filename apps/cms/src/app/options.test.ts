import { describe, expect, it, vi } from "vitest"

import { loadDirectoryFrontPageOverride } from "@/app/options"
import type {
  DirectoryFrontPageData,
  DirectoryFrontPageRow,
} from "@/lib/directory/front-page"

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

const someRow = { kind: "listings", id: "r1" } as DirectoryFrontPageRow
const plansRow = { kind: "plans", id: "r2" } as DirectoryFrontPageRow

function pageWith(rows: DirectoryFrontPageRow[]) {
  return { heading: "Eat Drink Toronto", rows } as DirectoryFrontPageData
}

const somePage = pageWith([someRow])

type PlanBoard = NonNullable<
  Awaited<ReturnType<typeof loadDirectoryFrontPageOverride>>
>

/** One plan is enough for the row to have something to draw. */
const onePlan = {
  plans: [{ slug: "pro" }],
  trialUsed: false,
  signedIn: false,
} as unknown as PlanBoard

const noPlans = {
  plans: [],
  trialUsed: false,
  signedIn: false,
} as unknown as PlanBoard

async function readSomePlans() {
  return noPlans
}

describe("the front page, per host", () => {
  it("does not claim any address except the home page", async () => {
    const load = vi.fn()
    expect(await loadDirectoryFrontPageOverride("/about", load)).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it("gives a site's own address that site's front page", async () => {
    const page = await loadDirectoryFrontPageOverride("/", async () => ({
      host: "site",
      page: somePage,
    }))

    expect(page?.heading).toBe("Eat Drink Toronto")
    expect(page?.rows).toEqual([someRow])
  })

  /**
   * A page with no row of plans never asks about billing. The public plans are
   * a database read and a Stripe-shaped answer, and a home page of listings has
   * no use for either.
   */
  it("reads no plans for a page that has no row of plans", async () => {
    const loadPlans = vi.fn()
    const page = await loadDirectoryFrontPageOverride(
      "/",
      async () => ({ host: "site", page: somePage }),
      loadPlans
    )

    expect(loadPlans).not.toHaveBeenCalled()
    expect(page?.plans).toEqual([])
  })

  it("carries the plans to a page that has a row of plans", async () => {
    const page = await loadDirectoryFrontPageOverride(
      "/",
      async () => ({ host: "site", page: pageWith([someRow, plansRow]) }),
      async () => onePlan
    )

    expect(page?.plans).toHaveLength(1)
    expect(page?.rows.map((row) => row.kind)).toEqual(["listings", "plans"])
  })

  /**
   * A deployment that sells nothing has no plans, so the row has nothing to
   * draw and comes off the page rather than drawing an empty price table.
   */
  it("drops a row of plans when nothing is on sale", async () => {
    const page = await loadDirectoryFrontPageOverride(
      "/",
      async () => ({ host: "site", page: pageWith([someRow, plansRow]) }),
      readSomePlans
    )

    expect(page?.rows.map((row) => row.kind)).toEqual(["listings"])
  })

  it("falls through when a row of plans was the only row", async () => {
    expect(
      await loadDirectoryFrontPageOverride(
        "/",
        async () => ({ host: "site", page: pageWith([plansRow]) }),
        readSomePlans
      )
    ).toBeNull()
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
