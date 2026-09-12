// @vitest-environment jsdom

import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useRouterState: () => "/admin/settings/navigation",
}))

import {
  SettingsPage,
  getSettingsTabFromPath,
} from "@/components/settings/settings-page"
import { TopLeftNavigationSettings } from "@/components/settings/top-left-navigation-settings"
import { StickyHeaderLeftNav } from "@/components/shell/sticky-header/sticky-header-left-nav"
import { TooltipProvider } from "@/components/ui/tooltip"
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

function markup(activeTab: "navigation" | "member-navigation" | "general") {
  return renderToStaticMarkup(
    <TooltipProvider>
      <SettingsPage {...props} activeTab={activeTab} />
    </TooltipProvider>
  )
}

describe("Navigation settings", () => {
  it("puts the limit and both admin editors on Navigation", () => {
    const html = markup("navigation")
    expect(html).toContain("Top left max items")
    expect(html).toContain("Your sidebar")
    expect(html).toContain("Your top right menu")
    expect(markup("general")).not.toContain("Top left max items")
    expect(getSettingsTabFromPath("/admin/settings/navigation")).toBe(
      "navigation"
    )
  })

  it("keeps the member editors together and separate from admin navigation", () => {
    const html = markup("member-navigation")
    expect(html).toContain("Member sidebar")
    expect(html).toContain("Member top right menu")
    expect(html).not.toContain("Your sidebar")
    expect(html).not.toContain("Top left max items")
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
      expect(host.querySelector('[aria-label="1 more link"]')).not.toBeNull()
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
