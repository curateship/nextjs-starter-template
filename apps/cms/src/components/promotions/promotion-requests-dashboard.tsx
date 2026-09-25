import { Link, useRouter } from "@tanstack/react-router"
import { InboxIcon, SettingsIcon } from "lucide-react"
import { toast } from "sonner"

import { PromotionRequestDialog } from "@/components/promotions/promotion-request-dialog"
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
  PromotionRequestsPage,
  PromotionRequestStatus,
} from "@/lib/api/promotions/requests"
import { dealRequestDecisionMessage } from "@/lib/directory/submission-decision-message"
import { formatDate } from "@/lib/format/format-time"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"
import { dealAdminDaysText } from "@/lib/promotions/deal-days"

const TAB_LABELS: Record<PromotionRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
}

/**
 * The admin's queue of deals and changes from listing owners, in three tabs:
 * Pending, which it opens on, Approved and Rejected.
 *
 * **No selection column**, the same departure from the table standard as
 * Event suggestions and for the same reason: approving in bulk would publish
 * deals nobody read, which is what this queue is for stopping.
 */
export function PromotionRequestsDashboard({
  data,
  search,
}: {
  data: PromotionRequestsPage
  search: {
    status?: Exclude<PromotionRequestStatus, "pending">
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
  const tab: PromotionRequestStatus = search.status ?? "pending"
  const open = search.open
    ? (data.requests.find((row) => row.id === search.open) ?? null)
    : null
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))

  return (
    <>
      <DashboardTable
        title="Deals from owners"
        icon={<InboxIcon className="text-muted-foreground" />}
        count={data.total}
        controls={
          <>
            <DashboardToolbarSearch
              name="promotion-request-search"
              aria-label="Search by deal, listing or owner's email"
              placeholder="Search requests…"
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
                {(Object.keys(TAB_LABELS) as PromotionRequestStatus[]).map(
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
              <TableHead column="main">Deal</TableHead>
              <TableHead column="meta">Days</TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                Sent
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={data.requests.length === 0}
        emptyText={
          search.q
            ? `Nothing matches “${search.q}”. Clear the search to see everything.`
            : tab === "pending"
              ? "Nothing is waiting. Deals and changes that owners send from My listings land here."
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
        {data.requests.map((request) => (
          <TableRow
            key={request.id}
            className="group"
            rowAction={() => setListSearch({ open: request.id })}
          >
            <TableCell column="main">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  className="block max-w-96 truncate text-left text-sm font-medium group-hover:underline"
                  onClick={() => setListSearch({ open: request.id })}
                  title={request.content.title}
                >
                  {request.content.title}
                </button>
                <Badge variant="outline" className="shrink-0">
                  {request.kind === "new" ? "New deal" : "Change"}
                </Badge>
              </div>
              <span
                className="block max-w-96 truncate text-xs text-muted-foreground"
                title={request.ownerEmail}
              >
                At {request.listingTitle}
                {request.ownerEmail ? ` · ${request.ownerEmail}` : ""}
              </span>
            </TableCell>
            <TableCell column="meta">
              <span className="text-sm whitespace-nowrap">
                {dealAdminDaysText(request.content)}
              </span>
            </TableCell>
            <TableCell column="meta" className="hidden md:table-cell">
              {formatDate(request.createdAt)}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center">
                {request.promotionId && request.status === "approved" ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link
                      to="/admin/promotions"
                      search={{ open: request.promotionId }}
                    >
                      The deal
                    </Link>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Open ${request.content.title}`}
                  onClick={() => setListSearch({ open: request.id })}
                >
                  <SettingsIcon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <PromotionRequestDialog
        open={Boolean(open)}
        request={open}
        onClose={() => setListSearch({ open: undefined })}
        onDecided={(decision, emailed) => {
          // Amber, not green, when the owner was not reached. The decision
          // held, so it is not a failure, but it is not finished either.
          const message = dealRequestDecisionMessage(
            decision,
            emailed,
            open?.kind ?? "new"
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
