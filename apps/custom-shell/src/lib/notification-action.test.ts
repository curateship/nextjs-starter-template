import { describe, expect, it } from "vitest"

import type { NotificationItem } from "@/lib/api/notification"
import { notificationAction } from "./notification-action"

const failedNotification: NotificationItem = {
  id: "notice-1",
  type: "automation_failed",
  actor_name: null,
  actor_avatar_url: null,
  recipient_name: "Admin",
  feedback_id: null,
  feedback_message: null,
  changelog_entry_id: null,
  changelog_title: null,
  announcement_id: null,
  announcement_title: null,
  announcement_body: null,
  automation_run_id: "run-1",
  automation_id: "automation-1",
  automation_name: "Billing webhook",
  automation_approval_summary: null,
  automation_approval_state: null,
  automation_failure_node_id: "webhook-1",
  automation_failure_node_name: "Webhook",
  automation_failure_error: "The service could not be reached.",
  read_at: null,
  created_at: "2026-08-11T12:00:00.000Z",
}

describe("notificationAction", () => {
  it("opens a failed run and selects its failed node", () => {
    expect(notificationAction(failedNotification)).toEqual({
      kind: "automationRun",
      automationId: "automation-1",
      runId: "run-1",
      nodeId: "webhook-1",
    })
  })
})
