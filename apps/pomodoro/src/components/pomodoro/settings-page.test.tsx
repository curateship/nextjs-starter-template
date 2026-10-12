// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const loads = vi.hoisted(() => ({ plan: vi.fn() }))

vi.mock("@/lib/pomodoro/auth-state", () => ({
  useProductAuth: () => ({ known: true, authenticated: true }),
}))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ScrollBar: () => null,
}))
// Each panel holds a typed value of its own, the way the real ones hold their
// unsaved edits, so the test can see whether a panel survived.
function Panel({ name }: { name: string }) {
  const [typed, setTyped] = React.useState("")
  return (
    <input
      aria-label={name}
      value={typed}
      onChange={(event) => setTyped(event.target.value)}
    />
  )
}
vi.mock("@/components/pomodoro/timer-settings-panel", () => ({
  default: () => <Panel name="timer" />,
}))
vi.mock("@/components/pomodoro/appearance-settings-panel", () => ({
  default: () => <Panel name="appearance" />,
}))
vi.mock("@/components/pomodoro/profile-settings-panel", () => ({
  default: () => <Panel name="profile" />,
}))
vi.mock("@/components/pomodoro/public-profile-settings-panel", () => ({
  default: () => <Panel name="public" />,
}))
vi.mock("@/components/pomodoro/plan-settings-panel", () => ({
  default: () => {
    loads.plan()
    return <Panel name="plan" />
  },
}))
vi.mock("@/components/pomodoro/blocked-accounts-card", () => ({
  default: () => null,
}))
vi.mock("@/components/pomodoro/streak-badge-card", () => ({ default: () => null }))
vi.mock("@/components/pomodoro/streak-reminder-card", () => ({
  StreakReminderCard: () => null,
}))
vi.mock("@/components/pomodoro/sign-in-button", () => ({ SignInButton: () => null }))

import { SettingsPage } from "@/components/pomodoro/settings-page"
import type { SettingsTab } from "@/lib/pomodoro/settings-tabs"

let root: Root
async function show(tab: SettingsTab) {
  await act(async () => {
    root.render(<SettingsPage tab={tab} onTabChange={() => undefined} />)
  })
}
const box = (name: string) =>
  document.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)

async function type(name: string, text: string) {
  const input = box(name)
  if (!input) throw new Error(`No ${name} panel on screen`)
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set
  await act(async () => {
    setter?.call(input, text)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

describe("the Settings tabs", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    loads.plan.mockReset()
    const host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    document.body.replaceChildren()
  })

  it("keeps an unsaved edit through a trip to another tab", async () => {
    await show("timer")
    await type("timer", "30")

    await show("appearance")
    // Still mounted while hidden, out of sight and out of the Tab order.
    const hiddenTimer = box("timer")?.closest('[data-slot="tabs-content"]')
    expect(hiddenTimer?.getAttribute("data-state")).toBe("inactive")
    expect(hiddenTimer?.className).toContain("data-[state=inactive]:hidden")

    await show("timer")
    expect(box("timer")?.value).toBe("30")
  })

  it("never draws a tab that was not opened", async () => {
    await show("timer")
    expect(box("plan")).toBeNull()
    expect(loads.plan).not.toHaveBeenCalled()

    await show("plan")
    expect(box("plan")).not.toBeNull()
  })
})
