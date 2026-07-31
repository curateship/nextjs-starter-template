import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  HardDriveIcon,
  MessageSquareIcon,
  ScrollTextIcon,
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
} from "@/components/ui/table"
import { activitySentence, resourceLabel } from "@/lib/audit-sentence"
import type { FeedbackType } from "@/lib/api/feedback"
import type { AccountDetail, AssignablePlan } from "@/lib/api/admin-users"
import {
  feedbackTypeBadgeVariants,
  feedbackTypeClassNames,
  feedbackTypeLabels,
} from "@/lib/feedback-type"
import { formatFileSize } from "@/lib/format-bytes"
import { formatDate, formatDateTime } from "@/lib/money"

/**
 * Everything about one person on one page, so a support question is answered
 * here instead of across the Users, Billing, Media and Feedback screens.
 *
 * Read-only apart from the account modal the accounts table already offers.
 * Each panel links to the dashboard it came from rather than growing its own
 * controls, which keeps one place to edit anything.
 */
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
  const { profile, subscription, storage } = detail

  return (
    <div
      className="flex w-full flex-col"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >
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
        style={{ gap: "var(--shell-gutter, 1.5rem)" }}
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
                    profile.status === "suspended" ? "destructive" : "secondary"
                  }
                >
                  {profile.status === "suspended" ? "Suspended" : "Active"}
                </Badge>
              }
            />
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
              <TableHead column="main">Message</TableHead>
              <TableHead column="meta">Kind</TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                Votes
              </TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                Replies
              </TableHead>
              <TableHead column="meta">Posted</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={detail.feedback.length === 0}
        emptyText="This account has not posted any feedback."
        emptyColSpan={5}
        footer={{
          type: "summary",
          count: detail.feedback.length,
          label: detail.feedbackTruncated
            ? "most recent items — see the feedback page for the rest"
            : "items",
        }}
      >
        {detail.feedback.map((item) => (
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

      <DashboardTable
        title="What admins have done here"
        icon={<ScrollTextIcon className="text-muted-foreground" />}
        count={detail.activity.length}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Activity</TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                What
              </TableHead>
              <TableHead column="meta">When</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={detail.activity.length === 0}
        emptyText="No admin has changed this account."
        emptyColSpan={3}
        footer={{
          type: "summary",
          count: detail.activity.length,
          label: detail.activityTruncated
            ? "most recent entries — see the activity log for the rest"
            : "entries",
        }}
      >
        {detail.activity.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell column="main">
              <span
                className="line-clamp-2 text-sm whitespace-normal"
                title={activitySentence(entry)}
              >
                {activitySentence(entry)}
              </span>
            </TableCell>
            <TableCell column="meta" className="hidden lg:table-cell">
              <Badge variant="outline">{resourceLabel(entry.resource)}</Badge>
            </TableCell>
            <TableCell column="mutedMeta">
              {formatDateTime(entry.createdAt)}
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
                subscriptionSource: subscription.source,
                currentPeriodEnd: subscription.currentPeriodEnd,
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
    </div>
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
