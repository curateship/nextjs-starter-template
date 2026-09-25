import { useRouter } from "@tanstack/react-router"
import { MailIcon } from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  getOutreachErrorMessage,
  loadOutreach,
  sendOutreach,
} from "@/lib/api/directory/outreach"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"

type Overview = Awaited<ReturnType<typeof loadOutreach>>

/** What one send may carry, matching the endpoint's own cap on the list it takes. */
const SEND_LIMIT = 50

/**
 * The claim-invitation screen.
 *
 * Both tables page on the server. The first one is *every published listing on
 * the site that nobody owns*, which on a directory imported with three thousand
 * businesses is nearly all of them — it used to draw every row at once, under a
 * "select all" checkbox, and the browser fought every scroll.
 */
export function OutreachDashboard({
  data,
  search,
}: {
  data: Overview
  search: { q?: string; page?: number; historyPage?: number; size?: number }
}) {
  const router = useRouter()
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getOutreachErrorMessage)
  const setListSearch = useListSearchNavigate()
  // The typed text stays in the box and the address catches up once typing
  // pauses, so a shared link and a refresh both keep the search.
  const [searchText, setSearchText] = useSearchBoxText(search.q ?? "", (value) =>
    setListSearch({ q: value, page: undefined, historyPage: undefined })
  )

  const rows = data.listings
  // The ids on **this page** that can be written to. The header checkbox works
  // on these and says so, because the other pages are not on screen and a box
  // that quietly picked up two thousand unseen rows would be a trap.
  const pageEligibleIds = rows
    .filter((row) => row.status === "ready")
    .map((row) => row.id)
  // The whole selection, not just this page's share of it. Paging **keeps**
  // what was already ticked, and the number beside Send is that whole figure,
  // so nothing is ever sent to rows somebody has scrolled away from unaware.
  const selectedIds = [...selection.selected]
  const overLimit = selectedIds.length > SEND_LIMIT

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))
  const historyTotalPages = Math.max(
    1,
    Math.ceil(data.historyTotal / data.pageSize)
  )

  return (
    <>
    <DashboardTable
      title="Claim outreach"
      icon={<MailIcon className="text-muted-foreground" />}
      count={data.total}
      selectedCount={selectedIds.length}
      onClearSelection={selection.clear}
      controls={
        <>
          {selectedIds.length ? (
            <DisabledReason
              disabled={overLimit}
              reason={`One send carries ${SEND_LIMIT} at a time. Untick some, or send it in two goes.`}
            >
              <DashboardToolbarButton
                type="button"
                disabled={busy || overLimit}
                onClick={() => void run(async () => {
                  const result = await sendOutreach(selectedIds)
                  selection.clear()
                  await router.invalidate()
                  toast.success(
                    describeBulkResult({
                      done: result.sent.length,
                      kept: result.skipped.length + result.failed.length,
                      one: "invitation",
                      many: "invitations",
                      verb: "sent",
                    })
                  )
                })}
              >
                <MailIcon /> Send invitations ({selectedIds.length})
              </DashboardToolbarButton>
            </DisabledReason>
          ) : null}
          <DashboardToolbarSearch
            name="outreach-search"
            aria-label="Search outreach by listing title or contact email"
            placeholder="Search listing or email…"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </>
      }
      header={
        <TableHeader><TableRow>
          <TableHead column="select">
            <Checkbox
              checked={selection.selectAllState(pageEligibleIds)}
              disabled={pageEligibleIds.length === 0}
              onCheckedChange={() => selection.toggleVisible(pageEligibleIds)}
              aria-label="Select all listings on this page that are ready for outreach"
            />
          </TableHead>
          <TableHead column="main">Listing</TableHead>
          <TableHead column="meta">Contact</TableHead>
          <TableHead column="meta">Status</TableHead>
          <TableHead column="meta">History</TableHead>
        </TableRow></TableHeader>
      }
      isEmpty={rows.length === 0}
      emptyText={
        // A search that found nothing is not an empty site, and saying so stops
        // the screen claiming every listing already has an owner.
        search.q
          ? `Nothing matches “${search.q}”. Clear the search to see everything.`
          : "No unclaimed published listing has a contact email on this site."
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
        onPageSizeChange: (size) =>
          setListSearch({ size, page: undefined, historyPage: undefined }),
      }}
    >
      {rows.map((row) => {
        const eligible = row.status === "ready"
        const label = row.status === "opted_out"
          ? "Opted out"
          : row.sendStatus === "sent"
            ? "Already contacted"
            : row.status === "sent"
              ? "Already attempted"
              : "Ready"
        return (
          <TableRow key={row.id}>
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(row.id)}
                disabled={!eligible}
                onCheckedChange={() => selection.toggle(row.id)}
                aria-label={`Select ${row.title}`}
              />
            </TableCell>
            <TableCell column="main">
              <span className="block max-w-96 truncate font-medium" title={row.title}>{row.title}</span>
            </TableCell>
            <TableCell column="meta"><span className="block max-w-64 truncate" title={row.email}>{row.email}</span></TableCell>
            <TableCell column="meta"><Badge variant={eligible ? "secondary" : "outline"}>{label}</Badge></TableCell>
            <TableCell column="meta">
              {row.sentAt ? (
                <><span>{formatDate(row.sentAt)}</span>{row.sendStatus === "failed" ? <span className="block max-w-64 truncate text-xs text-destructive" title={row.error}>Failed: {row.error}</span> : null}</>
              ) : "—"}
            </TableCell>
          </TableRow>
        )
      })}
    </DashboardTable>
    <DashboardTable
      title="Send history"
      icon={<MailIcon className="text-muted-foreground" />}
      count={data.historyTotal}
      header={
        <TableHeader><TableRow>
          <TableHead column="main">Listing</TableHead>
          <TableHead column="meta">Address</TableHead>
          <TableHead column="meta">Result</TableHead>
          <TableHead column="meta">Date</TableHead>
        </TableRow></TableHeader>
      }
      isEmpty={data.history.length === 0}
      emptyText={
        search.q
          ? `Nothing matches “${search.q}”. Clear the search to see everything.`
          : "No claim invitation has been attempted on this site yet."
      }
      emptyColSpan={4}
      footer={{
        type: "pagination",
        page: data.historyPage,
        pageSize: data.pageSize,
        total: data.historyTotal,
        totalPages: historyTotalPages,
        onPageChange: (page) =>
          setListSearch({ historyPage: page > 1 ? page : undefined }),
        onPageSizeChange: (size) =>
          setListSearch({ size, page: undefined, historyPage: undefined }),
      }}
    >
      {data.history.map((item) => (
        <TableRow key={item.id}>
          <TableCell column="main">
            <span className="block max-w-96 truncate font-medium" title={item.listingTitle}>{item.listingTitle}</span>
          </TableCell>
          <TableCell column="meta"><span className="block max-w-64 truncate" title={item.email}>{item.email}</span></TableCell>
          <TableCell column="meta">
            <Badge variant={item.status === "sent" ? "secondary" : "outline"}>{item.status}</Badge>
            {item.error ? <span className="block max-w-64 truncate text-xs text-destructive" title={item.error}>{item.error}</span> : null}
          </TableCell>
          <TableCell column="meta">{formatDate(item.createdAt)}</TableCell>
        </TableRow>
      ))}
    </DashboardTable>
    </>
  )
}
