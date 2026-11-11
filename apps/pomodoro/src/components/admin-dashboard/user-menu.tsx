import * as React from "react"
import { format } from "date-fns"
import { BanIcon, EyeIcon, PauseIcon, PlayIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import type { AccountAsk } from "@/components/admin-dashboard/account-actions"
import { aiAllowanceText, targetOfDetail, viewAsRefusal } from "@/components/admin-dashboard/account-words"
import { MenuActionRow } from "@/components/admin-dashboard/list-parts"
import { CancelSubscriptionDialog } from "@/components/admin/cancel-subscription-dialog"
import { PickDayRow, PickGroup, PickMenuRow, PickRow } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { isPendingDeletion } from "@/lib/account-deletion"
import { saveAiAllowanceOverride } from "@/lib/api/ai"
import {
  getAdminUserErrorMessage,
  grantAccountPlan,
  setAccountPlanPaused,
  updateAccountMemberTags,
  updateAccountRole,
  updateAccountStatus,
  type AccountDetail,
  type AssignablePlan,
} from "@/lib/api/people/admin-users"
import { pauseRefusalCode } from "@/lib/billing/pause-rules"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { MEMBER_TAG_LIMIT, MEMBER_TAG_MAX_LENGTH, normalizeMemberTags } from "@/lib/member-tags"
import { roleLabel, rolesWith } from "@/lib/roles"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The open person's ⋮ on the Admin dashboard's Users tab (Tyler, 8 Nov 2026:
 * "clicking the user should open its user data on the right panel"). What the
 * account window's Edit tab held, as the Admin 3 panel design's grouped rows,
 * each saving itself the moment it is picked or left, with the same calls and
 * checks the window's Save made:
 *
 * - **Access:** role and status. Changing either emails them.
 * - **Plan:** a granted plan and the day it ends, and their own AI allowance.
 * - **Member tags.**
 * - **Under the groups:** pause, start again or cancel a paid plan, View as
 *   member, Restore, then Delete in red under a line. Your own account has no
 *   Delete.
 */
export function UserMenu({
  detail,
  plans,
  currentUserId,
  onChanged,
  onAsk,
}: {
  detail: AccountDetail
  plans: AssignablePlan[]
  currentUserId: string
  /** Reads the person and the list again after a change made here. */
  onChanged: () => Promise<void>
  onAsk: (ask: AccountAsk) => void
}) {
  const { profile, subscription } = detail
  const [open, setOpen] = React.useState(false)
  const [run, saving] = useAsyncAction(getAdminUserErrorMessage)
  const [confirmingPause, setConfirmingPause] = React.useState(false)
  const [cancellingPlan, setCancellingPlan] = React.useState(false)
  const [runPause, pausing] = useAsyncAction(getAdminUserErrorMessage)

  const pendingDeletion = isPendingDeletion(profile)
  const status = pendingDeletion ? "pending_deletion" : profile.status === "suspended" ? "suspended" : "active"
  const grantedPlan = subscription.source === "manual" ? plans.find((plan) => plan.slug === subscription.planSlug) : undefined
  const grantedEnds = subscription.source === "manual" ? subscription.currentPeriodEnd : null
  const paying = subscription.isPaid || subscription.paused

  /** Saves one change, says so, then reads the person and the list again. */
  const save = (work: () => Promise<unknown>, done: string) =>
    run(async () => {
      await work()
      toast.success(done)
      await onChanged()
    })

  const setPaused = (paused: boolean) =>
    void runPause(async () => {
      await setAccountPlanPaused(profile.id, paused)
      toast.success(
        paused
          ? `${profile.name}'s plan is paused. They are not being billed and are back on the free plan.`
          : `${profile.name}'s plan is running again. Billing starts from today.`
      )
      setConfirmingPause(false)
      await onChanged()
    })

  /** Closes the menu first, so a window opened from it is not under it. */
  const fromMenu = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  const viewAsReason = viewAsRefusal(targetOfDetail(detail))

  return (
    <>
      <TabbedMenu
        label="Person menu"
        align="end"
        width="20.4rem"
        open={open}
        onOpenChange={setOpen}
        tabs={[
          {
            value: "general",
            label: "General",
            content: (
              <div className="grid gap-4 p-3">
                <PickGroup
                  title="Access"
                  after={
                    <p className="px-0.5 text-xs text-muted-foreground">
                      {pendingDeletion
                        ? "This account is scheduled for deletion. Restore it to change its status."
                        : "Admins reach the whole back office. Suspending someone signs them out everywhere. Role and status changes send them an email and an in-app notice."}
                    </p>
                  }
                >
                  <PickMenuRow
                    label="Role"
                    value={roleLabel(profile.role)}
                    disabled={saving}
                    // A role the app has stopped declaring stays listed while
                    // this account still holds it.
                    options={rolesWith(profile.role).map((one) => ({ value: one.id, label: one.label }))}
                    selected={profile.role}
                    onPick={(role) => void save(() => updateAccountRole(profile.id, role), "Role saved.")}
                  />
                  <PickMenuRow
                    label="Status"
                    value={pendingDeletion ? "Scheduled for deletion" : status === "suspended" ? "Suspended" : "Active"}
                    disabled={saving || pendingDeletion}
                    options={[
                      { value: "active", label: "Active" },
                      { value: "suspended", label: "Suspended" },
                    ]}
                    selected={status}
                    onPick={(value) =>
                      void save(
                        () => updateAccountStatus(profile.id, value as "active" | "suspended"),
                        value === "suspended" ? `${profile.name} is suspended.` : `${profile.name} is active again.`
                      )
                    }
                  />
                </PickGroup>

                <PickGroup
                  title="Plan"
                  after={
                    <p className="px-0.5 text-xs text-muted-foreground">
                      A granted plan puts them on a paid plan without charging them. Plans paid through Stripe are not
                      affected. Granting or removing one tells them by email and in the app.
                    </p>
                  }
                >
                  <PickMenuRow
                    label="Granted plan"
                    value={grantedPlan?.name ?? "None"}
                    empty={!grantedPlan}
                    disabled={saving}
                    options={[
                      { value: "none", label: "No granted plan" },
                      ...plans.map((plan) => ({ value: plan.id, label: plan.name })),
                    ]}
                    selected={grantedPlan?.id ?? "none"}
                    onPick={(planId) =>
                      void save(
                        () => grantAccountPlan(profile.id, planId === "none" ? null : planId, planId === "none" ? null : grantedEnds),
                        planId === "none" ? "Granted plan removed." : "Plan granted."
                      )
                    }
                  />
                  {grantedPlan ? (
                    <PickDayRow
                      label="Ends on"
                      value={grantedEnds ? formatDate(grantedEnds) : "Until removed"}
                      empty={!grantedEnds}
                      disabled={saving}
                      day={grantedEnds ? new Date(grantedEnds) : null}
                      clearLabel="Keep it until removed"
                      onPick={(day) =>
                        void save(
                          () =>
                            grantAccountPlan(
                              profile.id,
                              grantedPlan.id,
                              day ? new Date(`${format(day, "yyyy-MM-dd")}T23:59:59`).toISOString() : null
                            ),
                          day ? `The plan ends on ${formatDate(day.toISOString())}.` : "The plan stays until you remove it."
                        )
                      }
                    />
                  ) : null}
                  <PickRow label="AI allowance" value={aiAllowanceText(detail.aiAllowance)}>
                    <AiAllowanceBox
                      key={String(detail.aiAllowance.overrideCents)}
                      overrideCents={detail.aiAllowance.overrideCents}
                      onSave={(cents) =>
                        save(() => saveAiAllowanceOverride(profile.id, cents), "AI allowance saved.")
                      }
                    />
                  </PickRow>
                </PickGroup>

                <PickGroup title="Member tags">
                  <PickRow
                    label="Tags"
                    value={profile.tags.length ? profile.tags.join(", ") : "None"}
                    empty={!profile.tags.length}
                  >
                    <TagsBox
                      key={profile.tags.join("\n")}
                      tags={profile.tags}
                      onSave={(tags) => save(() => updateAccountMemberTags(profile.id, tags), "Tags saved.")}
                    />
                  </PickRow>
                </PickGroup>

                <div className="grid">
                  {paying ? (
                    subscription.paused ? (
                      <MenuActionRow icon={<PlayIcon />} disabled={pausing} onClick={fromMenu(() => setPaused(false))}>
                        Start their plan again
                      </MenuActionRow>
                    ) : (
                      <MenuActionRow
                        icon={<PauseIcon />}
                        disabled={pausing}
                        onClick={fromMenu(() => {
                          // Shown either way, and answers the press with the
                          // reason when this plan cannot be paused.
                          const refusal = pauseRefusalCode(subscription)
                          if (refusal) showErrorToast(getAdminUserErrorMessage(refusal))
                          else setConfirmingPause(true)
                        })}
                      >
                        Pause their plan
                      </MenuActionRow>
                    )
                  ) : null}
                  {paying ? (
                    <MenuActionRow icon={<BanIcon />} disabled={pausing} onClick={fromMenu(() => setCancellingPlan(true))}>
                      Cancel their paid plan
                    </MenuActionRow>
                  ) : null}
                  <MenuActionRow
                    icon={<EyeIcon />}
                    onClick={fromMenu(() =>
                      viewAsReason ? showErrorToast(viewAsReason) : onAsk({ kind: "viewAs", account: targetOfDetail(detail) })
                    )}
                  >
                    View as member
                  </MenuActionRow>
                  {pendingDeletion ? (
                    <MenuActionRow
                      icon={<RotateCcwIcon />}
                      onClick={fromMenu(() => onAsk({ kind: "restore", account: targetOfDetail(detail) }))}
                    >
                      Restore account
                    </MenuActionRow>
                  ) : null}
                  {profile.id === currentUserId ? null : (
                    <>
                      <div aria-hidden className="-mx-3 my-1.5 border-t" />
                      <MenuActionRow
                        icon={<Trash2Icon />}
                        destructive
                        onClick={fromMenu(() => onAsk({ kind: "delete", account: targetOfDetail(detail) }))}
                      >
                        {pendingDeletion ? "Delete for good" : "Delete account"}
                      </MenuActionRow>
                    </>
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />

      <ConfirmDialog
        open={confirmingPause}
        onOpenChange={(next) => {
          if (!next) setConfirmingPause(false)
        }}
        title="Pause their plan?"
        // Reversible, so not drawn as a one-way door, but it takes their paid
        // features away, so it still asks first.
        destructive={false}
        description={`${profile.name} stops being billed now and goes back to the free plan, so anything ${subscription.planName} unlocks stops working for them. The time they have already paid for is not refunded. Refund that separately in Stripe if you mean to. Starting it again puts them straight back on it and starts the billing again.`}
        confirmLabel="Pause their plan"
        loading={pausing}
        onConfirm={() => setPaused(true)}
      />

      <CancelSubscriptionDialog
        // Remounts per opening so the when-it-ends choice never carries over.
        key={cancellingPlan ? "cancel-open" : "cancel-closed"}
        account={
          cancellingPlan
            ? {
                id: profile.id,
                name: profile.name,
                // A paused plan reads as the free plan everywhere else, and a
                // confirmation offering to cancel "Free" would be wrong.
                planName: subscription.pausedPlanName ?? subscription.planName,
                subscriptionSource: subscription.source,
                currentPeriodEnd: subscription.currentPeriodEnd,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              }
            : null
        }
        onClose={() => setCancellingPlan(false)}
        onDone={async () => {
          setCancellingPlan(false)
          await onChanged()
        }}
      />
    </>
  )
}

/**
 * Their own monthly AI ceiling in dollars. Saved when the box is left or Enter
 * is pressed; empty follows the plan and 0 blocks AI. A number that is not one
 * is refused before anything is sent.
 */
function AiAllowanceBox({
  overrideCents,
  onSave,
}: {
  overrideCents: number | null
  onSave: (cents: number | null) => Promise<boolean>
}) {
  const saved = overrideCents != null ? String(overrideCents / 100) : ""
  const [text, setText] = React.useState(saved)
  const commit = () => {
    const trimmed = text.trim()
    if (trimmed === saved) return
    const value = trimmed === "" ? null : Number(trimmed)
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      showErrorToast("The AI allowance must be a dollar amount, 0 or more.")
      return
    }
    void onSave(value === null ? null : Math.round(value * 100))
  }
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor="account-ai-dollars" hint="Empty follows the plan. 0 blocks AI for this account entirely.">
        Their own limit ($ a month)
      </FieldLabel>
      <Input
        id="account-ai-dollars"
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        placeholder="Follows the plan"
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
    </div>
  )
}

/**
 * Their member tags, comma separated, saved when the box is left or Enter is
 * pressed. Tags are saved in lowercase; too many or too long is refused with
 * the rule.
 */
function TagsBox({ tags, onSave }: { tags: string[]; onSave: (tags: string[]) => Promise<boolean> }) {
  const saved = tags.join(", ")
  const [text, setText] = React.useState(saved)
  const [invalid, setInvalid] = React.useState(false)
  const commit = () => {
    if (text === saved) return
    let next: string[]
    try {
      next = normalizeMemberTags(text.split(","))
    } catch (error) {
      setInvalid(true)
      showErrorToast(
        error instanceof Error && error.message === "MEMBER_TAG_LIMIT"
          ? `Use no more than ${MEMBER_TAG_LIMIT} tags.`
          : `Keep each tag to ${MEMBER_TAG_MAX_LENGTH} characters or fewer.`
      )
      return
    }
    void onSave(next)
  }
  return (
    <div className="grid gap-2">
      <FieldLabel
        htmlFor="account-member-tags"
        hint={`Labels that automations can add, remove, and use to choose an audience. Separate them with commas. An account can have ${MEMBER_TAG_LIMIT}, each up to ${MEMBER_TAG_MAX_LENGTH} characters.`}
      >
        Tags
      </FieldLabel>
      <Input
        id="account-member-tags"
        value={text}
        aria-invalid={invalid}
        placeholder="beta, at-risk"
        autoFocus
        onChange={(event) => {
          setText(event.target.value)
          setInvalid(false)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
    </div>
  )
}
