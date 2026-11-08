import type * as React from "react"
import { Link } from "@tanstack/react-router"
import { HardDriveIcon, SquareMousePointerIcon, UserIcon } from "lucide-react"

import type { AccountAsk } from "@/components/admin-dashboard/account-actions"
import { aiAllowanceText, subscriptionStatusText } from "@/components/admin-dashboard/account-words"
import { initialsFor } from "@/lib/crm/inbox-time"
import { UserMenu } from "@/components/admin-dashboard/user-menu"
import { EmptyRecord, RecordFrame } from "@/components/crm/record-frame"
import { PanelCard } from "@/components/shared/panel-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { isPendingDeletion, restoreDeadline } from "@/lib/account-deletion"
import {
  getAdminUserErrorMessage,
  loadAdminAccountDetail,
  type AccountDetail,
} from "@/lib/api/people/admin-users"
import { pausedPlanLabel } from "@/lib/billing/pause-rules"
import {
  BILLING_HISTORY_START,
  describeSubscriptionEvent,
  SUBSCRIPTION_EVENT_LIMIT,
} from "@/lib/billing/subscription-events"
import { formatFileSize } from "@/lib/format/format-bytes"
import { formatDate, formatDateTime, formatUtcDate } from "@/lib/format/format-time"
import { useLoad } from "@/lib/hooks/use-load"
import { roleLabel } from "@/lib/roles"

const HIDE_LABEL = "Hide the person"

/**
 * The Users tab's right panel: the person open (Tyler, 8 Nov 2026: "For users
 * dashboard, clicking the user should open its user data on the right
 * panel"). It replaced the account window, in the CRM's one record frame:
 *
 * - **Header:** their initials, name and email, then the ⋮ (`UserMenu`), which
 *   holds everything that changes the account.
 * - **Body:** what the window's Details tab read back, as folding cards in the
 *   order a support question asks it: Profile, Security reports (only when
 *   there are any), Plan, Storage, Billing history.
 *
 * It reads its own person by id, so a link can open somebody who is not on the
 * page the list shows, and reads them again each time `refreshes` goes up.
 */
export function UserPanel({
  userId,
  refreshes,
  currentUserId,
  onChanged,
  onAsk,
}: {
  userId: string | undefined
  refreshes: number
  currentUserId: string
  onChanged: () => Promise<void>
  onAsk: (ask: AccountAsk) => void
}) {
  if (!userId) {
    return (
      <EmptyRecord
        title="Person"
        icon={<SquareMousePointerIcon aria-hidden />}
        line="Click a person to see them here."
        hideLabel={HIDE_LABEL}
      />
    )
  }
  return (
    <OpenUser userId={userId} refreshes={refreshes} currentUserId={currentUserId} onChanged={onChanged} onAsk={onAsk} />
  )
}

function OpenUser({
  userId,
  refreshes,
  currentUserId,
  onChanged,
  onAsk,
}: {
  userId: string
  refreshes: number
  currentUserId: string
  onChanged: () => Promise<void>
  onAsk: (ask: AccountAsk) => void
}) {
  const load = useLoad(() => loadAdminAccountDetail(userId), getAdminUserErrorMessage, { keys: [userId, refreshes] })
  // A failed read shows only the failure, never the person from before it.
  const loaded = load.error ? null : load.data

  if (!loaded) {
    return load.error ? (
      <EmptyRecord title="Person" icon={<UserIcon aria-hidden />} line={load.error} hideLabel={HIDE_LABEL} />
    ) : (
      // Nothing while they are read, never a loading circle.
      <EmptyRecord title="Person" icon={null} line="" loading hideLabel={HIDE_LABEL} />
    )
  }

  const { detail, plans } = loaded
  const { profile } = detail
  return (
    <RecordFrame
      avatar={initialsFor(profile.name, profile.email)}
      title={profile.name || profile.email}
      line={profile.name ? profile.email : null}
      hideLabel={HIDE_LABEL}
      actions={
        <UserMenu detail={detail} plans={plans} currentUserId={currentUserId} onChanged={onChanged} onAsk={onAsk} />
      }
      body={<UserCards detail={detail} />}
    />
  )
}

/** The whole account read back, in the order a support question asks it. */
function UserCards({ detail }: { detail: AccountDetail }) {
  const { profile, subscription, storage, securityReports } = detail
  return (
    <>
      <PanelCard storageId="admin-user-profile" title="Profile">
        <Rows>
          <DetailRow label="Role" value={roleLabel(profile.role)} />
          <DetailRow
            label="Status"
            value={
              isPendingDeletion(profile)
                ? "Scheduled for deletion"
                : profile.status === "suspended"
                  ? "Suspended"
                  : "Active"
            }
          />
          {/* Only while the clock is running. Restore is in the ⋮. */}
          {isPendingDeletion(profile) && profile.deletedAt ? (
            <DetailRow label="Deletes on" value={formatDate(restoreDeadline(profile.deletedAt))} />
          ) : null}
          <DetailRow
            label="Email verified"
            value={profile.emailVerifiedAt ? formatDate(profile.emailVerifiedAt) : "Not verified"}
          />
          <DetailRow
            label="Tags"
            value={
              profile.tags.length ? (
                <span className="flex flex-wrap justify-end gap-1">
                  {profile.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="bg-background">
                      {tag}
                    </Badge>
                  ))}
                </span>
              ) : (
                "None"
              )
            }
          />
          <DetailRow label="Joined" value={formatDate(profile.createdAt)} />
          <DetailRow label="Last changed" value={formatDateTime(profile.updatedAt)} />
        </Rows>
      </PanelCard>

      {securityReports.count > 0 ? (
        <PanelCard storageId="admin-user-security" title="Security reports" meta={securityReports.count}>
          <Note>
            They marked a password-reset or sign-in email as unwanted. The report stopped only that link and did not
            lock the account.
          </Note>
          <Rows>
            <DetailRow label="Reported emails" value={securityReports.count} />
            <DetailRow
              label="Most recent"
              value={securityReports.latestAt ? formatDateTime(securityReports.latestAt) : "None"}
            />
          </Rows>
        </PanelCard>
      ) : null}

      <PanelCard storageId="admin-user-plan" title="Plan" meta={subscription.planName}>
        <Note>
          {/* "Nobody is billing this account" is true of a paused plan and
              still the wrong thing to say: it reads as somebody who never
              paid, when they have a plan waiting. */}
          {subscription.paused
            ? "Their plan is on hold, so nothing is being billed."
            : subscription.isPaid
              ? "What they are on and until when."
              : "Nobody is billing this account."}
        </Note>
        <Rows>
          <DetailRow
            label="Plan"
            value={subscription.paused ? pausedPlanLabel(subscription.pausedPlanName) : subscription.planName}
          />
          <DetailRow
            label="Paid by"
            value={
              subscription.source === "manual"
                ? "Granted by an admin"
                : subscription.source === "stripe"
                  ? "Stripe"
                  : "Nobody, free plan"
            }
          />
          <DetailRow
            label="Billing status"
            value={
              subscription.paused
                ? "Paused, nothing is being billed"
                : subscription.isPaid
                  ? `${subscriptionStatusText(subscription.status)}${subscription.interval ? `, billed ${subscription.interval}` : ""}`
                  : "None"
            }
          />
          <DetailRow
            label={subscription.cancelAtPeriodEnd ? "Ends on" : "Renews on"}
            value={
              // A paused plan has no renewal date: Stripe is not going to
              // charge it, and the date on the row is the period it was
              // paused in.
              subscription.paused
                ? "Not while it is paused"
                : subscription.currentPeriodEnd
                  ? formatDate(subscription.currentPeriodEnd)
                  : subscription.isPaid
                    ? "No end date"
                    : "None"
            }
          />
          <DetailRow
            label="Trial ends"
            value={subscription.trialEndsAt ? formatDate(subscription.trialEndsAt) : "Not on a trial"}
          />
          <DetailRow label="AI allowance" value={aiAllowanceText(detail.aiAllowance)} />
        </Rows>
      </PanelCard>

      <PanelCard storageId="admin-user-storage" title="Storage" meta={formatFileSize(storage.bytes)}>
        <Rows>
          <DetailRow label="Files" value={storage.files.toLocaleString()} />
          <DetailRow label="Space used" value={formatFileSize(storage.bytes)} />
        </Rows>
        <Button asChild variant="outline" size="sm" className="justify-self-start bg-background">
          <Link to="/admin/dashboard" search={{ tab: "media", owner: profile.id }}>
            <HardDriveIcon className="size-4" />
            {storage.files ? "Open their files" : "Open the library"}
          </Link>
        </Button>
      </PanelCard>

      <PanelCard storageId="admin-user-billing" title="Billing history" meta={detail.billingHistory.length}>
        {/* Says when the recording started whether or not there is anything
            in it: a member who has paid for two years would otherwise look
            like one who joined last month. */}
        <Note>
          Every change to their plan since {formatUtcDate(BILLING_HISTORY_START)}. Anything before that was not
          recorded.
        </Note>
        {detail.billingHistory.length === 0 ? (
          <Note>Nothing has been recorded for this account since then.</Note>
        ) : (
          <ol className="grid gap-2">
            {detail.billingHistory.map((event) => (
              <li key={event.id} className="grid gap-0.5">
                <span className="text-sm">{describeSubscriptionEvent(event)}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
        {detail.billingHistory.length === SUBSCRIPTION_EVENT_LIMIT ? (
          <Note>The most recent {SUBSCRIPTION_EVENT_LIMIT} changes. There may be older ones.</Note>
        ) : null}
      </PanelCard>
    </>
  )
}

function Rows({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2">{children}</div>
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

/**
 * A label and its value on one line, the way a spec sheet reads. The panel
 * opens at 16% of the screen, so a value with no room beside its label goes
 * under it rather than past the panel's edge.
 */
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
      <span className="min-w-0 text-sm text-muted-foreground">{label}</span>
      <span className="ml-auto min-w-0 max-w-full truncate text-right text-sm font-medium">{value}</span>
    </div>
  )
}
