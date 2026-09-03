import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "@/lib/api/error-message"
import { invalidateDashboardBootstrap } from "@/lib/trade/dashboard-bootstrap-cache"
import { userPost } from "@/server/guards"
import { clearAlerts as clearOwnedAlerts } from "@/server/trade/alerts"

const alertListKindSchema = z.enum(["active", "fired"])
const clearAlertsResultSchema = z.object({ cleared: z.number().int().min(0) })

const clearAlertsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(alertListKindSchema)
  .handler(async ({ data, context }) =>
    clearAlertsResultSchema.parse({
      cleared: await clearOwnedAlerts(context.user.id, data),
    })
  )

export async function clearAlerts(kind: z.infer<typeof alertListKindSchema>) {
  const answer = await clearAlertsFn({ data: kind })
  invalidateDashboardBootstrap()
  return answer
}

export const getClearAlertsErrorMessage = createErrorMessage(
  {},
  "Those alerts could not be cleared. Try again."
)
