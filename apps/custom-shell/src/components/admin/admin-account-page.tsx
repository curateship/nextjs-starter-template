import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  HardDriveIcon,
  MessageSquareIcon,
  SettingsIcon,
} from "lucide-react"

import { EditAccountDialog } from "@/components/admin/edit-account-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import { isPendingDeletion, restoreDeadline } from "@/lib/account-deletion"
import type { FeedbackType } from "@/lib/api/feedback"
import type { AccountDetail, AssignablePlan } from "@/lib/api/admin-users"
import {
  feedbackTypeBadgeVariants,
  feedbackTypeClassNames,
  feedbackTypeLabels,
} from "@/lib/feedback-type"
import { formatFileSize } from "@/lib/format-bytes"
import { formatDate, formatDateTime } from "@/lib/format-time"
import { formatMoney } from "@/lib/money"
import { pageGutter } from "@/lib/shell-gutter"

/**
 * Everything about one person on one page, so a support question is answered
 * here instead of across the Users, Billing, Media and Feedback screens.
 *
 * Read-only apart from the account modal the accounts table already offers.
 * Each panel links to the dashboard it came from rather than growing its own
 * controls, which keeps one place to edit anything.
 */
type FeedbackSortColumn = "votes" | "comments" | "created"

export function AdminAccountPage({
  detail,
  plans,
  onSaved,
}: {
  detail: AccountDetail
  plans: AssignablePlan[]
  onSaved: () => Promise<void>
}) {
  const [editing, setEditing] = React.useState(false)
  const [sort, setSort] = React.useState<FeedbackSortColumn>("created")
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc")
  const { profile, subscription, storage } = detail

  const toggleSort = (column: FeedbackSortColumn) => {
    if (sort === column) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSort(column)
    setDirection("asc")
  }

  // A noisy account needs the most-discussed item brought to the top. The list
  // is already here and already trimmed, so this sorts what is on screen.
  const sortedFeedback = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...detail.feedback].sort((a, b) => {
      if (sort === "votes") return (a.votes - b.votes) * factor
      if (sort === "comments") return (a.comments - b.comments) * factor
      return (
        (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) *
        factor
      )
    })
  }, [detail.feedback, direction, sort])

  return (
    <>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link to="/admin/users" aria-label="Back to Users">
            <ArrowLeftIcon className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-medium">{profile.name}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {profile.email}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setEditing(true)}
        >
          <SettingsIcon className="size-4" />
          Account settings
        </Button>
      </div>

      <div
        className="grid sm:grid-cols-2 xl:grid-cols-3"
        style={{ gap: pageGutter }}
      >
        <Card size="sm">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Who they are and how they got in.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <DetailRow
              label="Role"
              value={
                <Badge
                  variant={profile.role === "admin" ? "default" : "outline"}
                >
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
            {/* Only while the clock is running. Restoring is on the Users
                dashboard, like every other change this page links out for. */}
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
          <CardContent className="grid gap-4">
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
          <CardContent className="grid gap-4">
            <DetailRow
              label="Files"
              value={storage.files.toLocaleString()}
            />
            <DetailRow label="Space used" value={formatFileSize(storage.bytes)} />
            <div>
              <Button asChild variant="outline">
                <Link to="/admin/media" search={{ owner: profile.id }}>
                  <HardDriveIcon className="size-4" />
                  {storage.files ? "Open their files" : "Open the library"}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <DashboardTable
        title="Their feedback"
        icon={<MessageSquareIcon className="text-muted-foreground" />}
        count={detail.feedback.length}
        header={
          <TableHeader>
            <TableRow>
              {/* Message and Kind stay plain: neither is a value you would
                  ever want this list ordered by. */}
              <TableHead column="main">Message</TableHead>
              <TableHead column="meta">Kind</TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                <TableSortButton
                  active={sort === "votes"}
                  direction={direction}
                  onClick={() => toggleSort("votes")}
                >
                  Votes
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                <TableSortButton
                  active={sort === "comments"}
                  direction={direction}
                  onClick={() => toggleSort("comments")}
                >
                  Replies
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "created"}
                  direction={direction}
                  onClick={() => toggleSort("created")}
                >
                  Posted
                </TableSortButton>
              </TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={detail.feedback.length === 0}
        emptyText="This account has not posted any feedback."
        emptyColSpan={5}
        footer={{
          type: "summary",
          count: detail.feedback.length,
          label: detail.feedbackTruncated ? "most recent items" : "items",
          // Only when the list is trimmed is there a rest to go and see. The
          // Feedback page has no owner filter, so this carries their name into
          // its search box — which is what that search already matches on.
          action: detail.feedbackTruncated ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/feedback" search={{ q: profile.name }}>
                See all their feedback
              </Link>
            </Button>
          ) : null,
        }}
      >
        {sortedFeedback.map((item) => (
          <TableRow key={item.id}>
            <TableCell column="main">
              <span
                className="line-clamp-2 text-sm whitespace-normal"
                title={item.message}
              >
                {item.message}
              </span>
            </TableCell>
            <TableCell column="meta">
              <FeedbackKindBadge type={item.type} />
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {item.votes.toLocaleString()}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {item.comments.toLocaleString()}
            </TableCell>
            <TableCell column="mutedMeta">
              {formatDate(item.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <EditAccountDialog
        // Remount on open so the modal starts from what the page just loaded.
        key={editing ? "open" : "closed"}
        account={
          editing
            ? {
                id: profile.id,
                name: profile.name,
                email: profile.email,
                role: profile.role,
                status: profile.status,
                planSlug: subscription.planSlug,
                planName: subscription.planName,
                planIsPaid: subscription.isPaid,
                subscriptionSource: subscription.source,
                currentPeriodEnd: subscription.currentPeriodEnd,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                aiOverrideCents: detail.aiAllowance.overrideCents,
              }
            : null
        }
        plans={plans}
        onClose={() => setEditing(false)}
        onSaved={async () => {
          setEditing(false)
          await onSaved()
        }}
      />
    </>
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
 * Feedback kinds are saved as free text, so a kind added by later code still
 * shows rather than rendering an empty badge.
 */
function FeedbackKindBadge({ type }: { type: string }) {
  const known = type in feedbackTypeLabels ? (type as FeedbackType) : null

  return (
    <Badge
      variant={known ? feedbackTypeBadgeVariants[known] : "outline"}
      className={known ? feedbackTypeClassNames[known] : undefined}
    >
      {known ? feedbackTypeLabels[known] : type}
    </Badge>
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
