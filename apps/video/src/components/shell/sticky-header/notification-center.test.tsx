// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const listNotificationPage = vi.fn()
const markAllNotificationsRead = vi.fn()

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("@/lib/hooks/use-notification-stream", () => ({
  useNotificationStream: () => undefined,
}))
vi.mock("@/lib/hooks/use-app-notification-links", () => ({
  useAppNotificationLinks: () => ({}),
}))
vi.mock("@/lib/api/notification", () => ({
  listNotificationPage: (...args: unknown[]) => listNotificationPage(...args),
  markAllNotificationsRead: () => markAllNotificationsRead(),
  markNotificationRead: vi.fn(),
  countUnreadNotifications: vi.fn(),
  getNotificationErrorMessage: () => "Could not load notifications.",
}))

import { NotificationCenter } from "@/components/shell/sticky-header/notification-center"

const notice = {
  id: "notice-1",
  type: "announcement" as const,
  actor_name: null,
  actor_avatar_url: null,
  recipient_name: "Reader",
  feedback_id: null,
  feedback_message: null,
  changelog_entry_id: null,
  changelog_title: null,
  announcement_id: "announcement-1",
  announcement_title: "Something happened",
  announcement_body: "A line about it",
  read_at: null as string | null,
  created_at: new Date().toISOString(),
}

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  // A stand-in server: the page it hands back reflects the write that landed
  // before it, which is the whole point of doing the two in order.
  let readAt: string | null = null
  listNotificationPage.mockImplementation(async () => ({
    notifications: [{ ...notice, read_at: readAt }],
    unread_count: readAt === null ? 1 : 0,
    next_cursor: null,
  }))
  markAllNotificationsRead.mockImplementation(async () => {
    readAt = new Date().toISOString()
    return { notificationIds: [notice.id], readAt }
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

const bell = () =>
  host.querySelector<HTMLButtonElement>('button[aria-label^="Open notif"]')!

/**
 * Tyler, 16 Sep 2026: clicking the bell clears the red number. The notice it
 * was counting still has to be readable, so the tray keeps it in the Unread
 * list for that one opening.
 */
it("clears the bell's red count on the click that opens the tray", async () => {
  await act(async () => root.render(<NotificationCenter initialUnreadCount={1} />))
  expect(bell().textContent).toContain("1")

  await act(async () => bell().click())
  await act(async () => undefined)

  expect(markAllNotificationsRead).toHaveBeenCalledTimes(1)
  expect(bell().textContent).not.toContain("1")
  expect(document.body.textContent).toContain("Unread (1)")
  expect(document.body.textContent).toContain("Something happened")
})

it("leaves a bell with nothing unread alone", async () => {
  listNotificationPage.mockImplementation(async () => ({
    notifications: [{ ...notice, read_at: new Date().toISOString() }],
    unread_count: 0,
    next_cursor: null,
  }))
  await act(async () => root.render(<NotificationCenter initialUnreadCount={0} />))

  await act(async () => bell().click())
  await act(async () => undefined)

  expect(markAllNotificationsRead).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain("Unread (0)")
})
