// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TopRightSettings } from "@/components/settings/top-right-settings"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { AppHeaderAction } from "@/lib/app-options"
import type { ShellTopRightNavigationItem } from "@/lib/custom-shell"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

const action = (id: string, options: Partial<AppHeaderAction> = {}) =>
  ({
    id,
    label: id === "goal" ? "Goal" : "Search",
    icon: () => null,
    component: async () => ({ default: () => null }),
    ...options,
  }) satisfies AppHeaderAction

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

function mount(items: ShellTopRightNavigationItem[]) {
  const onItemsChange = vi.fn()
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  act(() =>
    root.render(
      <TooltipProvider>
        <TopRightSettings
          items={items}
          onItemsChange={onItemsChange}
          onSaveConfig={async () => true}
          appActions={[
            action("goal", { foldsOnPhone: true, phoneChoice: true }),
            action("search", { foldsOnPhone: true }),
          ]}
          card={{ storageId: "test", title: "Top right", description: "" }}
          reset={{ label: "Reset", description: "", onReset: () => {} }}
        />
      </TooltipProvider>
    )
  )
  return onItemsChange
}

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const phoneButtons = () =>
  [...host.querySelectorAll("button")].filter((button) =>
    button.getAttribute("aria-label")?.startsWith("On a phone")
  )

describe("choosing where an app control goes on a phone", () => {
  it("offers the choice only where the app allows it, starting from the app's own place", () => {
    mount([
      { type: "app", id: "goal", visible: true },
      { type: "app", id: "search", visible: true },
    ])
    expect(phoneButtons()).toHaveLength(1)
    expect(phoneButtons()[0].textContent).toBe("Dropdown")
  })
  it("moves it to the menu bar on a press and saves that", () => {
    const onItemsChange = mount([{ type: "app", id: "goal", visible: true }])
    act(() => phoneButtons()[0].click())
    expect(onItemsChange).toHaveBeenCalledWith([
      { type: "app", id: "goal", visible: true, foldsOnPhone: false },
    ])
  })
  it("reads a saved menu bar choice back and moves it to the dropdown again", () => {
    const onItemsChange = mount([
      { type: "app", id: "goal", visible: true, foldsOnPhone: false },
    ])
    expect(phoneButtons()[0].textContent).toBe("Menu bar")
    act(() => phoneButtons()[0].click())
    expect(onItemsChange).toHaveBeenCalledWith([
      { type: "app", id: "goal", visible: true, foldsOnPhone: true },
    ])
  })
})
