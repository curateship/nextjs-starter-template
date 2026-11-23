// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import { SidebarCollapsible } from "@/components/shell/sidebar/sidebar-group-collapsible"
import { SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

describe("sidebar current page", () => {
  afterEach(() => window.localStorage.clear())

  it("moves the current-page state to the visible parent when its child closes", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    window.matchMedia = () =>
      ({
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList

    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <TooltipProvider>
          <SidebarProvider>
            <SidebarCollapsible
              id="main"
              title="Main"
              entries={[
                {
                  type: "item",
                  id: "dashboard",
                  label: "Dashboard",
                  href: "/admin/dashboard",
                  active: true,
                  children: [
                    {
                      id: "users",
                      label: "Users",
                      href: "/admin/users",
                      active: true,
                    },
                  ],
                },
              ]}
            />
          </SidebarProvider>
        </TooltipProvider>
      )
    })

    expect(
      host.querySelector('a[aria-current="page"]')?.textContent
    ).toContain("Users")

    const toggle = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Toggle Dashboard")
    )
    expect(toggle).toBeTruthy()

    await act(async () => {
      toggle?.click()
    })

    const current = host.querySelectorAll('a[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]?.textContent).toContain("Dashboard")

    await act(async () => root.unmount())
    host.remove()
  })
})
