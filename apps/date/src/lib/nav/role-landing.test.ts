import { describe, expect, it, vi } from "vitest"

vi.mock("@/app/options", async () => ({
  appOptions: (await import("@/lib/test-app-roles")).testAppRoleOptions,
}))
// The page itself is a member's plan and feedback. It is never reached here.
vi.mock("@/lib/api/people/member-home", () => ({
  getMemberHomeErrorMessage: () => "",
  loadMemberHomePage: async () => ({ home: "member home" }),
}))

import { Route } from "@/routes/_authenticated/home"

/**
 * Everyone signs in on `/login` and lands on `/home`, which forwards each
 * role on: an admin to the admin route, an app role to the landing page its
 * app declared, and a member to their own home page.
 */
async function landingFor(role: string, search: unknown = {}) {
  const loader = Route.options.loader as unknown as (args: unknown) => Promise<unknown>
  try {
    return await loader({
      location: { search },
      parentMatchPromise: Promise.resolve({
        loaderData: { user: { role }, settings: { adminRoute: "", memberHomeRoute: "" } },
      }),
    })
  } catch (thrown) {
    return (thrown as { options?: { href?: string } }).options?.href
  }
}

describe("where each role lands after sign-in", () => {
  it("sends an app role to its app's landing page", async () => {
    expect(await landingFor("employee")).toBe("/dashboard")
    expect(await landingFor("editor")).toBe("/editing")
  })

  it("carries an account tab the link asked for", async () => {
    expect(await landingFor("employee", { account: "profile" })).toBe(
      "/dashboard?account=profile"
    )
  })

  it("keeps a member on their own home page, as before", async () => {
    expect(await landingFor("member")).toEqual({ home: { home: "member home" } })
  })
})
