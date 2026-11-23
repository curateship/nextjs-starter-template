import { createServerFn } from "@tanstack/react-start"

import { userGet } from "@/server/guards"
import { loadPlanTab } from "@/server/pomodoro/plan-tab"

/**
 * Settings → Plan, the signed-in member's own plan, next payment, AI credits
 * and space, in one request. The account is always the session's; nothing
 * about whose plan it is comes from the browser. See
 * `workspace/docs/plan-tab.md`.
 */
const loadMyPlanFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadPlanTab(context.user.id))

export const loadMyPlan = () => loadMyPlanFn()
export type MyPlan = Awaited<ReturnType<typeof loadMyPlan>>
