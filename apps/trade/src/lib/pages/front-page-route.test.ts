import { describe, expect, it, vi } from "vitest"

import { loadFrontPageRoute } from "@/lib/pages/front-page-route"

describe("front page route precedence", () => {
  it("uses an app-owned front page without loading the shell landing page", async () => {
    const landingLoader = vi.fn(async () => ({ shell: true }))
    const data = await loadFrontPageRoute(
      {
        loader: vi.fn(async ({ path }) => ({ path, app: true })),
        Component: () => null,
      },
      landingLoader
    )

    expect(data).toEqual({ source: "app", data: { path: "/", app: true } })
    expect(landingLoader).not.toHaveBeenCalled()
  })

  it("loads the shell landing page after the app declines the address", async () => {
    const data = await loadFrontPageRoute(
      {
        loader: vi.fn(async () => null),
        Component: () => null,
      },
      vi.fn(async () => ({ shell: true }))
    )

    expect(data).toEqual({ source: "landing", data: { shell: true } })
  })
})
