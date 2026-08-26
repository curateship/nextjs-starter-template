// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"

import {
  DashboardCardHeader,
  DashboardCardTab,
  DashboardCardTabsHeader,
  DashboardCardTitleHeader,
} from "@/components/shared/dashboard-card-header"
import { Tabs } from "@/components/ui/tabs"

describe("DashboardCardHeader", () => {
  it("owns the frame used by custom, title and tab headers", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <>
          <DashboardCardHeader>Custom</DashboardCardHeader>
          <DashboardCardTitleHeader
            icon={<span />}
            title="Title"
            back={{ label: "Back", onClick: () => undefined }}
          />
          <Tabs defaultValue="one">
            <DashboardCardTabsHeader>
              <DashboardCardTab value="one" icon={<span />} label="One" />
            </DashboardCardTabsHeader>
          </Tabs>
        </>
      )
    })

    const headers = Array.from(
      host.querySelectorAll<HTMLElement>(
        '[data-slot="dashboard-card-header"]'
      )
    )
    expect(headers).toHaveLength(3)
    for (const header of headers) {
      expect(header.className).toContain("p-3")
      expect(header.className).toContain("border-b")
      expect(
        header.style.getPropertyValue("--dashboard-card-header-height")
      ).toBe("57px")
    }
    expect(host.querySelector('button[aria-label="Back"]')?.className).toContain(
      "size-8"
    )

    await act(async () => root.unmount())
    host.remove()
  })
})
