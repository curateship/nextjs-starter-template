// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const following = vi.hoisted(() => ({
  send: vi.fn(),
  isFollowing: vi.fn(),
}))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock("sonner", () => ({ toast: { success: toasts.success } }))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: toasts.error }))
vi.mock("@/lib/pomodoro/auth-state", () => ({
  useProductAuth: () => ({ known: true, authenticated: true }),
}))
vi.mock("@/lib/api/pomodoro/following", () => ({
  blockProfile: vi.fn(),
  followProfile: vi.fn(),
  unfollowProfile: vi.fn(),
  loadIsFollowing: following.isFollowing,
  sendCheer: following.send,
}))
vi.mock("@/lib/api/pomodoro/profile-reports", () => ({ reportProfile: vi.fn() }))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock("@/components/pomodoro/text-link", () => ({
  TextLink: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
// The picker's contract is its props: the value it is held at, whether it is
// switched off, and what it reads with nothing chosen. A native select stands
// in for Radix's, which jsdom cannot open, and passes those through as-is.
vi.mock("@/components/ui/select", () => {
  return {
    Select: ({
      value,
      disabled,
      onValueChange,
      children,
    }: {
      value?: string
      disabled?: boolean
      onValueChange?: (value: string) => void
      children: React.ReactNode
    }) => (
      <select
        data-testid={onValueChange ? "picker" : undefined}
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange?.(event.target.value)}
      >
        <option value="">placeholder</option>
        {children}
      </select>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => (
      <option disabled data-placeholder>
        {placeholder}
      </option>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  }
})

import { ProfileActions } from "@/components/pomodoro/profile-actions"

function picker() {
  const element = document.querySelector<HTMLSelectElement>(
    '[data-testid="picker"]'
  )
  if (!element) throw new Error("The cheer picker was not drawn")
  return element
}
const placeholder = () =>
  document.querySelector("[data-placeholder]")?.textContent

async function choose(value: string) {
  const select = picker()
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
}

describe("the cheer picker", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    following.send.mockReset()
    following.isFollowing.mockReset().mockResolvedValue(true)
    toasts.success.mockReset()
    toasts.error.mockReset()
  })
  afterEach(() => document.body.replaceChildren())

  async function render() {
    const host = document.createElement("div")
    document.body.appendChild(host)
    await act(async () => {
      createRoot(host).render(
        <ProfileActions handle="sam" name="Sam" isOwner={false} />
      )
    })
  }

  it("sends the same cheer twice in a row and reads its placeholder after each", async () => {
    following.send.mockResolvedValue(undefined)
    await render()
    expect(placeholder()).toBe("Send a cheer")

    await choose("keep-going")
    expect(picker().value).toBe("")
    expect(placeholder()).toBe("Send a cheer")
    await choose("keep-going")

    expect(following.send).toHaveBeenCalledTimes(2)
    expect(following.send).toHaveBeenNthCalledWith(2, "sam", "keep-going")
    expect(toasts.success).toHaveBeenCalledTimes(2)
    expect(picker().value).toBe("")
  })

  it("says it is sending and cannot be picked again until the answer is in", async () => {
    let finish: () => void = () => {}
    following.send.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    await render()

    await choose("proud")
    expect(picker().disabled).toBe(true)
    expect(placeholder()).toBe("Sending…")
    await choose("proud")
    expect(following.send).toHaveBeenCalledTimes(1)

    await act(async () => finish())
    expect(picker().disabled).toBe(false)
    expect(placeholder()).toBe("Send a cheer")
  })

  it("resets after a refusal too, and says why", async () => {
    following.send.mockRejectedValue(new Error("CHEER_CAP_REACHED"))
    await render()

    await choose("keep-going")
    expect(toasts.error).toHaveBeenCalledWith(
      expect.stringContaining("Try again tomorrow")
    )
    expect(picker().disabled).toBe(false)
    expect(picker().value).toBe("")
    expect(placeholder()).toBe("Send a cheer")
  })
})
