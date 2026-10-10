// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it } from "vitest"

import { NotificationRow } from "@/components/shared/notification-row"
import type { NotificationItem } from "@/lib/api/notification"

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

// A follow-up reminder has nobody behind it and carries its own words. Left
// off the list of notices that do, it read "Somebody commented on your
// feedback" with a "?" and no note.
it("draws a CRM follow-up reminder in its own words", () => {
  const reminder = {
    id: "notice-1",
    type: "crm_follow_up",
    actor_name: null,
    message: "Follow up with Lena Vasquez",
    detail: "She is back from holiday on the 12th.",
    read_at: null,
    created_at: new Date().toISOString(),
  } as unknown as NotificationItem

  act(() => root.render(<NotificationRow item={reminder} onClick={() => {}} />))

  expect(host.textContent).toContain("Follow up with Lena Vasquez")
  expect(host.textContent).toContain("She is back from holiday on the 12th.")
  expect(host.textContent).not.toContain("commented on your feedback")
  expect(host.textContent).not.toContain("?")
})
