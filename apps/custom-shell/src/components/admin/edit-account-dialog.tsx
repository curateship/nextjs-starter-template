import * as React from "react"
import { format } from "date-fns"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getAdminUserErrorMessage,
  grantAccountPlan,
  updateAccountRole,
  updateAccountStatus,
  type AssignablePlan,
} from "@/lib/api/admin-users"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"

/**
 * Only the fields the modal edits, so the accounts table row and the account
 * page can both open it without one of them inventing the other's shape.
 */
export type EditableAccount = {
  id: string
  name: string
  email: string
  role: string
  status: string
  planSlug: string
  subscriptionSource: string | null
  currentPeriodEnd: string | null
}

/** Role, status and a granted plan live here, not as controls inside the table. */
export function EditAccountDialog({
  account,
  plans,
  onClose,
  onSaved,
}: {
  account: EditableAccount | null
  plans: AssignablePlan[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const grantedPlanId =
    account?.subscriptionSource === "manual"
      ? (plans.find((plan) => plan.slug === account.planSlug)?.id ?? "none")
      : "none"
  const grantedEndsOn =
    account?.subscriptionSource === "manual" && account.currentPeriodEnd
      ? account.currentPeriodEnd.slice(0, 10)
      : ""

  const [role, setRole] = React.useState<"admin" | "member">(
    account?.role === "admin" ? "admin" : "member"
  )
  const [status, setStatus] = React.useState<"active" | "suspended">(
    account?.status === "suspended" ? "suspended" : "active"
  )
  const [planId, setPlanId] = React.useState(grantedPlanId)
  const [endsOn, setEndsOn] = React.useState(grantedEndsOn)
  const [saving, setSaving] = React.useState(false)

  const initial = React.useRef({
    role: account?.role === "admin" ? "admin" : "member",
    status: account?.status === "suspended" ? "suspended" : "active",
    planId: grantedPlanId,
    endsOn: grantedEndsOn,
  })

  const handleSave = React.useCallback(async () => {
    if (!account) return

    dismissErrorToast()
    setSaving(true)
    try {
      // Only send what changed, so a no-op save writes no audit rows.
      if (role !== initial.current.role) {
        await updateAccountRole(account.id, role)
      }
      if (status !== initial.current.status) {
        await updateAccountStatus(account.id, status)
      }
      if (
        planId !== initial.current.planId ||
        endsOn !== initial.current.endsOn
      ) {
        await grantAccountPlan(
          account.id,
          planId === "none" ? null : planId,
          endsOn ? new Date(`${endsOn}T23:59:59`).toISOString() : null
        )
      }

      toast.success("Account updated.")
      await onSaved()
    } catch (saveError) {
      showErrorToast(getAdminUserErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }, [account, endsOn, onSaved, planId, role, status])

  return (
    <Dialog
      open={Boolean(account)}
      onOpenChange={(open) => {
        if (!open && !saving) onClose()
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{account?.name ?? "Account"}</DialogTitle>
          <DialogDescription>
            {account?.email ?? "Change what this person can do and pays for."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Access</CardTitle>
              <CardDescription>
                Admins reach the whole back office. Suspending someone signs them
                out everywhere.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
                <div className="grid gap-2">
                  <Label htmlFor="account-role">Role</Label>
                  <Select
                    value={role}
                    onValueChange={(value) =>
                      setRole(value as "admin" | "member")
                    }
                  >
                    <SelectTrigger id="account-role" className="w-full sm:w-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="account-status">Status</Label>
                  <Select
                    value={status}
                    onValueChange={(value) =>
                      setStatus(value as "active" | "suspended")
                    }
                  >
                    <SelectTrigger id="account-status" className="w-full sm:w-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Granted plan</CardTitle>
              <CardDescription>
                Puts this person on a paid plan without charging them. Plans paid
                through Stripe are not affected.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="grid gap-2">
                  <Label htmlFor="account-plan">Plan</Label>
                  <Select value={planId} onValueChange={setPlanId}>
                    <SelectTrigger id="account-plan" className="w-full sm:w-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No granted plan</SelectItem>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:flex-1">
                  <FieldLabel
                    htmlFor="account-ends-on"
                    hint="Leave empty to keep the plan until you remove it."
                  >
                    Ends on
                  </FieldLabel>
                  <DatePicker
                    id="account-ends-on"
                    value={endsOn ? new Date(`${endsOn}T00:00:00`) : undefined}
                    disabled={planId === "none"}
                    onChange={(date) =>
                      setEndsOn(date ? format(date, "yyyy-MM-dd") : "")
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
