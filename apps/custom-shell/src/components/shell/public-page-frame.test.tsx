// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    hash,
    children,
    onClick,
    ...props
  }: React.ComponentProps<"a"> & {
    to: string
    search?: Record<string, string>
    hash?: string
  }) => {
    const query = search
      ? `?${new URLSearchParams(search).toString()}`
      : ""
    return (
      <a
        {...props}
        href={`${to}${query}${hash ? `#${hash}` : ""}`}
        data-router-link=""
        onClick={(event) => {
          onClick?.(event)
          event.preventDefault()
        }}
      >
        {children}
      </a>
    )
  },
  useLocation: ({ select }: { select: (value: { pathname: string }) => string }) =>
    select({ pathname: "/" }),
  useNavigate: () => vi.fn(),
}))

vi.mock("@/lib/branding", () => ({
  useAppName: () => "Custom Shell",
  useBrandLogo: () => "",
  useBrandLogoDark: () => "",
  usePublicNavigation: () => [
    { label: "Pricing", href: "/pricing" },
    { label: "Elsewhere", href: "https://example.com" },
  ],
  usePublicFooter: () => [{ label: "About", href: "/about?from=footer#team" }],
  usePublicFooterCopyright: () => "Copyright",
}))

vi.mock("@/lib/api/content/announcements", () => ({
  loadVisitorAnnouncements: () => Promise.resolve([]),
}))

vi.mock("@/components/shell/brand-logo", () => ({
  BrandLogo: () => <span data-brand-logo="" />,
}))

import { PublicPageFrame } from "@/components/shell/public-page-frame"

describe("PublicPageFrame navigation", () => {
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it("uses router links on this site and keeps outside links as anchors", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    expect(
      host.querySelector('a[href="/"][data-router-link]')
    ).not.toBeNull()
    expect(
      host.querySelector('a[href="/pricing"][data-router-link]')
    ).not.toBeNull()
    expect(
      host.querySelector(
        'a[href="/about?from=footer#team"][data-router-link]'
      )
    ).not.toBeNull()
    expect(
      host.querySelector('a[href="https://example.com"][data-router-link]')
    ).toBeNull()

    await act(async () => root.unmount())
  })

  it("closes the phone menu after an internal link is chosen", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Open navigation menu"]'
    )
    expect(trigger).not.toBeNull()
    await act(async () => {
      trigger?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 })
      )
    })

    const menuLink = document.body.querySelector<HTMLAnchorElement>(
      '[role="menuitem"][href="/pricing"]'
    )
    expect(menuLink).not.toBeNull()
    await act(async () => menuLink?.click())

    expect(
      document.body.querySelector('[role="menuitem"][href="/pricing"]')
    ).toBeNull()

    await act(async () => root.unmount())
  })
})
