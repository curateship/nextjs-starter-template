// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const router = vi.hoisted(() => ({ navigate: vi.fn() }))

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
  useNavigate: () => router.navigate,
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
    router.navigate.mockReset()
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

  it("clears the shared site search and submits its q value", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    const input = host.querySelector<HTMLInputElement>(
      'input[aria-label="Search this site"]'
    )
    expect(input).not.toBeNull()

    await act(async () => {
      if (!input) return
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      setter?.call(input, "pricing")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

    const clear = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear search"]'
    )
    expect(clear).not.toBeNull()
    await act(async () => clear?.click())
    expect(input?.value).toBe("")

    await act(async () => {
      if (!input) return
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      setter?.call(input, "guides")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      input?.form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      )
    })

    expect(router.navigate).toHaveBeenCalledWith({
      to: "/search",
      search: { q: "guides" },
    })

    await act(async () => root.unmount())
  })
})
