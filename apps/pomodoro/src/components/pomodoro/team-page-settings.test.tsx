// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(() => "error"), dismiss: vi.fn() },
}))
vi.mock("@/lib/api/pomodoro/teams", () => ({
  loadTeamPage: api.load,
  saveTeamPage: api.save,
}))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock("@/components/pomodoro/text-link", () => ({
  TextLink: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock("@/components/ui/field-label", () => ({
  FieldLabel: ({
    children,
    htmlFor,
  }: {
    children: React.ReactNode
    htmlFor: string
  }) => <label htmlFor={htmlFor}>{children}</label>,
}))

import { TeamPageSettingsCard } from "@/components/pomodoro/team-page-settings"

let root: Root
const live = { handle: "deep-work", pagePublic: true, canPublish: true }

async function show(settings: typeof live) {
  api.load.mockResolvedValue(settings)
  await act(async () => {
    root.render(
      <TeamPageSettingsCard groupId="g1" onChanged={async () => undefined} />
    )
  })
}
const box = () => document.querySelector<HTMLInputElement>("input")
async function typeAndLeave(text: string) {
  const input = box()
  if (!input) throw new Error("No address box")
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set
  await act(async () => {
    setter?.call(input, text)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await act(async () => {
    input.focus()
    input.blur()
  })
}
const button = (text: string) =>
  [...document.querySelectorAll("button")].find(
    (element) => element.textContent === text
  )
async function press(text: string) {
  const found = button(text)
  if (!found) throw new Error(`No ${text} button`)
  await act(async () => found.click())
}

describe("the team page address", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    api.save.mockReset().mockImplementation(async (_id, next) => ({
      ...live,
      ...next,
    }))
    const host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    document.body.replaceChildren()
  })

  it("asks before changing the address of a live page, and Keep puts it back", async () => {
    await show(live)
    await typeAndLeave("focus-club")

    expect(api.save).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Change the page address?")
    expect(document.body.textContent).toContain("/team/deep-work stops working")

    await press("Keep the old address")
    expect(api.save).not.toHaveBeenCalled()
    expect(box()?.value).toBe("deep-work")
  })

  it("saves the new address once confirmed", async () => {
    await show(live)
    await typeAndLeave("focus-club")
    await press("Change address")
    expect(api.save).toHaveBeenCalledWith("g1", {
      handle: "focus-club",
      pagePublic: true,
    })
  })

  it("asks to turn the page off when the box is emptied", async () => {
    await show(live)
    await typeAndLeave("")
    expect(document.body.textContent).toContain("Turn the page off?")
  })

  it("saves without asking while the page is off", async () => {
    await show({ ...live, pagePublic: false })
    await typeAndLeave("focus-club")
    expect(api.save).toHaveBeenCalledWith("g1", {
      handle: "focus-club",
      pagePublic: false,
    })
  })
})
