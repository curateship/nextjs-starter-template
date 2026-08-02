import * as React from "react"
import { format } from "date-fns"
import { Loader2Icon } from "lucide-react"
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
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
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
import { saveAiAllowanceOverride } from "@/lib/api/ai"
import { Input } from "@/components/ui/input"
import {
  isPendingDeletion,
  PENDING_DELETION,
} from "@/lib/account-deletion"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"

type AccountStatus = "active" | "suspended" | typeof PENDING_DELETION

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
  /** Their own monthly AI ceiling in cents, null when they follow their plan. */
  aiOverrideCents: number | null
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

  // Deleted accounts keep their own status here rather than being shown as
  // active, and the control is disabled — so a save can never send it, and
  // nothing pretends the account is something it is not.
  const pendingDeletion = Boolean(account && isPendingDeletion(account))
  const initialStatus: AccountStatus = pendingDeletion
    ? PENDING_DELETION
    : account?.status === "suspended"
      ? "suspended"
      : "active"

  // Cents in the row, dollars in the field — empty means "follow the plan".
  const initialAiDollars =
    account?.aiOverrideCents != null
      ? String(account.aiOverrideCents / 100)
      : ""

  const [role, setRole] = React.useState<"admin" | "member">(
    account?.role === "admin" ? "admin" : "member"
  )
  const [status, setStatus] = React.useState<AccountStatus>(initialStatus)
  const [planId, setPlanId] = React.useState(grantedPlanId)
  const [endsOn, setEndsOn] = React.useState(grantedEndsOn)
  const [aiDollars, setAiDollars] = React.useState(initialAiDollars)
  const [saving, setSaving] = React.useState(false)

  // What the window opened with. Held from the first render so the save can
  // send only what changed, and so closing can tell edits from a look.
  const [initial] = React.useState(() => ({
    role: account?.role === "admin" ? "admin" : "member",
    status: initialStatus,
    planId: grantedPlanId,
    endsOn: grantedEndsOn,
    aiDollars: initialAiDollars,
  }))

  // A window that was only looked at still closes on the first click outside;
  // one with a changed control asks first.
  const dirty =
    role !== initial.role ||
    status !== initial.status ||
    planId !== initial.planId ||
    endsOn !== initial.endsOn ||
    aiDollars !== initial.aiDollars

  const handleSave = React.useCallback(async () => {
    if (!account) return

    dismissErrorToast()

    // Read the allowance field before anything is sent, so a typo cannot
    // leave the save half done.
    const aiText = aiDollars.trim()
    const aiValue = aiText === "" ? null : Number(aiText)
    if (aiValue !== null && (!Number.isFinite(aiValue) || aiValue < 0)) {
      showErrorToast("The AI allowance must be a dollar amount, 0 or more.")
      return
    }

    setSaving(true)
    try {
      // Only send what changed, so a no-op save writes no audit rows.
      if (role !== initial.role) {
        await updateAccountRole(account.id, role)
      }
      // The deletion clock is never sent from here — that control is disabled,
      // and restoring an account is the Users table's job.
      if (status !== initial.status && status !== PENDING_DELETION) {
        await updateAccountStatus(account.id, status)
      }
      if (planId !== initial.planId || endsOn !== initial.endsOn) {
        await grantAccountPlan(
          account.id,
          planId === "none" ? null : planId,
          endsOn ? new Date(`${endsOn}T23:59:59`).toISOString() : null
        )
      }
      if (aiDollars !== initial.aiDollars) {
        await saveAiAllowanceOverride(
          account.id,
          aiValue === null ? null : Math.round(aiValue * 100)
        )
      }

      toast.success("Account updated.")
      await onSaved()
    } catch (saveError) {
      showErrorToast(getAdminUserErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }, [account, aiDollars, endsOn, initial, onSaved, planId, role, status])

  return (
    <FormDialog
      open={Boolean(account)}
      dirty={dirty}
      busy={saving}
      onClose={onClose}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{account?.name ?? "Account"}</DialogTitle>
            <DialogDescription>
              {account?.email ?? "Change what this person can do and pays for."}
            </DialogDescription>
          </DialogHeader>
          {/* No autofocus here on purpose: this window only ever edits an
              account that already exists, and its first control is a dropdown,
              not something you type into. */}
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave()
            }}
          >
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
                    {/* An account on its way out is neither active nor suspended:
                        its status is the deletion clock. Restoring it from the
                        Users table is what gives this control something to say. */}
                    <FieldLabel
                      htmlFor="account-status"
                      hint={
                        pendingDeletion
                          ? "This account is scheduled for deletion. Restore it from the Users table to change this."
                          : "Suspending someone signs them out everywhere and refuses them at sign-in."
                      }
                    >
                      Status
                    </FieldLabel>
                    <Select
                      value={status}
                      disabled={pendingDeletion}
                      onValueChange={(value) => setStatus(value as AccountStatus)}
                    >
                      <SelectTrigger id="account-status" className="w-full sm:w-fit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                        {pendingDeletion ? (
                          <SelectItem value={PENDING_DELETION}>
                            Scheduled for deletion
                          </SelectItem>
                        ) : null}
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
                    <DisabledReason
                      disabled={planId === "none"}
                      reason="There is no granted plan to end. Pick a plan first."
                    >
                      <DatePicker
                        id="account-ends-on"
                        value={
                          endsOn ? new Date(`${endsOn}T00:00:00`) : undefined
                        }
                        disabled={planId === "none"}
                        onChange={(date) =>
                          setEndsOn(date ? format(date, "yyyy-MM-dd") : "")
                        }
                      />
                    </DisabledReason>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>AI allowance</CardTitle>
                <CardDescription>
                  How much AI use this account gets each month, in dollars.
                  Their plan sets it unless you type a number here.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="account-ai-dollars"
                    hint="Empty follows the plan. 0 blocks AI for this account entirely."
                  >
                    Their own limit ($ a month)
                  </FieldLabel>
                  <Input
                    id="account-ai-dollars"
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    placeholder="Follows the plan"
                    className="w-full sm:w-40"
                    value={aiDollars}
                    onChange={(event) => setAiDollars(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
