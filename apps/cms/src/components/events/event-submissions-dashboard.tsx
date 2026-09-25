import { Link, useRouter } from "@tanstack/react-router"
import { CalendarPlusIcon, SettingsIcon } from "lucide-react"
import { toast } from "sonner"

import { EventSubmissionDialog } from "@/components/events/event-submission-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  EventSubmissionStatus,
  EventSubmissionsPage,
} from "@/lib/api/events/submissions"
import { eventSubmissionDecisionMessage } from "@/lib/directory/submission-decision-message"
import { submissionWhen } from "@/lib/events/event-submission-fields"
import { eventRowText } from "@/lib/events/event-time"
import { formatDate } from "@/lib/format/format-time"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"

const TAB_LABELS: Record<EventSubmissionStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
}

/**
 * The admin's queue of suggested events, in three tabs: Pending, which it
 * opens on, Approved and Rejected.
 *
 * **No selection column**, the same departure from the table standard as
 * Listing submissions and for the same reason: approving in bulk would make
 * events nobody read, which is what this queue is for stopping.
 */
export function EventSubmissionsDashboard({
  data,
  search,
}: {
  data: EventSubmissionsPage
  search: {
    status?: Exclude<EventSubmissionStatus, "pending">
    q?: string
    open?: string
  }
}) {
  const router = useRouter()
  const setListSearch = useListSearchNavigate()
  const [searchText, setSearchText] = useSearchBoxText(
    search.q ?? "",
    (value) => setListSearch({ q: value, page: undefined })
  )
  const tab: EventSubmissionStatus = search.status ?? "pending"
  const open = search.open
    ? (data.submissions.find((row) => row.id === search.open) ?? null)
    : null
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))

  return (
    <>
      <DashboardTable
        title="Event suggestions"
        icon={<CalendarPlusIcon className="text-muted-foreground" />}
        count={data.total}
        controls={
          <>
            <DashboardToolbarSearch
              name="event-submission-search"
              aria-label="Search suggestions by event, email, name or place"
              placeholder="Search suggestions…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Tabs
              value={tab}
              onValueChange={(value) =>
                setListSearch({
                  status: value === "pending" ? undefined : value,
                  page: undefined,
                  open: undefined,
                })
              }
            >
              <TabsList>
                {(Object.keys(TAB_LABELS) as EventSubmissionStatus[]).map(
                  (status) => (
                    <TabsTrigger key={status} value={status} className="h-full">
                      {TAB_LABELS[status]}
                      {status === "pending" && data.waiting ? (
                        <span className="text-muted-foreground">
                          {data.waiting}
                        </span>
                      ) : null}
                    </TabsTrigger>
                  )
                )}
              </TabsList>
            </Tabs>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Event</TableHead>
              <TableHead column="meta">When</TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                Sent
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={data.submissions.length === 0}
        emptyText={
          search.q
            ? `Nothing matches “${search.q}”. Clear the search to see everything.`
            : tab === "pending"
              ? "Nothing is waiting. New suggestions from the Suggest an event page land here."
              : `Nothing has been ${TAB_LABELS[tab].toLowerCase()} yet.`
        }
        emptyColSpan={4}
        footer={{
          type: "pagination",
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          totalPages,
          onPageChange: (page) =>
            setListSearch({ page: page > 1 ? page : undefined }),
          onPageSizeChange: (size) => setListSearch({ size, page: undefined }),
        }}
      >
        {data.submissions.map((submission) => (
          <TableRow
            key={submission.id}
            className="group"
            rowAction={() => setListSearch({ open: submission.id })}
          >
            <TableCell column="main">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  className="block max-w-96 truncate text-left text-sm font-medium group-hover:underline"
                  onClick={() => setListSearch({ open: submission.id })}
                  title={submission.title}
                >
                  {submission.title}
                </button>
                {submission.fromOwner ? (
                  <Badge variant="outline" className="shrink-0">
                    From the owner
                  </Badge>
                ) : null}
              </div>
              <span
                className="block max-w-96 truncate text-xs text-muted-foreground"
                title={submission.submitterEmail}
              >
                {submission.fromOwner
                  ? `At ${submission.placeName} · ${submission.submitterEmail}`
                  : submission.submitterName
                    ? `${submission.submitterName} · ${submission.submitterEmail}`
                    : submission.submitterEmail}
              </span>
            </TableCell>
            <TableCell column="meta">
              <span className="text-sm whitespace-nowrap">
                {eventRowText(submissionWhen(submission))}
              </span>
            </TableCell>
            <TableCell column="meta" className="hidden md:table-cell">
              {formatDate(submission.createdAt)}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center">
                {submission.eventId ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link
                      to="/admin/events"
                      search={{ open: submission.eventId }}
                    >
                      The event
                    </Link>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Open ${submission.title}`}
                  onClick={() => setListSearch({ open: submission.id })}
                >
                  <SettingsIcon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <EventSubmissionDialog
        open={Boolean(open)}
        submission={open}
        onClose={() => setListSearch({ open: undefined })}
        onDecided={(decision, emailed) => {
          // Amber, not green, when the sender was not reached. The decision
          // held, so it is not a failure, but it is not finished either.
          const message = eventSubmissionDecisionMessage(
            decision,
            emailed,
            open?.fromOwner
          )
          if (emailed) toast.success(message)
          else toast.warning(message)
          // The list is read again before the window closes, so the row does
          // not flash back as still pending.
          void router
            .invalidate()
            .then(() => setListSearch({ open: undefined }))
        }}
      />
    </>
  )
}
