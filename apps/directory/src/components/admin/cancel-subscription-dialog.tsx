import * as React from "react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  cancelAccountSubscription,
  getAdminUserErrorMessage,
  type CancelSubscriptionMode,
} from "@/lib/api/people/admin-users"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { formatDate } from "@/lib/format/format-time"

/** Just the fields the cancel needs, so any screen with a row can open it. */
export type CancelableAccount = {
  id: string
  name: string
  planName: string
  subscriptionSource: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

/**
 * "Please cancel my subscription", handled where the admin already is.
 *
 * Stripe subscriptions get the two flavors — stop the renewal (they keep the
 * time they paid for) or end it right now. A granted plan is not billed, so it
 * has no period to wait out: ending it just takes it away.
 */
export function CancelSubscriptionDialog({
  account,
  onClose,
  onDone,
}: {
  account: CancelableAccount | null
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const granted = account?.subscriptionSource === "manual"
  // A plan already ending on its own leaves only one thing left to do sooner.
  const alreadyEnding = Boolean(account?.cancelAtPeriodEnd)
  const [mode, setMode] = React.useState<CancelSubscriptionMode>(
    alreadyEnding ? "immediate" : "period_end"
  )
  const [run, cancelling] = useAsyncAction(getAdminUserErrorMessage)

  const endDate = account?.currentPeriodEnd
    ? formatDate(account.currentPeriodEnd)
    : null

  const handleConfirm = React.useCallback(async () => {
    if (!account) return

    await run(async () => {
      const result = await cancelAccountSubscription(account.id, mode)
      toast.success(
        granted
          ? "Granted plan removed. They are back on the free plan."
          : result.endsAt
            ? `Their plan ends on ${formatDate(result.endsAt)}. They will not be charged again.`
            : "Subscription cancelled. They are back on the free plan."
      )
      await onDone()
    })
  }, [account, granted, mode, onDone, run])

  return (
    <ConfirmDialog
      open={Boolean(account)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={granted ? "End this granted plan?" : "Cancel this subscription?"}
      description={describeCancel(
        account,
        granted,
        alreadyEnding,
        mode,
        endDate
      )}
      confirmLabel={
        granted
          ? "End granted plan"
          : mode === "immediate"
            ? "Cancel it now"
            : "Cancel at period end"
      }
      loading={cancelling}
      onConfirm={() => void handleConfirm()}
    >
      {!granted && !alreadyEnding ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>When it ends</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              <Label htmlFor="cancel-subscription-when">Ends</Label>
              <Select
                value={mode}
                onValueChange={(value) =>
                  setMode(value as CancelSubscriptionMode)
                }
              >
                <SelectTrigger
                  id="cancel-subscription-when"
                  className="w-full sm:w-fit"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="period_end">
                    {endDate
                      ? `When the paid period ends — ${endDate}`
                      : "When the paid period ends"}
                  </SelectItem>
                  <SelectItem value="immediate">Right now</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </ConfirmDialog>
  )
}

/** The consequence in plain words, matching exactly what was picked. */
function describeCancel(
  account: CancelableAccount | null,
  granted: boolean,
  alreadyEnding: boolean,
  mode: CancelSubscriptionMode,
  endDate: string | null
) {
  if (!account) return null

  if (granted) {
    return `${account.name} is on ${account.planName} because an admin granted it — nobody is billed for it. Ending it puts them back on the free plan right away. They will be told by email and in the app.`
  }
  if (alreadyEnding) {
    return `This plan is already set to end${endDate ? ` on ${endDate}` : ""} and will not renew. Cancelling here ends it right now instead. Nothing is refunded by this — money already paid stays paid unless you refund it separately in Stripe. They will be told by email and in the app.`
  }
  if (mode === "immediate") {
    return `${account.name} loses ${account.planName} right away. Nothing is refunded by this — money already paid stays paid unless you refund it separately in Stripe. They will be told by email and in the app.`
  }
  return `${account.name} keeps ${account.planName} until ${endDate ?? "the end of the period they already paid for"}, and is not charged again after that. They will be told by email and in the app.`
}
