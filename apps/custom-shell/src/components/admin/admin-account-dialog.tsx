import * as React from "react"
import { Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { BanIcon, HardDriveIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { CancelSubscriptionDialog } from "@/components/admin/cancel-subscription-dialog"
import { Badge } from "@/components/ui/badge"
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
import { DisabledReason } from "@/components/ui/disabled-reason"
import { ErrorBanner } from "@/components/ui/error-banner"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  isPendingDeletion,
  PENDING_DELETION,
  restoreDeadline,
} from "@/lib/account-deletion"
import {
  getAdminUserErrorMessage,
  grantAccountPlan,
  loadAdminAccountDetail,
  updateAccountRole,
  updateAccountStatus,
  type AccountDetail,
  type AssignablePlan,
} from "@/lib/api/admin-users"
import { saveAiAllowanceOverride } from "@/lib/api/ai"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { formatFileSize } from "@/lib/format-bytes"
import { formatDate, formatDateTime, formatUtcDate } from "@/lib/format-time"
import { formatMoney } from "@/lib/money"
import {
  BILLING_HISTORY_START,
  describeSubscriptionEvent,
  SUBSCRIPTION_EVENT_LIMIT,
  type SubscriptionEvent,
} from "@/lib/subscription-events"

/**
 * Everything about one person, in one window opened from the Users table.
 *
 * Details is the whole account read back — who they are, what they pay for,
 * what they have uploaded. Edit is the same set of controls the table's
 * settings icon has always opened. Both read one load, so the two tabs can
 * never disagree about the account they are describing.
 */
const ADMIN_ACCOUNT_TABS = ["details", "edit"] as const
export type AdminAccountTab = (typeof ADMIN_ACCOUNT_TABS)[number]

const TAB_LABELS: Record<AdminAccountTab, string> = {
  details: "Details",
  edit: "Edit",
}

const EDIT_FORM_ID = "admin-account-edit-form"

type AccountStatus = "active" | "suspended" | typeof PENDING_DELETION

/** What the Edit tab is doing, so the window's footer and guard can see it. */
type EditStatus = { dirty: boolean; saving: boolean }

export function AdminAccountDialog({
  userId,
  initialTab,
  onClose,
  onSaved,
}: {
  /** Whose account, or null when the window is closed. */
  userId: string | null
  initialTab: AdminAccountTab
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [tab, setTab] = React.useState<AdminAccountTab>(initialTab)
  // The account and the plans it can be granted arrive together, so the window
  // needs nothing from whoever opened it beyond an id — which is what lets a
  // pasted `?open=` link work for somebody who is not on the page of the list.
  const [loaded, setLoaded] = React.useState<{
    detail: AccountDetail
    plans: AssignablePlan[]
  } | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<EditStatus>({
    dirty: false,
    saving: false,
  })
  const [cancellingPlan, setCancellingPlan] = React.useState(false)
  // Bumped by Retry. The load lives in the effect rather than in a callback the
  // effect calls, so a reply that lands after the window moved on is dropped
  // instead of overwriting whoever is on screen now.
  const [attempt, setAttempt] = React.useState(0)
  const detail = loaded?.detail ?? null

  React.useEffect(() => {
    if (!userId) return
    let active = true

    loadAdminAccountDetail(userId)
      .then((result) => {
        if (!active) return
        setLoaded(result)
        setLoadError(null)
      })
      .catch((error) => {
        if (!active) return
        setLoadError(getAdminUserErrorMessage(error))
      })

    return () => {
      active = false
    }
  }, [userId, attempt])

  // Nothing has answered yet. Derived rather than a flag set on the way in, so
  // there is no state to keep in step with the request.
  const loading = Boolean(userId) && !detail && !loadError

  return (
    <>
      <FormDialog
        open={Boolean(userId)}
        dirty={status.dirty}
        busy={status.saving}
        onClose={onClose}
      >
        {(requestClose) => (
          <DialogContent
            variant="admin"
            // One fixed height for both tabs. Details is much longer than Edit,
            // and a window sized by its content re-centres itself on every
            // switch. The admin variant's max-height still caps this on short
            // screens, and the body scrolls inside the frame either way.
            className="h-[48rem] sm:max-w-2xl"
          >
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as AdminAccountTab)}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <DialogTitle>{detail?.profile.name ?? "Account"}</DialogTitle>
                  <TabsList>
                    {ADMIN_ACCOUNT_TABS.map((id) => (
                      <TabsTrigger key={id} value={id}>
                        {TAB_LABELS[id]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                <DialogDescription>
                  {detail?.profile.email ??
                    "Change what this person can do and pays for."}
                </DialogDescription>
              </DialogHeader>

              {loadError ? (
                <DialogBody>
                  <ErrorBanner
                    message={loadError}
                    onRetry={() => {
                      setLoadError(null)
                      setAttempt((count) => count + 1)
                    }}
                  />
                </DialogBody>
              ) : loading || !loaded ? (
                <DialogBody>
                  <div className="flex items-center justify-center py-10">
                    <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
                  </div>
                </DialogBody>
              ) : (
                <DialogBody>
                  {/* A tab panel is a cell of the body's grid, so without
                      `min-w-0` it is as wide as its widest child — one long
                      email would then stretch every card past the edge of a
                      phone screen. */}
                  <TabsContent value="details" className="min-w-0">
                    <AccountDetailsPanel detail={loaded.detail} />
                  </TabsContent>
                  {/* Edit holds typed work, so it stays mounted for the life of
                      the window — a trip to Details and back leaves a
                      half-changed allowance exactly where it was. Radix leaves
                      a force-mounted panel visible, so `hidden` is ours. */}
                  <TabsContent
                    value="edit"
                    className="min-w-0"
                    forceMount
                    hidden={tab !== "edit"}
                  >
                    <AccountEditPanel
                      detail={loaded.detail}
                      plans={loaded.plans}
                      onStatusChange={setStatus}
                      onCancelPlan={() => setCancellingPlan(true)}
                      onSaved={onSaved}
                    />
                  </TabsContent>
                </DialogBody>
              )}

              {/* Both footers are keyed. Without it React keeps the one
                  button's DOM node and rewrites it — the black "Done" becomes
                  "Cancel" in place, and `Button`'s own 150ms transition then
                  animates it from black to white, so Cancel flashed dark on
                  every tab switch. A key per tab swaps the node instead. */}
              {tab === "edit" && detail ? (
                <DialogFooter key="edit">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={requestClose}
                    disabled={status.saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form={EDIT_FORM_ID}
                    disabled={status.saving}
                  >
                    {status.saving ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : null}
                    Save changes
                  </Button>
                </DialogFooter>
              ) : (
                // Details saves nothing, so it ends with a single "Done" and no
                // Cancel. It leaves by the same path as the X, so a half-changed
                // Edit tab is still asked about.
                <DialogFooter key="details">
                  <Button
                    type="button"
                    disabled={status.saving}
                    onClick={requestClose}
                  >
                    Done
                  </Button>
                </DialogFooter>
              )}
            </Tabs>
          </DialogContent>
        )}
      </FormDialog>

      <CancelSubscriptionDialog
        // Remounts per opening so the when-it-ends choice never carries over.
        key={cancellingPlan ? "cancel-open" : "cancel-closed"}
        account={
          cancellingPlan && detail
            ? {
                id: detail.profile.id,
                name: detail.profile.name,
                planName: detail.subscription.planName,
                subscriptionSource: detail.subscription.source,
                currentPeriodEnd: detail.subscription.currentPeriodEnd,
                cancelAtPeriodEnd: detail.subscription.cancelAtPeriodEnd,
              }
            : null
        }
        onClose={() => setCancellingPlan(false)}
        onDone={async () => {
          // The plan this window opened with is gone, so it closes with the
          // cancel rather than showing stale plan facts.
          setCancellingPlan(false)
          await onSaved()
        }}
      />
    </>
  )
}

/** The whole account read back, in the order a support question asks it. */
function AccountDetailsPanel({ detail }: { detail: AccountDetail }) {
  const { profile, subscription, storage } = detail

  return (
    <div className="grid gap-[var(--shell-modal-padding,1.5rem)]">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Who they are and how they got in.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <DetailRow
            label="Role"
            value={
              <Badge variant={profile.role === "admin" ? "default" : "outline"}>
                {profile.role === "admin" ? "Admin" : "Member"}
              </Badge>
            }
          />
          <DetailRow
            label="Status"
            value={
              <Badge
                variant={
                  profile.status === "active" ? "secondary" : "destructive"
                }
              >
                {isPendingDeletion(profile)
                  ? "Scheduled for deletion"
                  : profile.status === "suspended"
                    ? "Suspended"
                    : "Active"}
              </Badge>
            }
          />
          {/* Only while the clock is running. Restoring is on the Users table,
              which is the one place an account comes back from. */}
          {isPendingDeletion(profile) && profile.deletedAt ? (
            <DetailRow
              label="Deletes on"
              value={formatDate(restoreDeadline(profile.deletedAt))}
            />
          ) : null}
          <DetailRow
            label="Email verified"
            value={
              profile.emailVerifiedAt
                ? formatDate(profile.emailVerifiedAt)
                : "Not verified"
            }
          />
          <DetailRow label="Joined" value={formatDate(profile.createdAt)} />
          <DetailRow
            label="Last changed"
            value={formatDateTime(profile.updatedAt)}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Plan</CardTitle>
          <CardDescription>
            {subscription.isPaid
              ? "What they are on and until when."
              : "Nobody is billing this account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <DetailRow
            label="Plan"
            value={
              <Badge variant={subscription.isPaid ? "default" : "secondary"}>
                {subscription.planName}
              </Badge>
            }
          />
          <DetailRow
            label="Paid by"
            value={
              subscription.source === "manual"
                ? "Granted by an admin"
                : subscription.source === "stripe"
                  ? "Stripe"
                  : "Nobody — free plan"
            }
          />
          <DetailRow
            label="Billing status"
            value={
              subscription.isPaid
                ? `${subscriptionStatusText(subscription.status)}${
                    subscription.interval
                      ? `, billed ${subscription.interval}`
                      : ""
                  }`
                : "—"
            }
          />
          <DetailRow
            label={subscription.cancelAtPeriodEnd ? "Ends on" : "Renews on"}
            value={
              subscription.currentPeriodEnd
                ? formatDate(subscription.currentPeriodEnd)
                : subscription.isPaid
                  ? "No end date"
                  : "—"
            }
          />
          <DetailRow
            label="Trial ends"
            value={
              subscription.trialEndsAt
                ? formatDate(subscription.trialEndsAt)
                : "Not on a trial"
            }
          />
          <DetailRow
            label="AI allowance"
            value={aiAllowanceText(detail.aiAllowance)}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Storage</CardTitle>
          <CardDescription>
            The files they uploaded and the space those take.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <DetailRow label="Files" value={storage.files.toLocaleString()} />
          <DetailRow label="Space used" value={formatFileSize(storage.bytes)} />
          {/* The rows sit tight together as a list; a button is not one of
              them, so it takes the field spacing back. */}
          <div className="mt-2">
            <Button asChild variant="outline">
              <Link
                to="/admin/media"
                search={{ owner: profile.id, media: undefined, orphan: undefined }}
              >
                <HardDriveIcon className="size-4" />
                {storage.files ? "Open their files" : "Open the library"}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <BillingHistoryCard events={detail.billingHistory} />
    </div>
  )
}

/**
 * What has happened to this person's plan, newest first.
 *
 * The card says when the recording started whether or not there is anything in
 * it, because a member who has been paying for two years would otherwise look
 * like one who joined last month.
 */
function BillingHistoryCard({ events }: { events: SubscriptionEvent[] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Billing history</CardTitle>
        <CardDescription>
          Every change to their plan since{" "}
          {formatUtcDate(BILLING_HISTORY_START)}. Anything that happened before
          that was not recorded.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing has been recorded for this account since then.
          </p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="flex items-baseline justify-between gap-4"
            >
              <span className="min-w-0 text-sm">
                {describeSubscriptionEvent(event)}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDateTime(event.createdAt)}
              </span>
            </div>
          ))
        )}
        {events.length === SUBSCRIPTION_EVENT_LIMIT ? (
          <p className="text-xs text-muted-foreground">
            The most recent {SUBSCRIPTION_EVENT_LIMIT} changes. There may be
            older ones.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * Role, status, a granted plan and an AI ceiling. Mounted only once the account
 * has loaded, so every field starts from a real value rather than being filled
 * in afterwards.
 */
function AccountEditPanel({
  detail,
  plans,
  onStatusChange,
  onCancelPlan,
  onSaved,
}: {
  detail: AccountDetail
  plans: AssignablePlan[]
  onStatusChange: (status: EditStatus) => void
  onCancelPlan: () => void
  onSaved: () => Promise<void>
}) {
  const { profile, subscription } = detail

  const grantedPlanId =
    subscription.source === "manual"
      ? (plans.find((plan) => plan.slug === subscription.planSlug)?.id ?? "none")
      : "none"
  const grantedEndsOn =
    subscription.source === "manual" && subscription.currentPeriodEnd
      ? subscription.currentPeriodEnd.slice(0, 10)
      : ""

  // Accounts on their way out keep their own status here rather than being
  // shown as active, and the control is disabled — so a save can never send it,
  // and nothing pretends the account is something it is not.
  const pendingDeletion = isPendingDeletion(profile)
  const initialStatus: AccountStatus = pendingDeletion
    ? PENDING_DELETION
    : profile.status === "suspended"
      ? "suspended"
      : "active"

  const initialRole = profile.role === "admin" ? "admin" : "member"
  // Cents in the database, dollars in the field — empty means "follow the plan".
  const initialAiDollars =
    detail.aiAllowance.overrideCents != null
      ? String(detail.aiAllowance.overrideCents / 100)
      : ""

  const [role, setRole] = React.useState<"admin" | "member">(initialRole)
  const [status, setStatus] = React.useState<AccountStatus>(initialStatus)
  const [planId, setPlanId] = React.useState(grantedPlanId)
  const [endsOn, setEndsOn] = React.useState(grantedEndsOn)
  const [aiDollars, setAiDollars] = React.useState(initialAiDollars)
  const [saving, setSaving] = React.useState(false)

  // What the tab opened with. Held from the first render so the save can send
  // only what changed, and so closing can tell edits from a look.
  const [initial] = React.useState(() => ({
    role: initialRole,
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

  // The Save button lives in the window's footer, so it submits this form by id
  // and mirrors the status reported back here — the same wiring the member's
  // own account modal uses for its Profile tab.
  React.useEffect(() => {
    onStatusChange({ dirty, saving })
  }, [dirty, saving, onStatusChange])

  const handleSave = async () => {
    dismissErrorToast()

    // Read the allowance field before anything is sent, so a typo cannot leave
    // the save half done.
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
        await updateAccountRole(profile.id, role)
      }
      // The deletion clock is never sent from here — that control is disabled,
      // and restoring an account is the Users table's job.
      if (status !== initial.status && status !== PENDING_DELETION) {
        await updateAccountStatus(profile.id, status)
      }
      if (planId !== initial.planId || endsOn !== initial.endsOn) {
        await grantAccountPlan(
          profile.id,
          planId === "none" ? null : planId,
          endsOn ? new Date(`${endsOn}T23:59:59`).toISOString() : null
        )
      }
      if (aiDollars !== initial.aiDollars) {
        await saveAiAllowanceOverride(
          profile.id,
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
  }

  return (
    // No autofocus here on purpose: this tab only ever edits an account that
    // already exists, and its first control is a dropdown, not something you
    // type into.
    <form
      id={EDIT_FORM_ID}
      className="grid gap-[var(--shell-modal-padding,1.5rem)]"
      onSubmit={(event) => {
        event.preventDefault()
        void handleSave()
      }}
    >
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
                onValueChange={(value) => setRole(value as "admin" | "member")}
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
              {/* An account on its way out is neither active nor suspended: its
                  status is the deletion clock. Restoring it from the Users
                  table is what gives this control something to say. */}
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
                  value={endsOn ? new Date(`${endsOn}T00:00:00`) : undefined}
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

      {/* Only accounts actually on a paid plan have something to cancel; for
          everyone else this card would be a button with nothing to do, so it is
          not shown at all. */}
      {subscription.isPaid ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Paid plan</CardTitle>
            <CardDescription>
              {profile.name} is on {subscription.planName}
              {subscription.source === "manual"
                ? ", granted by an admin."
                : ", paid through Stripe."}
              {subscription.cancelAtPeriodEnd
                ? ` It is already set to end${
                    subscription.currentPeriodEnd
                      ? ` on ${formatDate(subscription.currentPeriodEnd)}`
                      : ""
                  } and will not renew.`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              className="w-fit text-destructive hover:text-destructive"
              onClick={onCancelPlan}
            >
              <BanIcon className="size-4" />
              Cancel their paid plan
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card size="sm">
        <CardHeader>
          <CardTitle>AI allowance</CardTitle>
          <CardDescription>
            How much AI use this account gets each month, in dollars. Their plan
            sets it unless you type a number here.
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
    </form>
  )
}

/** A label and its value on one line, the way a spec sheet reads. */
function DetailRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-medium">
        {value}
      </span>
    </div>
  )
}

/**
 * The ceiling this account actually runs under, and where it comes from —
 * their own number beats their plan's, and no number anywhere means no limit.
 */
function aiAllowanceText(allowance: {
  overrideCents: number | null
  planCents: number | null
}) {
  if (allowance.overrideCents !== null) {
    return `${formatMoney(allowance.overrideCents)} a month, set just for them`
  }
  if (allowance.planCents !== null) {
    return `${formatMoney(allowance.planCents)} a month, from their plan`
  }
  return "No limit"
}

/** Stripe's own words, said the way somebody reading a support ticket would. */
function subscriptionStatusText(status: string) {
  const labels: Record<string, string> = {
    active: "Active",
    trialing: "On a trial",
    past_due: "Payment overdue",
    canceled: "Cancelled",
    incomplete: "Payment never finished",
    none: "No subscription",
  }

  return labels[status] ?? status.replace(/[_-]+/g, " ")
}
