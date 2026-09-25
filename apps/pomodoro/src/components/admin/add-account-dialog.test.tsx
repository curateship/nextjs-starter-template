// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const errorToast = vi.hoisted(() => ({ show: vi.fn() }))
const admin = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

vi.mock("@/lib/api/people/admin-users", () => ({
  createAccountAsAdmin: admin.create,
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
    admin.create.mockReset()
    admin.create.mockResolvedValue({ id: "u1", delivered: true })
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

describe("AddAccountDialog password", () => {
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    errorToast.show.mockReset()
    admin.create.mockReset()
    admin.create.mockResolvedValue({ id: "u1", delivered: true })
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  async function fill(input: HTMLInputElement | null, value: string) {
    await act(async () => {
      setNativeValue(input, value)
      input?.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  function setNativeValue(input: HTMLInputElement | null, value: string) {
    if (!input) throw new Error("field was not rendered")
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set
    setter?.call(input, value)
  }

  async function open() {
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
    return root
  }

  it("forgets a typed password when the dialog is closed", async () => {
    const closed = vi.fn()
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <TooltipProvider>
          <AddAccountDialog
            open
            onClose={closed}
            onCreated={vi.fn(async () => undefined)}
          />
        </TooltipProvider>
      )
    })

    await fill(
      document.querySelector<HTMLInputElement>("#add-account-password"),
      "a good long password"
    )
    // A typed password counts as unsaved work, so Cancel asks first.
    await act(async () => buttonNamed("Cancel").click())
    await act(async () => buttonNamed("Discard changes").click())

    expect(closed).toHaveBeenCalled()
    // A password drawn as dots must not follow the admin to the next account.
    expect(
      document.querySelector<HTMLInputElement>("#add-account-password")?.value
    ).toBe("")

    await act(async () => root.unmount())
  })

  it("leaves the password out when the field is empty", async () => {
    const root = await open()
    await fill(
      document.querySelector<HTMLInputElement>("#add-account-name"),
      "Ada"
    )
    await fill(
      document.querySelector<HTMLInputElement>("#add-account-email"),
      "ada@example.com"
    )

    await act(async () => buttonNamed("Create account").click())
    expect(admin.create).toHaveBeenCalledWith(
      "ada@example.com",
      "Ada",
      "member",
      undefined
    )

    await act(async () => root.unmount())
  })

  it("sends a typed password and refuses a short one", async () => {
    const root = await open()
    await fill(
      document.querySelector<HTMLInputElement>("#add-account-name"),
      "Ada"
    )
    await fill(
      document.querySelector<HTMLInputElement>("#add-account-email"),
      "ada@example.com"
    )
    await fill(
      document.querySelector<HTMLInputElement>("#add-account-password"),
      "short"
    )

    await act(async () => buttonNamed("Create account").click())
    expect(admin.create).not.toHaveBeenCalled()
    expect(errorToast.show).toHaveBeenCalledWith(
      "A password needs at least 8 characters."
    )

    await fill(
      document.querySelector<HTMLInputElement>("#add-account-password"),
      "correct horse"
    )
    await act(async () => buttonNamed("Create account").click())
    expect(admin.create).toHaveBeenCalledWith(
      "ada@example.com",
      "Ada",
      "member",
      "correct horse"
    )

    await act(async () => root.unmount())
  })
})
