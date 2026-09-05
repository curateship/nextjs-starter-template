// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const errorToast = vi.hoisted(() => ({ show: vi.fn() }))

vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: errorToast.show,
}))

import { PublicSiteSettings } from "@/components/settings/public-site-settings"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createDefaultPublicHeader } from "@/lib/pages/public-header"

function buttonNamed(name: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === name
  )
  if (!button) throw new Error(`${name} button was not rendered`)
  return button
}

describe("PublicSiteSettings dropdown group validation", () => {
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    errorToast.show.mockReset()
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it("keeps a missing group name beside the field instead of showing a toast", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const onNavigationChange = vi.fn()

    await act(async () => {
      root.render(
        <TooltipProvider>
          <PublicSiteSettings
            navigation={[{ type: "search", visible: true }]}
            footer={[]}
            footerCopyright=""
            publicHeader={createDefaultPublicHeader()}
            onNavigationChange={onNavigationChange}
            onFooterChange={vi.fn()}
            onFooterCopyrightChange={vi.fn()}
            onPublicHeaderChange={vi.fn()}
            onSaveConfig={vi.fn(async () => true)}
          />
        </TooltipProvider>
      )
    })

    const addItem = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Add item to public menu"]'
    )
    expect(addItem).not.toBeNull()

    await act(async () => {
      addItem?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
        })
      )
    })

    const addGroup = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitem"]')
    ).find(
      (candidate) => candidate.textContent?.trim() === "Add dropdown group"
    )
    expect(addGroup).toBeDefined()
    await act(async () => addGroup?.click())

    const name = document.querySelector<HTMLInputElement>(
      "#public-menu-group-name"
    )
    expect(name).not.toBeNull()
    expect(name?.hasAttribute("aria-invalid")).toBe(false)

    await act(async () => buttonNamed("Create group").click())
    const messageId = name?.getAttribute("aria-describedby")
    const message = messageId ? document.getElementById(messageId) : null
    expect(name?.getAttribute("aria-invalid")).toBe("true")
    expect(message?.textContent).toBe("Name is required.")
    expect(message?.getAttribute("role")).toBe("alert")
    expect(document.activeElement).toBe(name)
    expect(errorToast.show).not.toHaveBeenCalled()
    expect(onNavigationChange).not.toHaveBeenCalled()

    await act(async () => root.unmount())
  })
})
