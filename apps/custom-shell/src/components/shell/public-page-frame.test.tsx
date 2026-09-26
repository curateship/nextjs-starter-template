// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PublicNavigationItem } from "@/lib/pages/public-navigation"
import {
  createDefaultPublicTheme,
  type PublicTheme,
} from "@/lib/public-theme"
import {
  createDefaultPublicUserPanel,
  type PublicUserPanel,
} from "@/lib/pages/public-user-panel"

const router = vi.hoisted(() => ({
  navigate: vi.fn(),
  pathname: "/",
  matches: [] as { routeId: string; status?: string; loaderData?: unknown }[],
}))
const publicBreadcrumbs = vi.hoisted(() => ({
  current: { written: false, search: false, pricing: false },
}))
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
    fullWidth: false,
    width: null as number | null,
    blur: "medium" as "none" | "light" | "medium" | "heavy",
  },
}))
const publicUserPanel = vi.hoisted(() => ({
  current: null as unknown as PublicUserPanel,
}))
const publicTheme = vi.hoisted(() => ({
  current: null as unknown as PublicTheme,
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
  useRouterState: ({
    select,
  }: {
    select: (state: {
      location: { pathname: string }
      matches: typeof router.matches
    }) => unknown
  }) =>
    select({
      location: { pathname: router.pathname },
      matches: router.matches,
    }),
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
  usePublicUserPanel: () => publicUserPanel.current,
  usePublicTheme: () => publicTheme.current,
  usePublicBreadcrumbs: () => publicBreadcrumbs.current,
}))

vi.mock("@/lib/api/content/announcements", () => ({
  loadVisitorAnnouncements: () => Promise.resolve([]),
}))

vi.mock("@/lib/api/auth/auth", () => ({
  loadCurrentUser: () => Promise.resolve(null),
  logout: () => Promise.resolve(),
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
      fullWidth: false,
      width: null,
      blur: "medium",
    }
    publicTheme.current = createDefaultPublicTheme()
    publicUserPanel.current = createDefaultPublicUserPanel()
    router.matches = []
    publicBreadcrumbs.current = {
      written: false,
      search: false,
      pricing: false,
    }
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it("shows no trail until a kind of page is switched on", async () => {
    router.pathname = "/pricing"
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    expect(host.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull()
  })

  it("shows the trail on the kind that is switched on and no other", async () => {
    router.pathname = "/pricing"
    publicBreadcrumbs.current = {
      written: false,
      search: false,
      pricing: true,
    }
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    const trail = host.querySelector('nav[aria-label="Breadcrumb"]')
    expect(trail?.textContent).toBe("HomePricing")
    expect(trail?.querySelector('[aria-current="page"]')?.textContent).toBe(
      "Pricing"
    )

    router.pathname = "/search"
    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })
    expect(host.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull()
  })

  it("names a written page by its own title, not the browser title", async () => {
    router.pathname = "/about"
    router.matches = [
      {
        routeId: "/$",
        loaderData: { source: "written", page: { title: "About us" } },
      },
    ]
    publicBreadcrumbs.current = {
      written: true,
      search: false,
      pricing: false,
    }
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    expect(
      host.querySelector('nav[aria-label="Breadcrumb"]')?.textContent
    ).toBe("HomeAbout us")
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
      fullWidth: false,
      width: null,
      blur: "medium",
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
    expect(
      header?.querySelector("nav > div > div")?.className
    ).toContain("lg:grid")
    expect(
      header?.querySelector("[data-public-header-actions]")?.className
    ).toContain("lg:w-full")
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
      fullWidth: false,
      width: null,
      blur: "medium",
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
      canvasColor: { mode: "custom", strength: 60, color: "#abcdef" },
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
      host.querySelector<HTMLElement>("header nav > div"),
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

  it("carries the spacing, border and chrome settings onto the public frame", async () => {
    publicTheme.current = {
      ...publicTheme.current,
      gutter: 24,
      cardBorderWidth: 3,
      cardBorderColor: { mode: "custom", strength: 60, color: "#112233" },
      dividerColor: { mode: "custom", strength: 60, color: "#445566" },
      chrome: { mode: "custom", strength: 60, color: "#778899" },
    }
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    const frame = host.firstElementChild as HTMLElement | null
    const main = host.querySelector("main") as HTMLElement | null
    const column = main?.firstElementChild as HTMLElement | null

    expect(frame?.getAttribute("data-content-styling")).toBe("")
    expect(frame?.getAttribute("data-flat")).toBeNull()
    expect(frame?.style.getPropertyValue("--shell-card-border-width")).toBe("3")
    expect(frame?.style.getPropertyValue("--shell-card-border-color")).toBe(
      "#112233"
    )
    expect(frame?.style.getPropertyValue("--border")).toBe("#445566")
    expect(frame?.style.getPropertyValue("--shell-gutter")).toBe("24px")
    expect(main?.style.paddingInline).toBe("24px")
    // One edge for the whole page: the bar above the content and the footer
    // below it take the same padding main does.
    expect(
      (host.querySelector("header") as HTMLElement | null)?.style.paddingInline
    ).toBe("24px")
    expect(
      (host.querySelector("footer") as HTMLElement | null)?.style.paddingInline
    ).toBe("24px")
    expect(column?.style.gap).toBe("24px")
    expect(column?.className).not.toContain("gap-2")
    expect(host.querySelector("header")?.style.backgroundColor).toBe(
      "rgb(119, 136, 153)"
    )
    expect(host.querySelector("footer")?.style.backgroundColor).toBe(
      "rgb(119, 136, 153)"
    )
    expect(document.documentElement.style.getPropertyValue("--border")).toBe(
      "#445566"
    )

    await act(async () => root.unmount())

    // Nothing writes these back, so an admin returning to the signed-in app
    // would otherwise keep the public colours on every dialog and dropdown.
    expect(document.documentElement.style.getPropertyValue("--border")).toBe("")
    expect(
      document.documentElement.style.getPropertyValue("--shell-modal-padding")
    ).toBe("")
  })

  it("flattens the public frame when content spacing is zero", async () => {
    publicTheme.current = { ...publicTheme.current, gutter: 0 }
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    const frame = host.firstElementChild as HTMLElement | null
    const main = host.querySelector("main") as HTMLElement | null

    expect(frame?.getAttribute("data-flat")).toBe("true")
    expect(main?.style.paddingInline).toBe("0px")
    expect(main?.className).not.toContain("px-4")
    expect(
      (host.querySelector("header") as HTMLElement | null)?.style.paddingInline
    ).toBe("0px")
    expect(
      (host.querySelector("footer") as HTMLElement | null)?.style.paddingInline
    ).toBe("0px")

    await act(async () => root.unmount())
  })

  it("keeps the responsive gap while content spacing is untouched", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    const main = host.querySelector("main") as HTMLElement | null
    const column = main?.firstElementChild as HTMLElement | null

    expect(main?.className).toContain("px-4")
    expect(main?.style.paddingInline).toBe("")
    expect(host.querySelector("header")?.className).toContain("px-4")
    expect(host.querySelector("footer")?.className).toContain("px-4")
    expect(column?.className).toContain("gap-2 md:gap-3")
    expect(column?.style.gap).toBe("")

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
    await act(async () => trigger?.click())
    expect(
      host.querySelector("header nav")?.getAttribute("data-state")
    ).toBe("active")

    const menuLink = host.querySelector<HTMLAnchorElement>(
      '#public-phone-menu a[href="/pricing"]'
    )
    expect(menuLink).not.toBeNull()
    await act(async () => menuLink?.click())

    expect(
      host.querySelector("header nav")?.getAttribute("data-state")
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
    await act(async () => trigger?.click())
    expect(
      Array.from(host.querySelectorAll("#public-phone-menu a")).map((item) =>
        item.textContent?.trim()
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
    await act(async () => phoneTrigger?.click())
    expect(
      host.querySelector("#public-phone-menu p")?.textContent
    ).toBe("Resources")
    expect(
      Array.from(host.querySelectorAll("#public-phone-menu a")).map((item) =>
        item.textContent?.trim()
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
    await act(async () => trigger?.click())
    expect(
      Array.from(host.querySelectorAll("#public-phone-menu a")).map((item) =>
        item.textContent?.trim()
      )
    ).toEqual(["Pricing", "Elsewhere"])

    await act(async () => root.unmount())
  })

  it("follows the page width until the header has its own, and blurs as chosen", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const render = () =>
      act(async () => {
        root.render(<PublicPageFrame>Page</PublicPageFrame>)
      })
    const header = () => host.querySelector("header")
    const inner = () => host.querySelector<HTMLElement>("header > nav > div")

    await render()
    expect(inner()?.style.maxWidth).toBe("")
    expect(header()?.className).toContain("backdrop-blur-xl")

    publicHeader.current = { ...publicHeader.current, width: 900, blur: "none" }
    await render()
    expect(inner()?.style.maxWidth).toBe("900px")
    expect(header()?.className).not.toContain("backdrop-blur")

    publicHeader.current = {
      ...publicHeader.current,
      fullWidth: true,
      blur: "heavy",
    }
    await render()
    expect(inner()?.style.maxWidth).toBe("none")
    expect(header()?.className).toContain("backdrop-blur-3xl")

    await act(async () => root.unmount())
  })

  it("draws the saved sign-in buttons and hides one with no address", async () => {
    const defaults = createDefaultPublicUserPanel()
    publicUserPanel.current = {
      ...defaults,
      login: { ...defaults.login, label: "Log in", href: "/auth?tab=login" },
      register: { ...defaults.register, href: "" },
    }
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    const actions = host.querySelector("[data-public-header-actions]")
    expect(
      actions?.querySelector('a[href="/auth?tab=login"]')?.textContent
    ).toBe("Log in")
    expect(actions?.textContent).not.toContain("Create an account")
    expect(
      actions?.querySelector('button[aria-label="Open account menu"]')
    ).not.toBeNull()

    await act(async () => root.unmount())
  })

  it("drops the phone account button when no sign-in button shows on phones", async () => {
    const defaults = createDefaultPublicUserPanel()
    publicUserPanel.current = {
      ...defaults,
      login: { ...defaults.login, showOnPhone: false },
      register: { ...defaults.register, showOnPhone: false },
    }
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(<PublicPageFrame>Page</PublicPageFrame>)
    })

    const actions = host.querySelector("[data-public-header-actions]")
    expect(actions?.textContent).toContain("Sign in")
    expect(
      actions?.querySelector('button[aria-label="Open account menu"]')
    ).toBeNull()

    await act(async () => root.unmount())
  })
})
