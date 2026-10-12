// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ report: vi.fn(), error: vi.fn() }))

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: api.error }))
vi.mock("@/lib/api/pomodoro/shared-media", () => ({
  reportSharedFile: api.report,
}))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
// Radix's Select cannot open in jsdom. A native select stands in and passes
// the value, the change and the placeholder through.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string
    onValueChange?: (value: string) => void
    children: React.ReactNode
  }) => (
    <select
      data-testid="reason"
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      <option value="">placeholder</option>
      {children}
    </select>
  ),
  SelectTrigger: ({
    children,
    "aria-invalid": invalid,
  }: {
    children: React.ReactNode
    "aria-invalid"?: boolean
  }) => (
    <>
      {invalid ? <span data-invalid /> : null}
      {children}
    </>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <option disabled data-placeholder>
      {placeholder}
    </option>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

import { ReportSharedFileDialog } from "@/components/pomodoro/report-shared-file-dialog"

let root: Root
async function show(open: boolean) {
  await act(async () => {
    root.render(
      <ReportSharedFileDialog
        open={open}
        onOpenChange={() => undefined}
        mediaId="m1"
        name="Rain"
      />
    )
  })
}
const reason = () =>
  document.querySelector<HTMLSelectElement>('[data-testid="reason"]')
const button = (text: string) =>
  [...document.querySelectorAll("button")].find(
    (element) => element.textContent === text
  )
async function pick(value: string) {
  const select = reason()
  if (!select) throw new Error("No reason box")
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
}
async function press(text: string) {
  const found = button(text)
  if (!found) throw new Error(`No ${text} button`)
  await act(async () => found.click())
}

describe("the shared file's Report window", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    api.report.mockReset().mockResolvedValue(undefined)
    api.error.mockReset()
    const host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    document.body.replaceChildren()
  })

  it("opens with no reason picked and asks for one before sending", async () => {
    await show(true)
    expect(reason()?.value).toBe("")
    expect(document.querySelector("[data-placeholder]")?.textContent).toBe(
      "Pick a reason"
    )

    await press("Send report")

    expect(api.report).not.toHaveBeenCalled()
    expect(api.error).toHaveBeenCalledWith("Pick a reason first.")
    expect(document.querySelector("[data-invalid]")).not.toBeNull()
  })

  it("sends the reason picked", async () => {
    await show(true)
    await pick("broken")
    await press("Send report")
    expect(api.report).toHaveBeenCalledWith("m1", "broken")
  })

  it("starts empty again on the next opening", async () => {
    await show(true)
    await pick("broken")
    await show(false)
    await show(true)
    expect(reason()?.value).toBe("")
  })
})
