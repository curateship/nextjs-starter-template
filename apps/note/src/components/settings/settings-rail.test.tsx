// @vitest-environment jsdom

import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useRouterState: () => "/admin/settings",
}))
// General settings holds the Storage bucket card, and the AI row holds the AI
// provider keys card. Both put their Saving…/Saved state in the sticky header
// through the shell runtime. There is no ShellLayout above the page in a test.
vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ reportSaveStatus: vi.fn() }),
}))

import {
  SettingsPage,
  getSettingsTabFromPath,
} from "@/components/settings/settings-page"
import { TopLeftNavigationSettings } from "@/components/settings/top-left-navigation-settings"
import { StickyHeaderLeftNav } from "@/components/shell/sticky-header/sticky-header-left-nav"
import { TooltipProvider } from "@/components/ui/tooltip"
import { appSettingsTabs } from "@/lib/app-options"
import { createDefaultShellConfig } from "@/lib/custom-shell"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const props = {
  config: createDefaultShellConfig(),
  onConfigChange: vi.fn(),
  onSaveConfig: vi.fn(async () => true),
  onMaintenanceChange: vi.fn(async () => true),
  maintenanceBusy: false,
  onSessionPolicyChange: vi.fn(async () => true),
  sessionPolicyBusy: false,
}

function markup(activeTab: "general" | "ai") {
  return renderToStaticMarkup(
    <TooltipProvider>
      <SettingsPage {...props} activeTab={activeTab} />
    </TooltipProvider>
  )
}

describe("Settings rail", () => {
  it("has no Navigation or Styling rows: they moved to the Admin dashboard", () => {
    const html = markup("general")
    expect(html).toContain("General settings")
    expect(html).not.toContain(">Navigation<")
    expect(html).not.toContain(">Styling<")
    // The old addresses are not Settings rows any more, so Settings itself
    // falls back to General for them; the route forwards them first.
    expect(getSettingsTabFromPath("/admin/settings/navigation")).toBe("general")
    expect(getSettingsTabFromPath("/admin/settings/public-styling")).toBe("general")
    expect(getSettingsTabFromPath("/admin/settings/public-seo")).toBe("public-seo")
  })

  it("lists SEO and Social with the admin's own rows, under no heading", () => {
    const html = markup("general")
    expect(html).toContain("Platform settings")
    expect(html).toContain("App settings")
    // Tyler, 9 Nov 2026: "move the 2 settings in public into platform
    // settings and remove that subsection".
    expect(html).not.toContain(">Public<")
    expect(html).not.toContain(">Members<")
    const order = [">General settings<", ">Email<", ">Payments<", ">AI<", ">SEO<", ">Social<"].map((label) => html.indexOf(label))
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html.indexOf(">Social<")).toBeLessThan(html.indexOf("App settings"))
    // The App settings card holds what this app added and nothing else, so
    // what belongs in it depends on the app the test is running inside.
    const ownRows = appSettingsTabs().filter(
      (tab) => !["member-navigation", "public-navigation", "public-styling", "public-seo", "public-social"].includes(tab.id)
    )
    if (ownRows.length === 0) {
      expect(html).toContain("This app has no settings of its own.")
    } else {
      expect(html).not.toContain("This app has no settings of its own.")
      for (const tab of ownRows) expect(html).toContain(`>${tab.label}<`)
    }
    // AI provider keys has its own AI row since 8 Oct 2026.
    expect(html).toContain(">AI<")
    expect(html).not.toContain("AI provider keys")
    expect(markup("ai")).toContain("AI provider keys")
    expect(html).toContain("Cloudflare R2")
    expect(html).toContain("Sessions")
    expect(html).toContain("Notifications")
  })

  it("changes the overflow boundary through the actual setting", async () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    function Example() {
      const [config, setConfig] = useState({
        ...createDefaultShellConfig(),
        topLeftNavLimit: 5,
      })
      return (
        <TooltipProvider>
          <TopLeftNavigationSettings
            config={config}
            onConfigChange={setConfig}
            audience="admin"
          />
          <StickyHeaderLeftNav
            limit={config.topLeftNavLimit}
            navLinks={Array.from({ length: 6 }, (_, index) => ({
              label: `Link ${index + 1}`,
            }))}
          />
        </TooltipProvider>
      )
    }
    try {
      await act(async () => root.render(<Example />))
      const overflowButton = host.querySelector<HTMLButtonElement>(
        '[aria-label="1 more link"]'
      )
      expect(overflowButton).not.toBeNull()
      expect(overflowButton?.className).toContain("bg-muted/60")
      expect(overflowButton?.className).toContain("border")
      const trigger = host.querySelector<HTMLButtonElement>(
        "#top-left-nav-limit"
      )!
      await act(async () =>
        trigger.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
        )
      )
      const option = Array.from(
        document.querySelectorAll<HTMLElement>('[role="option"]')
      ).find((el) => el.textContent === "3")!
      expect(option).toBeDefined()
      await act(async () =>
        option.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        )
      )
      expect(host.querySelector('[aria-label="3 more links"]')).not.toBeNull()
      expect(host.textContent).not.toContain("Link 4")
      await act(async () =>
        trigger.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
        )
      )
      const all = Array.from(
        document.querySelectorAll<HTMLElement>('[role="option"]')
      ).find((el) => el.textContent === "Show all")!
      await act(async () =>
        all.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        )
      )
      expect(host.textContent).toContain("Link 6")
      expect(host.querySelector('[aria-label$="more links"]')).toBeNull()
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
