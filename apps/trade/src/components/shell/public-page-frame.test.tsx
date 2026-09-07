// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PublicNavigationItem } from "@/lib/pages/public-navigation"

const router = vi.hoisted(() => ({ navigate: vi.fn(), pathname: "/" }))
const publicSearch = vi.hoisted(() => ({ enabled: true }))
const publicSite = vi.hoisted(() => ({
  navigation: [
    { label: "Pricing", href: "/pricing" },
    { type: "search", visible: true },
    { label: "Elsewhere", href: "https://example.com" },
  ] as PublicNavigationItem[],
  footer: [{ label: "About", href: "/about?from=footer#team" }],
  copyright: "Copyright",
}))
const publicHeader = vi.hoisted(() => ({
  current: {
    sticky: false,
    menuAlignment: "left" as "left" | "center",
    logoSize: "standard" as "small" | "standard" | "large",
  },
}))
const publicTheme = vi.hoisted(() => ({
  current: {
    brandColor: "",
    brandOverrides: {},
    canvasColor: "",
    pageWidth: 1152,
    mainSpacing: 40,
    contentAlignment: "center" as "left" | "center" | "right",
    backgroundPattern: "none" as const,
    backgroundPatternSize: "medium" as const,
    backgroundPatternOpacity: 8,
    buttonStyle: "solid" as const,
    buttonCasing: "as-written" as const,
    headerBorder: true,
    footerBorder: true,
    colorScheme: "system" as "system" | "light" | "dark",
    font: "system" as const,
    radius: 10,
  },
}))

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
    select({ pathname: router.pathname }),
  useNavigate: () => router.navigate,
}))

vi.mock("@/lib/branding", () => ({
  useAppName: () => "Custom Shell",
  useBrandLogo: () => "",
  useBrandLogoDark: () => "",
  usePublicNavigation: () => publicSite.navigation,
  usePublicFooter: () => publicSite.footer,
  usePublicFooterCopyright: () => publicSite.copyright,
  usePublicSearchEnabled: () => publicSearch.enabled,
  usePublicHeader: () => publicHeader.current,
  usePublicTheme: () => publicTheme.current,
}))

vi.mock("@/lib/api/content/announcements", () => ({
  loadVisitorAnnouncements: () => Promise.resolve([]),
}))

vi.mock("@/components/shell/brand-logo", () => ({
  BrandLogo: ({ size }: { size?: string }) => (
    <span data-brand-logo="" data-logo-size={size ?? "standard"} />
  ),
}))

vi.mock("@/components/shell/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Choose colour mode</button>,
}))

import { PublicPageFrame } from "@/components/shell/public-page-frame"

describe("PublicPageFrame navigation", () => {
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    router.navigate.mockReset()
    router.pathname = "/"
    publicSearch.enabled = true
    publicSite.navigation = [
      { label: "Pricing", href: "/pricing" },
      { type: "search", visible: true },
      { label: "Elsewhere", href: "https://example.com" },
    ]
    publicSite.footer = [
      { label: "About", href: "/about?from=footer#team" },
    ]
    publicSite.copyright = "Copyright"
    publicHeader.current = {
      sticky: false,
      menuAlignment: "left",
      logoSize: "standard",
    }
    publicTheme.current = {
      brandColor: "",
      brandOverrides: {},
      canvasColor: "",
      pageWidth: 1152,
      mainSpacing: 40,
      contentAlignment: "center",
      backgroundPattern: "none",
      backgroundPatternSize: "medium",
      backgroundPatternOpacity: 8,
      buttonStyle: "solid",
      buttonCasing: "as-written",
      headerBorder: true,
      footerBorder: true,
      colorScheme: "system",
      font: "system",
      radius: 10,
    }
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

  it("uses the declared marketing layout with the established frame defaults", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    const main = host.querySelector("main")
    expect(main?.className).toContain("items-start")
    expect(main?.className).not.toContain("place-items-center")
    expect(main?.firstElementChild?.className).toContain("items-center")
    expect(main?.firstElementChild?.className).toContain("text-center")
    expect(main?.getAttribute("style")).toBeNull()
    expect(host.querySelector("[data-public-canvas]")).not.toBeNull()
    expect(host.querySelector("header")?.className).toContain("border-b")
    expect(host.querySelector("header")?.className).not.toContain("sticky")
    expect(
      host.querySelector("header")?.getAttribute("data-menu-alignment")
    ).toBe("left")
    expect(
      host.querySelector("header [data-brand-logo]")?.getAttribute(
        "data-logo-size"
      )
    ).toBe("standard")
    expect(host.querySelector("footer")?.className).toContain("border-t")
    expect(host.textContent).toContain("Choose colour mode")

    await act(async () => root.unmount())
  })

  it("keeps a centered sticky header centred and passes through logo size", async () => {
    publicHeader.current = {
      sticky: true,
      menuAlignment: "center",
      logoSize: "large",
    }
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    const header = host.querySelector("header")
    expect(header?.className).toContain("sticky")
    expect(header?.className).toContain("top-0")
    expect(header?.getAttribute("data-menu-alignment")).toBe("center")
    expect(header?.firstElementChild?.className).toContain("md:grid")
    expect(
      header?.querySelector("[data-public-header-actions]")?.className
    ).toContain("contents")
    expect(
      header
        ?.querySelector("[data-brand-logo]")
        ?.getAttribute("data-logo-size")
    ).toBe("large")

    await act(async () => root.unmount())
  })

  it("shows the configured header even before navigation is added", async () => {
    publicSite.navigation = []
    publicSite.footer = []
    publicSite.copyright = ""
    publicHeader.current = {
      sticky: true,
      menuAlignment: "center",
      logoSize: "large",
    }
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    expect(host.querySelector("header")?.className).toContain("sticky")
    expect(
      host.querySelector("header")?.getAttribute("data-menu-alignment")
    ).toBe("center")
    expect(
      host
        .querySelector("header [data-brand-logo]")
        ?.getAttribute("data-logo-size")
    ).toBe("large")
    expect(host.querySelector('nav[aria-label="Main navigation"]')).toBeNull()

    await act(async () => root.unmount())
  })

  it("applies custom frame values while a card page stays centred", async () => {
    router.pathname = "/login"
    publicTheme.current = {
      ...publicTheme.current,
      canvasColor: "#abcdef",
      pageWidth: 800,
      mainSpacing: 24,
      contentAlignment: "right",
      headerBorder: false,
      footerBorder: false,
      colorScheme: "dark",
    }
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    const frame = host.firstElementChild as HTMLElement | null
    const main = host.querySelector("main") as HTMLElement | null
    const widthElements = [
      host.querySelector<HTMLElement>("header > div"),
      host.querySelector<HTMLElement>("main > div"),
      host.querySelector<HTMLElement>("footer > div"),
    ]

    expect(frame?.style.backgroundColor).toBe("rgb(171, 205, 239)")
    expect(main?.className).toContain("place-items-center")
    expect(main?.firstElementChild?.className).toContain("items-end")
    expect(main?.firstElementChild?.className).toContain("text-right")
    expect(main?.style.paddingBlock).toBe("24px")
    expect(
      widthElements.every((element) => element?.style.maxWidth === "800px")
    ).toBe(true)
    expect(host.querySelector("header")?.className).not.toContain("border-b")
    expect(host.querySelector("footer")?.className).not.toContain("border-t")
    expect(host.textContent).not.toContain("Choose colour mode")

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

  it("renders search in its saved position on desktop and in the phone menu", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    const desktopItems = Array.from(
      host.querySelectorAll('nav[aria-label="Main navigation"] li')
    )
    expect(desktopItems[0]?.textContent).toContain("Pricing")
    expect(
      desktopItems[1]?.querySelector('input[aria-label="Search this site"]')
    ).not.toBeNull()
    expect(desktopItems[2]?.textContent).toContain("Elsewhere")

    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Open navigation menu"]'
    )
    await act(async () => {
      trigger?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 })
      )
    })
    expect(
      Array.from(document.body.querySelectorAll('[role="menuitem"]')).map(
        (item) => item.textContent?.trim()
      )
    ).toEqual(["Pricing", "Search", "Elsewhere"])

    await act(async () => root.unmount())
  })

  it("opens a grouped menu by keyboard and shows the group as a phone section", async () => {
    publicSite.navigation = [
      { type: "search", visible: true },
      {
        type: "group",
        label: "Resources",
        links: [
          { label: "Guides", href: "/guides" },
          { label: "Support", href: "https://example.com/support" },
        ],
      },
      { label: "About", href: "/about" },
    ]
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    const groupTrigger = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Resources"
    )
    await act(async () => {
      groupTrigger?.focus()
      groupTrigger?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    })
    expect(
      Array.from(document.body.querySelectorAll('[role="menuitem"]')).map(
        (item) => item.textContent?.trim()
      )
    ).toEqual(["Guides", "Support"])

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })
    expect(document.body.querySelector('[role="menuitem"]')).toBeNull()

    const phoneTrigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Open navigation menu"]'
    )
    await act(async () => {
      phoneTrigger?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 })
      )
    })
    expect(
      document.body.querySelector('[data-slot="dropdown-menu-label"]')
        ?.textContent
    ).toBe("Resources")
    expect(
      Array.from(document.body.querySelectorAll('[role="menuitem"]')).map(
        (item) => item.textContent?.trim()
      )
    ).toEqual(["Search", "Guides", "Support", "About"])

    await act(async () => root.unmount())
  })

  it("does not offer search when the public search page is switched off", async () => {
    publicSearch.enabled = false
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    expect(
      host.querySelector('input[aria-label="Search this site"]')
    ).toBeNull()

    await act(async () => root.unmount())
  })

  it("keeps menu links but removes a hidden search item", async () => {
    publicSite.navigation = [
      { label: "Pricing", href: "/pricing" },
      { type: "search", visible: false },
      { label: "Elsewhere", href: "https://example.com" },
    ]
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    expect(
      host.querySelector('input[aria-label="Search this site"]')
    ).toBeNull()

    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Open navigation menu"]'
    )
    await act(async () => {
      trigger?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 })
      )
    })
    expect(
      Array.from(document.body.querySelectorAll('[role="menuitem"]')).map(
        (item) => item.textContent?.trim()
      )
    ).toEqual(["Pricing", "Elsewhere"])

    await act(async () => root.unmount())
  })
})
