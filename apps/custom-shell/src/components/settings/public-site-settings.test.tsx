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
import { createDefaultPublicBreadcrumbs } from "@/lib/pages/public-breadcrumbs"
import { createDefaultPublicUserPanel } from "@/lib/pages/public-user-panel"

function buttonNamed(name: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === name
  )
  if (!button) throw new Error(`${name} button was not rendered`)
  return button
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
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
            pageWidth={1152}
            publicUserPanel={createDefaultPublicUserPanel()}
            publicBreadcrumbs={createDefaultPublicBreadcrumbs()}
            onNavigationChange={onNavigationChange}
            onFooterChange={vi.fn()}
            onFooterCopyrightChange={vi.fn()}
            onPublicHeaderChange={vi.fn()}
            onPublicUserPanelChange={vi.fn()}
            onPublicBreadcrumbsChange={vi.fn()}
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

describe("PublicSiteSettings menu link window", () => {
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

  async function openNewLinkWindow(onNavigationChange: () => void) {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const onSaveConfig = vi.fn(async () => true)

    await act(async () => {
      root.render(
        <TooltipProvider>
          <PublicSiteSettings
            navigation={[]}
            footer={[]}
            footerCopyright=""
            publicHeader={createDefaultPublicHeader()}
            pageWidth={1152}
            publicUserPanel={createDefaultPublicUserPanel()}
            publicBreadcrumbs={createDefaultPublicBreadcrumbs()}
            onNavigationChange={onNavigationChange}
            onFooterChange={vi.fn()}
            onFooterCopyrightChange={vi.fn()}
            onPublicHeaderChange={vi.fn()}
            onPublicUserPanelChange={vi.fn()}
            onPublicBreadcrumbsChange={vi.fn()}
            onSaveConfig={onSaveConfig}
          />
        </TooltipProvider>
      )
    })

    const addItem = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Add item to public menu"]'
    )
    await act(async () => {
      addItem?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
        })
      )
    })
    const addLink = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitem"]')
    ).find((candidate) => candidate.textContent?.trim() === "Add link")
    await act(async () => addLink?.click())

    return { root, onSaveConfig }
  }

  function linkFields() {
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('[role="dialog"] input')
    )
    return { label: inputs[0], address: inputs[1] }
  }

  it("writes nothing to the menu until a link is added", async () => {
    const onNavigationChange = vi.fn()
    const { root } = await openNewLinkWindow(onNavigationChange)

    expect(linkFields().label).toBeDefined()
    expect(onNavigationChange).not.toHaveBeenCalled()

    await act(async () => root.unmount())
  })

  it("keeps the window open on an unsafe address", async () => {
    const onNavigationChange = vi.fn()
    const { root, onSaveConfig } = await openNewLinkWindow(onNavigationChange)
    const { label, address } = linkFields()

    await act(async () => {
      typeInto(label, "About")
      typeInto(address, "javascript:alert(1)")
    })
    await act(async () => buttonNamed("Done").click())

    expect(address.getAttribute("aria-invalid")).toBe("true")
    expect(errorToast.show).toHaveBeenCalled()
    expect(onSaveConfig).not.toHaveBeenCalled()
    expect(onNavigationChange).not.toHaveBeenCalled()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()

    await act(async () => root.unmount())
  })

  it("names a missing label beside the field and does not save", async () => {
    const onNavigationChange = vi.fn()
    const { root, onSaveConfig } = await openNewLinkWindow(onNavigationChange)
    const { label, address } = linkFields()

    await act(async () => typeInto(address, "/about"))
    await act(async () => buttonNamed("Done").click())

    const messageId = label.getAttribute("aria-describedby")
    const message = messageId ? document.getElementById(messageId) : null
    expect(label.getAttribute("aria-invalid")).toBe("true")
    expect(message?.textContent).toBe("Label is required.")
    expect(onSaveConfig).not.toHaveBeenCalled()
    expect(onNavigationChange).not.toHaveBeenCalled()

    await act(async () => root.unmount())
  })

  it("adds a finished link to the menu and flushes the save", async () => {
    const onNavigationChange = vi.fn()
    const { root, onSaveConfig } = await openNewLinkWindow(onNavigationChange)
    const { label, address } = linkFields()

    await act(async () => {
      typeInto(label, " About ")
      typeInto(address, " /about ")
    })
    await act(async () => buttonNamed("Done").click())

    expect(onNavigationChange).toHaveBeenCalledWith([
      { label: "About", href: "/about" },
    ])
    expect(onSaveConfig).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    await act(async () => root.unmount())
  })

  it("asks before throwing a half-typed link away", async () => {
    const onNavigationChange = vi.fn()
    const { root, onSaveConfig } = await openNewLinkWindow(onNavigationChange)
    const { label } = linkFields()

    await act(async () => typeInto(label, "About"))
    await act(async () => buttonNamed("Cancel").click())
    await act(async () => buttonNamed("Discard changes").click())

    expect(onNavigationChange).not.toHaveBeenCalled()
    expect(onSaveConfig).not.toHaveBeenCalled()

    await act(async () => root.unmount())
  })
})
