import { Link, useRouter } from "@tanstack/react-router"
import { InboxIcon, SettingsIcon } from "lucide-react"
import { toast } from "sonner"

import { SubmissionDialog } from "@/components/directory/submission-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { SubmissionsPage } from "@/lib/api/directory/submissions"
import {
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  type ReviewStatus,
} from "@/lib/directory/review-status"
import { formatDate } from "@/lib/format/format-time"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"

/**
 * The admin's submissions queue.
 *
 * It opens on what needs an answer. A submission whose sender has not confirmed
 * their email is not work — it is invisible to the server's own list function —
 * so the filter offers the other three states and nothing here has to explain
 * an empty-looking category.
 *
 * **No selection column, and that is a deliberate departure from the table
 * standard**: there is no multi-row action here. Approving in bulk means
 * creating public pages without reading them, which is the one thing this queue
 * exists to prevent, so the column would be furniture with nothing behind it.
 */
export function SubmissionsDashboard({
  data,
  search,
}: {
  data: SubmissionsPage
  search: { status?: ReviewStatus; q?: string; open?: string }
}) {
  const router = useRouter()
  const setListSearch = useListSearchNavigate()
  // The typed text stays in the box and the address catches up once typing
  // pauses, so a shared link and a refresh both keep the search.
  const [searchText, setSearchText] = useSearchBoxText(
    search.q ?? "",
    (value) => setListSearch({ q: value, page: undefined })
  )

  const open = search.open
    ? (data.submissions.find((row) => row.id === search.open) ?? null)
    : null

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))

  return (
    <>
      <DashboardTable
        title="Listing submissions"
        icon={<InboxIcon className="text-muted-foreground" />}
        count={data.total}
        controls={
          <>
            {/* How many need an answer, said on the screen rather than in a
                notification list — the shell's list of notice kinds is a shell
                file an app may not add to, so this is where the count lives. It
                is only worth saying when the list is not already filtered down
                to those. */}
            {data.waiting && search.status !== "pending_review" ? (
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() =>
                  setListSearch({ status: "pending_review", page: undefined })
                }
              >
                {data.waiting === 1
                  ? "1 needs review"
                  : `${data.waiting} need review`}
              </button>
            ) : null}
            <DashboardToolbarSearch
              name="submission-search"
              aria-label="Search submissions by business name or contact email"
              placeholder="Search name or email…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select
              value={search.status ?? "all"}
              onValueChange={(value) =>
                setListSearch({
                  status: value === "all" ? undefined : value,
                  page: undefined,
                })
              }
            >
              <SelectTrigger className="w-fit" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {REVIEW_STATUSES.filter(
                  (status) => status !== "pending_verification"
                ).map((status) => (
                  <SelectItem key={status} value={status}>
                    {REVIEW_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        header={
          // `TableHeader` rather than a bare row: a `<tr>` straight inside a
          // `<table>` is invalid, and the browser silently adds the `<tbody>`
          // the markup is missing — which is a different tree from the one the
          // server rendered, so the whole page fails to hydrate.
          <TableHeader>
            <TableRow>
              <TableHead column="main">Business</TableHead>
              <TableHead column="meta">Status</TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                Categories
              </TableHead>
              <TableHead column="meta">Sent</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={data.submissions.length === 0}
        emptyText={
          // A search that found nothing is not an empty queue, and saying so
          // stops the screen claiming the site has never had a submission.
          search.q
            ? `Nothing matches “${search.q}”. Clear the search to see everything.`
            : search.status
              ? "Nothing with that status."
              : "Nothing has been submitted yet."
        }
        emptyColSpan={5}
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
        {data.submissions.map((submission) => {
          const listing = submission.listingId
            ? data.listings[submission.listingId]
            : undefined
          return (
            <TableRow
              key={submission.id}
              className="group"
              rowAction={() => setListSearch({ open: submission.id })}
            >
              <TableCell column="main">
                <button
                  type="button"
                  className="block max-w-96 truncate text-left text-sm font-medium group-hover:underline"
                  onClick={() => setListSearch({ open: submission.id })}
                  title={submission.businessName}
                >
                  {submission.businessName}
                </button>
                <span
                  className="block max-w-96 truncate text-xs text-muted-foreground"
                  title={submission.contactEmail}
                >
                  {submission.contactEmail}
                </span>
              </TableCell>
              <TableCell column="meta">
                {submission.status === "pending_review" ? (
                  <Badge>{REVIEW_STATUS_LABELS.pending_review}</Badge>
                ) : submission.status === "approved" ? (
                  <Badge variant="secondary">
                    {REVIEW_STATUS_LABELS.approved}
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    {REVIEW_STATUS_LABELS[submission.status]}
                  </Badge>
                )}
              </TableCell>
              <TableCell column="meta" className="hidden md:table-cell">
                <span
                  className="block max-w-48 truncate text-xs text-muted-foreground"
                  title={submission.categoryNames.join(", ")}
                >
                  {submission.categoryNames.join(", ") || "—"}
                </span>
              </TableCell>
              <TableCell column="meta">
                {formatDate(submission.createdAt)}
              </TableCell>
              <TableCell column="actions">
                <div className="flex items-center">
                  {listing ? (
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      aria-label={`Open ${listing.title}`}
                    >
                      <Link
                        to="/admin/listings"
                        search={{ open: submission.listingId ?? undefined }}
                      >
                        The listing
                      </Link>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Open ${submission.businessName}`}
                    onClick={() => setListSearch({ open: submission.id })}
                  >
                    <SettingsIcon className="size-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>

      <SubmissionDialog
        open={Boolean(open)}
        submission={open}
        listing={
          open?.listingId ? (data.listings[open.listingId] ?? null) : null
        }
        onClose={() => setListSearch({ open: undefined })}
        onDecided={(decision) => {
          setListSearch({ open: undefined })
          toast.success(
            decision === "approve"
              ? "Approved. The listing is live and the sender has been emailed."
              : "Rejected. The sender has been emailed."
          )
          void router.invalidate()
        }}
      />
    </>
  )
}
