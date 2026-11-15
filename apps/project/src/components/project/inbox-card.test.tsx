// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const navigate = vi.fn()

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useRouter: () => ({ invalidate: vi.fn() }),
}))
vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ onOpenFeedbackThread: vi.fn() }),
  useOptionalShellRuntime: () => null,
}))
vi.mock("@/lib/hooks/use-app-notification-details", () => ({
  useAppNotificationDetails: () => ({}),
}))
vi.mock("@/lib/api/notification", () => ({
  listNotificationPage: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(async () => undefined),
}))

import { TooltipProvider } from "@/components/ui/tooltip"
import { InboxCard } from "@/components/project/inbox-card"
import type { NotificationItem } from "@/lib/api/notification"

/** An automation notice: an approval waiting on me, or a failed run. */
function automationNotice(type: "automation_approval" | "automation_failed", name: string) {
  return {
    id: `${type}-1`,
    type,
    actor_name: null,
    actor_avatar_url: null,
    recipient_name: "Reader",
    feedback_id: null,
    feedback_message: null,
    announcement_id: null,
    announcement_title: null,
    announcement_body: null,
    automation_run_id: "run-1",
    automation_id: "flow-1",
    automation_name: name,
    automation_approval_summary: null,
    automation_approval_state: null,
    automation_failure_node_id: "node-1",
    automation_failure_node_name: null,
    automation_failure_error: null,
    read_at: null,
    created_at: new Date().toISOString(),
  } as unknown as NotificationItem
}

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

async function pressNotice(item: NotificationItem, name: string) {
  await act(async () =>
    root.render(
      <TooltipProvider>
        <InboxCard inbox={{ notifications: [item], nextCursor: null }} />
      </TooltipProvider>
    )
  )
  // The row's one click target, a button laid over it and named by its heading.
  const row = host.querySelector<HTMLButtonElement>(`button[aria-label="Open: ${name}"]`)
  expect(row, `a row showing "${name}"`).toBeTruthy()
  await act(async () => row!.click())
}

it("opens an approval in the Automations dashboard's Waiting on you", async () => {
  await pressNotice(automationNotice("automation_approval", "Welcome flow"), "Welcome flow")
  expect(navigate).toHaveBeenCalledWith({
    to: "/admin/automations",
    search: { tab: "waiting", open: "run-1" },
  })
})

it("opens a failed run on its flow's Runs tab", async () => {
  await pressNotice(automationNotice("automation_failed", "Nightly flow"), "Nightly flow")
  expect(navigate).toHaveBeenCalledWith({
    to: "/admin/automations",
    search: { tab: "automations", open: "flow-1", full: true, pane: "runs", run: "run-1" },
  })
})
