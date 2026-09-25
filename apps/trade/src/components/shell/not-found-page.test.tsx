// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const router = vi.hoisted(() => ({ navigate: vi.fn(), pathname: "/missing" }))
const publicSite = vi.hoisted(() => ({
  searchEnabled: true,
  navigation: [
    { label: "Pricing", href: "/pricing" },
    { label: "Guides", href: "/guides" },
  ],
}))

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({
    useLoaderData: () => ({ user: { role: "admin" } }),
  }),
  Link: ({
    to,
    children,
    ...props
  }: React.ComponentProps<"a"> & { to: string }) => (
    <a {...props} href={to}>
      {children}
    </a>
  ),
  useNavigate: () => router.navigate,
  useRouterState: ({
    select,
  }: {
    select: (value: { location: { pathname: string } }) => string
  }) => select({ location: { pathname: router.pathname } }),
}))

vi.mock("@/components/shell/public-page-frame", () => ({
  PublicPageFrame: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
  PublicLink: ({ link }: { link: { label: string; href: string } }) => (
    <a href={link.href}>{link.label}</a>
  ),
}))

vi.mock("@/lib/api/content/pages", () => ({
  loadPublicNotFoundDiscovery: () =>
    Promise.resolve({
      publicSearchEnabled: publicSite.searchEnabled,
      publicNavigation: publicSite.navigation,
    }),
}))

vi.mock("@/lib/branding", () => ({
  useAppName: () => "Custom Shell",
  usePublicSystemCopy: () => ({
    notFoundHeading: "",
    notFoundBody: "",
    maintenanceHeading: "",
    maintenanceBody: "",
  }),
}))

import { PublicNotFound } from "@/components/shell/not-found-page"

describe("PublicNotFound", () => {
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    router.navigate.mockReset()
    router.pathname = "/missing"
    publicSite.searchEnabled = true
    publicSite.navigation = [
      { label: "Pricing", href: "/pricing" },
      { label: "Guides", href: "/guides" },
    ]
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it("searches from the missing page and lists the saved menu exactly", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => root.render(<PublicNotFound />))

    const menuLinks = Array.from(
      host.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Main pages"] a')
    ).map((link) => ({
      label: link.textContent,
      href: link.getAttribute("href"),
    }))
    expect(menuLinks).toEqual([
      { label: "Pricing", href: "/pricing" },
      { label: "Guides", href: "/guides" },
    ])

    const input = host.querySelector<HTMLInputElement>(
      'input[aria-label="Search this site"]'
    )
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      setter?.call(input, "pricing")
      input?.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      input?.form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
    })

    expect(router.navigate).toHaveBeenCalledWith({
      to: "/search",
      search: { q: "pricing" },
    })

    await act(async () => root.unmount())
  })

  it("keeps the original 404 when search is off and the menu is empty", async () => {
    publicSite.searchEnabled = false
    publicSite.navigation = []
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => root.render(<PublicNotFound />))

    expect(host.querySelector('[role="search"]')).toBeNull()
    expect(host.querySelector('nav[aria-label="Main pages"]')).toBeNull()
    expect(host.textContent).toContain("That page does not exist")
    expect(host.textContent).toContain("Go to the front page")
    expect(host.textContent).toContain("Sign in")

    await act(async () => root.unmount())
  })
})
