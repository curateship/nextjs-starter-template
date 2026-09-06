// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const errorToast = vi.hoisted(() => ({ show: vi.fn() }))

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

vi.mock("@/lib/api/people/admin-users", () => ({
  createAccountAsAdmin: vi.fn(),
  getAdminUserErrorMessage: (error: unknown) => String(error),
}))

vi.mock("@/lib/toast/error-toast", () => ({
  dismissErrorToast: vi.fn(),
  showErrorToast: errorToast.show,
}))

import { AddAccountDialog } from "@/components/admin/add-account-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"

function buttonNamed(name: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === name
  )
  if (!button) throw new Error(`${name} button was not rendered`)
  return button
}

describe("AddAccountDialog required fields", () => {
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    errorToast.show.mockReset()
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it("opens clean, marks a blank field after blur, and marks both after submit", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <TooltipProvider>
          <AddAccountDialog
            open
            onClose={vi.fn()}
            onCreated={vi.fn(async () => undefined)}
          />
        </TooltipProvider>
      )
    })

    const name = document.querySelector<HTMLInputElement>("#add-account-name")
    const email = document.querySelector<HTMLInputElement>("#add-account-email")
    expect(name?.hasAttribute("aria-invalid")).toBe(false)
    expect(email?.hasAttribute("aria-invalid")).toBe(false)

    await act(async () => {
      name?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    })
    expect(name?.getAttribute("aria-invalid")).toBe("true")
    expect(email?.hasAttribute("aria-invalid")).toBe(false)

    await act(async () => buttonNamed("Create account").click())
    expect(name?.getAttribute("aria-invalid")).toBe("true")
    expect(email?.getAttribute("aria-invalid")).toBe("true")
    expect(errorToast.show).toHaveBeenCalledWith("Account name is required.")

    await act(async () => root.unmount())
  })
})
