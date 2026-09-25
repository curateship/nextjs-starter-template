import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { BadgeCheckIcon, PencilRulerIcon, SettingsIcon } from "lucide-react"
import { toast } from "sonner"

import { ClaimDialog } from "@/components/directory/claim-dialog"
import { EditRequestDialog } from "@/components/directory/edit-request-dialog"
import { CharacterCount } from "@/components/shared/character-count"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  getClaimErrorMessage,
  saveClaimSettings,
  type ClaimsScreen,
} from "@/lib/api/directory/claims"
import {
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  type ReviewStatus,
} from "@/lib/directory/review-status"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"

/**
 * Claims, the changes owners have asked for, and what this site says about
 * claiming — three blocks on one screen because they are one job. An admin
 * opening this is asking "what do the businesses want", and splitting that
 * across three addresses would mean checking three.
 *
 * **Neither table has a selection column**, and that is a deliberate departure
 * from the table standard: there is no multi-row action. Handing out several
 * listings at once, or applying several people's edits unread, is exactly what
 * these queues exist to stop.
 */
export function ClaimsDashboard({
  data,
  search,
}: {
  data: ClaimsScreen
  search: { status?: ReviewStatus; q?: string; open?: string; request?: string }
}) {
  const router = useRouter()
  const setListSearch = useListSearchNavigate()
  // The typed text stays in the box and the address catches up once typing
  // pauses, so a shared link and a refresh both keep the search.
  const [searchText, setSearchText] = useSearchBoxText(
    search.q ?? "",
    (value) => setListSearch({ q: value, page: undefined })
  )

  const openClaim = search.open
    ? (data.claims.find((row) => row.id === search.open) ?? null)
    : null
  const openRequest = search.request
    ? (data.requests.find((row) => row.id === search.request) ?? null)
    : null

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))

  return (
    <>
      <DashboardTable
        title="Claims"
        icon={<BadgeCheckIcon className="text-muted-foreground" />}
        count={data.total}
        controls={
          <>
            {/* How many need an answer, said on the screen rather than in a
                notification list — the shell's list of notice kinds is a shell
                file an app may not add to, so this is where the count lives. */}
            {data.waitingClaims && search.status !== "pending_review" ? (
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() =>
                  setListSearch({ status: "pending_review", page: undefined })
                }
              >
                {data.waitingClaims === 1
                  ? "1 needs review"
                  : `${data.waitingClaims} need review`}
              </button>
            ) : null}
            <DashboardToolbarSearch
              name="claim-search"
              aria-label="Search claims by listing, claimant name or email"
              placeholder="Search listing, name or email…"
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
              <TableHead column="main">Listing</TableHead>
              <TableHead column="meta">Status</TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                Email check
              </TableHead>
              <TableHead column="meta">Asked</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={data.claims.length === 0}
        emptyText={
          // A search that found nothing is not an empty screen, and saying so
          // stops it claiming the site has never had a claim.
          search.q
            ? `Nothing matches “${search.q}”. Clear the search to see everything.`
            : search.status
              ? "Nothing with that status."
              : "Nobody has claimed a listing yet."
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
        {data.claims.map((claim) => (
          <TableRow
            key={claim.id}
            className="group"
            rowAction={() => setListSearch({ open: claim.id })}
          >
            <TableCell column="main">
              <button
                type="button"
                className="block max-w-96 truncate text-left text-sm font-medium group-hover:underline"
                onClick={() => setListSearch({ open: claim.id })}
                title={claim.listingTitle}
              >
                {claim.listingTitle}
              </button>
              <span
                className="block max-w-96 truncate text-xs text-muted-foreground"
                title={`${claim.claimantName} · ${claim.contactEmail}`}
              >
                {claim.claimantName} · {claim.contactEmail}
              </span>
            </TableCell>
            <TableCell column="meta">
              {claim.status === "pending_review" ? (
                <Badge>{REVIEW_STATUS_LABELS.pending_review}</Badge>
              ) : claim.status === "approved" ? (
                <Badge variant="secondary">
                  {REVIEW_STATUS_LABELS.approved}
                </Badge>
              ) : (
                <Badge variant="outline">
                  {REVIEW_STATUS_LABELS[claim.status]}
                </Badge>
              )}
            </TableCell>
            <TableCell column="meta" className="hidden md:table-cell">
              <span className="text-xs text-muted-foreground">
                {claim.emailDomainMatches
                  ? "Same domain"
                  : "Different domain"}
              </span>
            </TableCell>
            <TableCell column="meta">{formatDate(claim.createdAt)}</TableCell>
            <TableCell column="actions">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Open the claim on ${claim.listingTitle}`}
                onClick={() => setListSearch({ open: claim.id })}
              >
                <SettingsIcon className="size-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <DashboardTable
        title="Changes owners have asked for"
        icon={<PencilRulerIcon className="text-muted-foreground" />}
        // The waiting count, not the length of the page: this list only ever
        // shows the pending ones, so the two agree today — and if a status
        // filter is ever added here, the heading still says how many are
        // actually waiting rather than how many happen to be drawn.
        count={data.waitingRequests}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Listing</TableHead>
              <TableHead column="meta">Asked</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={data.requests.length === 0}
        emptyText="Nothing is waiting. Owners' changes appear here before they go live."
        emptyColSpan={3}
        footer={{ type: "summary", count: data.requests.length }}
      >
        {data.requests.map((request) => (
          <TableRow
            key={request.id}
            className="group"
            rowAction={() => setListSearch({ request: request.id })}
          >
            <TableCell column="main">
              <button
                type="button"
                className="block max-w-96 truncate text-left text-sm font-medium group-hover:underline"
                onClick={() => setListSearch({ request: request.id })}
                title={request.listingTitle}
              >
                {request.listingTitle}
              </button>
              <span
                className="block max-w-96 truncate text-xs text-muted-foreground"
                title={request.ownerEmail}
              >
                {request.ownerName}
              </span>
            </TableCell>
            <TableCell column="meta">{formatDate(request.createdAt)}</TableCell>
            <TableCell column="actions">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Open the changes to ${request.listingTitle}`}
                onClick={() => setListSearch({ request: request.id })}
              >
                <SettingsIcon className="size-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <ClaimSettingsCard settings={data.settings} />

      <ClaimDialog
        open={Boolean(openClaim)}
        claim={openClaim}
        onClose={() => setListSearch({ open: undefined })}
        onDecided={(decision) => {
          setListSearch({ open: undefined })
          toast.success(
            decision === "approve"
              ? "Approved. They can now suggest changes, and the page shows the claimed mark."
              : "Rejected. They have been emailed."
          )
          void router.invalidate()
        }}
      />

      <EditRequestDialog
        open={Boolean(openRequest)}
        request={openRequest}
        onClose={() => setListSearch({ request: undefined })}
        onDecided={(decision) => {
          setListSearch({ request: undefined })
          toast.success(
            decision === "approve"
              ? "Applied. The public page has changed."
              : "Rejected. The page is unchanged and they have been emailed."
          )
          void router.invalidate()
        }}
      />
    </>
  )
}

/**
 * What this site says about claiming.
 *
 * Every box may be left empty, and an empty one means "use the built-in
 * wording" rather than an empty page — the default lives in one place on the
 * server, and clearing a box is how an admin says they have nothing better.
 */
function ClaimSettingsCard({ settings }: { settings: ClaimsScreen["settings"] }) {
  const router = useRouter()
  const [enabled, setEnabled] = React.useState(settings.claimsEnabled)
  const [label, setLabel] = React.useState(settings.claimButtonLabel)
  const [pending, setPending] = React.useState(settings.claimPendingMessage)
  const [approved, setApproved] = React.useState(settings.claimApprovedMessage)
  const [save, saving] = useAsyncAction(getClaimErrorMessage)

  return (
    <Card>
      <CardHeader>
        <CardTitle>What visitors are told about claiming</CardTitle>
        <CardDescription>
          Leave a box empty to use the wording the app comes with.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="claims-enabled"
            checked={enabled}
            disabled={saving}
            onCheckedChange={setEnabled}
          />
          <FieldLabel htmlFor="claims-enabled">
            Let businesses claim their listing
          </FieldLabel>
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="claim-label">Button</FieldLabel>
            <CharacterCount value={label} max={80} />
          </div>
          <Input
            id="claim-label"
            maxLength={80}
            placeholder="Is this your business?"
            value={label}
            disabled={saving || !enabled}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="claim-pending">
              While a request is being read
            </FieldLabel>
            <CharacterCount value={pending} max={300} />
          </div>
          <Textarea
            id="claim-pending"
            rows={1}
            maxLength={300}
            value={pending}
            disabled={saving || !enabled}
            onChange={(event) => setPending(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="claim-approved">
              To the owner, once it is theirs
            </FieldLabel>
            <CharacterCount value={approved} max={300} />
          </div>
          <Textarea
            id="claim-approved"
            rows={1}
            maxLength={300}
            value={approved}
            disabled={saving || !enabled}
            onChange={(event) => setApproved(event.target.value)}
          />
        </div>
        <div>
          {/* Enabled even with nothing changed: a button that greys itself out
              never says why, and saving the same values again costs nothing. */}
          <Button
            type="button"
            disabled={saving}
            onClick={() =>
              void save(async () => {
                await saveClaimSettings({
                  claimsEnabled: enabled,
                  claimButtonLabel: label,
                  claimPendingMessage: pending,
                  claimApprovedMessage: approved,
                })
                await router.invalidate()
                toast.success("Saved.")
              })
            }
          >
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
