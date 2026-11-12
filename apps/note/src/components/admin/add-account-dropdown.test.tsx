// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const errorToast = vi.hoisted(() => ({ show: vi.fn() }))
const admin = vi.hoisted(() => ({ create: vi.fn() }))


vi.mock("@/lib/api/people/admin-users", () => ({
  createAccountAsAdmin: admin.create,
  getAdminUserErrorMessage: (error: unknown) => String(error),
}))

vi.mock("@/lib/toast/error-toast", () => ({
  dismissErrorToast: vi.fn(),
  showErrorToast: errorToast.show,
}))

import { useAccountForm } from "@/components/admin/add-account-dropdown"
import { TooltipProvider } from "@/components/ui/tooltip"

/** The form as both dropdowns draw it, with their Create and close presses. */
function Harness() {
  const form = useAccountForm(async () => undefined)
  return (
    <TooltipProvider>
      {form.fields}
      <button type="button" onClick={() => void form.submit()}>
        Create account
      </button>
      <button type="button" onClick={form.forgetPassword}>
        Close
      </button>
    </TooltipProvider>
  )
}

function buttonNamed(name: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === name
  )
  if (!button) throw new Error(`${name} button was not rendered`)
  return button
}

const field = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`)

async function fill(input: HTMLInputElement | null, value: string) {
  if (!input) throw new Error("field was not rendered")
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

describe("the add-account form", () => {
  let root: Root

  beforeEach(async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    errorToast.show.mockReset()
    admin.create.mockReset()
    admin.create.mockResolvedValue({ id: "u1", delivered: true })
    const host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => root.render(<Harness />))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    document.body.replaceChildren()
  })

  it("opens clean, marks a blank field after blur, and marks both after Create", async () => {
    expect(field("add-account-name")?.hasAttribute("aria-invalid")).toBe(false)
    expect(field("add-account-email")?.hasAttribute("aria-invalid")).toBe(false)

    await act(async () => {
      field("add-account-name")?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    })
    expect(field("add-account-name")?.getAttribute("aria-invalid")).toBe("true")
    expect(field("add-account-email")?.hasAttribute("aria-invalid")).toBe(false)

    await act(async () => buttonNamed("Create account").click())
    expect(field("add-account-email")?.getAttribute("aria-invalid")).toBe("true")
    expect(errorToast.show).toHaveBeenCalledWith("Account name is required.")
    expect(admin.create).not.toHaveBeenCalled()
  })

  it("leaves the password out when the field is empty", async () => {
    await fill(field("add-account-name"), "Ada")
    await fill(field("add-account-email"), "ada@example.com")
    await act(async () => buttonNamed("Create account").click())
    expect(admin.create).toHaveBeenCalledWith("ada@example.com", "Ada", "member", undefined)
  })

  it("sends a typed password and refuses a short one", async () => {
    await fill(field("add-account-name"), "Ada")
    await fill(field("add-account-email"), "ada@example.com")
    await fill(field("add-account-password"), "short")
    await act(async () => buttonNamed("Create account").click())
    expect(admin.create).not.toHaveBeenCalled()
    expect(errorToast.show).toHaveBeenCalledWith("A password needs at least 8 characters.")

    await fill(field("add-account-password"), "correct horse")
    await act(async () => buttonNamed("Create account").click())
    expect(admin.create).toHaveBeenCalledWith("ada@example.com", "Ada", "member", "correct horse")
  })

  it("forgets a typed password when the dropdown closes, and keeps the rest", async () => {
    await fill(field("add-account-name"), "Ada")
    await fill(field("add-account-password"), "a good long password")
    await act(async () => buttonNamed("Close").click())
    expect(field("add-account-password")?.value).toBe("")
    expect(field("add-account-name")?.value).toBe("Ada")
  })
})
