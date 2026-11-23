// @vitest-environment jsdom
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { NotificationItem } from "@/lib/api/notification"
import type { NotificationType } from "@/lib/notification-types"

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
    className,
  }: {
    to: string
    search?: Record<string, string>
    children: React.ReactNode
    className?: string
  }) => (
    <a
      href={`${to}${search ? `?${new URLSearchParams(search).toString()}` : ""}`}
      className={className}
    >
      {children}
    </a>
  ),
}))

import { ActivityFeed } from "@/components/shared/dashboard/activity-feed"

/**
 * The admin dashboard's activity feed reads every kind of notice. These are the
 * ones that carry their own words, which used to be drawn as a changelog.
 */

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function notice(
  type: NotificationType,
  overrides: Partial<NotificationItem> = {}
): NotificationItem {
  return {
    id: `n-${type}`,
    type,
    actor_name: null,
    actor_avatar_url: null,
    recipient_name: "Ada Lovelace",
    feedback_id: null,
    feedback_message: null,
    changelog_entry_id: null,
    changelog_title: null,
    announcement_id: null,
    announcement_title: null,
    announcement_body: null,
    automation_run_id: null,
    automation_id: null,
    automation_name: null,
    automation_approval_summary: null,
    automation_approval_state: null,
    automation_failure_node_id: null,
    automation_failure_node_name: null,
    automation_failure_error: null,
    crm_thread_id: null,
    message: null,
    detail: null,
    read_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function render(items: NotificationItem[]) {
  act(() => {
    root.render(<ActivityFeed items={items} view={7} footerTo={null} />)
  })
  return container.textContent ?? ""
}

describe("ActivityFeed", () => {
  it("shows a notice's own words instead of calling it a changelog", () => {
    const text = render([
      notice("account_update", {
        message: "Your role changed to Admin",
        detail: "Changed by Grace",
      }),
      notice("app_activity", {
        id: "n-fill",
        message: "Your order filled",
        detail: "Bought 0.5 BTC at $60,000",
      }),
      notice("crm_follow_up", {
        id: "n-follow",
        message: "Follow up with Linus",
        detail: "You set today as the day to chase",
        crm_thread_id: "thread-1",
      }),
    ])

    expect(text).not.toContain("Changelog")
    expect(text).not.toContain("was published")
    for (const words of [
      "Your role changed to Admin",
      "Changed by Grace",
      "Your order filled",
      "Bought 0.5 BTC at $60,000",
      "Follow up with Linus",
      "You set today as the day to chase",
    ]) {
      expect(text).toContain(words)
    }
    // The follow-up opens its conversation, the way the bell does.
    const link = container.querySelector("a[href^='/admin/crm']")
    expect(link?.getAttribute("href")).toBe("/admin/crm?open=thread-1")
  })

  it("still calls a published update a changelog", () => {
    const text = render([
      notice("changelog", {
        changelog_entry_id: "entry-1",
        changelog_title: "Dark mode",
      }),
    ])

    expect(text).toContain("Changelog was published")
    expect(text).toContain("Dark mode")
  })
})
