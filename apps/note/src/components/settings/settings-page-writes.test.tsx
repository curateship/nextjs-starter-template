// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useRouterState: () => "/admin/settings/public-navigation",
}))
vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ reportSaveStatus: vi.fn() }),
}))

/**
 * Stands in for the real public settings card so the test can hold on to the
 * handler it was given and call it later, which is the whole point: a handler
 * made in one render and run after another is exactly what a save's answer and
 * a finished upload do.
 */
const handlers: { copyright?: (value: string) => void } = {}
vi.mock("@/components/settings/public-site-settings", () => ({
  PublicSiteSettings: (props: {
    onFooterCopyrightChange: (value: string) => void
  }) => {
    handlers.copyright = props.onFooterCopyrightChange
    return <div />
  },
}))

import { SettingsPage } from "@/components/settings/settings-page"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createDefaultShellConfig } from "@/lib/custom-shell"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

/**
 * Every handler on this page writes a whole new settings record by spreading
 * the one it was rendered with. A handler kept from an earlier render therefore
 * used to rebuild the settings as they were then, quietly undoing anything
 * changed since — the reason a public menu edit took the footer back with it.
 */
describe("a settings handler kept from an earlier render", () => {
  it("writes on top of the newest settings, not the ones it was made with", () => {
    const onConfigChange = vi.fn()
    const props = {
      activeTab: "public-navigation" as const,
      onConfigChange,
      onSaveConfig: vi.fn(async () => true),
      onMaintenanceChange: vi.fn(async () => true),
      maintenanceBusy: false,
      onSessionPolicyChange: vi.fn(async () => true),
      sessionPolicyBusy: false,
    }
    const first = { ...createDefaultShellConfig(), appName: "Before" }
    const second = { ...first, appName: "After" }

    const host = document.createElement("div")
    const root = createRoot(host)
    act(() => {
      root.render(
        <TooltipProvider>
          <SettingsPage {...props} config={first} />
        </TooltipProvider>
      )
    })
    const kept = handlers.copyright
    expect(kept).toBeDefined()

    // The app name changes somewhere else on the page, the way another edit
    // or a save's answer changes it.
    act(() => {
      root.render(
        <TooltipProvider>
          <SettingsPage {...props} config={second} />
        </TooltipProvider>
      )
    })

    act(() => kept?.("© New line"))

    const written = onConfigChange.mock.calls.at(-1)?.[0]
    expect(written.publicFooterCopyright).toBe("© New line")
    expect(written.appName).toBe("After")

    act(() => root.unmount())
  })
})
