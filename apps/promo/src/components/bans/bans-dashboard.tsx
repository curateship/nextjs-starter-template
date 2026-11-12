import * as React from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import { BanIcon, Loader2Icon, SettingsIcon } from "lucide-react"

import { FilterSelect } from "@/components/browser/sorting-filters"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { SortableTableHeader, type TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { BanCard } from "@/components/social/accounts/ban-card"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { LoadingRow } from "@/components/ui/loading-row"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  answerUnknownScreen,
  getBansErrorMessage,
  loadUnknownScreenPicture,
  releaseAppBrake,
  type BanRow,
  type BansPage,
} from "@/lib/api/bans"
import { getRedditAccountsErrorMessage, letRedditAccountRunAgain } from "@/lib/api/social/reddit-accounts"
import { ALL } from "@/lib/browser/sorting"
import { BAN_SINCE, type BansSearch } from "@/lib/bans/bans-search"
import { appName, BAN_KIND_LABELS, BAN_KINDS, isBanKind } from "@/lib/bans/options"
import { formatDateTime } from "@/lib/format/format-time"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { handleWords, isNetwork, NETWORK_NAMES, NETWORKS } from "@/lib/social/networks"
import { showErrorToast } from "@/lib/toast/error-toast"

type SortColumn = "at" | "app" | "account" | "kind"

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "account", label: "Account", column: "main" },
  { key: "at", label: "When", column: "meta" },
  { key: "app", label: "App", column: "meta", className: "hidden md:table-cell" },
  { key: "kind", label: "Kind", column: "meta" },
  // Folded into a line under the account below these widths, or the row is
  // wider than its card.
  { key: "phone", label: "Phone or profile", column: "meta", className: "hidden xl:table-cell", sortable: false },
  { key: "proxy", label: "Proxy or SIM", column: "meta", className: "hidden xl:table-cell", sortable: false },
  { key: "age", label: "Age then", column: "meta", className: "hidden 2xl:table-cell", sortable: false },
  { key: "posts", label: "Posts in the week before", column: "meta", className: "hidden 2xl:table-cell", sortable: false },
  { key: "seller", label: "Seller", column: "meta", className: "hidden 2xl:table-cell", sortable: false },
  { key: "appeal", label: "Appeal", column: "meta", className: "hidden lg:table-cell", sortable: false },
  { key: "after", label: "Since", column: "meta", className: "hidden lg:table-cell", sortable: false },
]

const DAY_MS = 86_400_000

function compare(a: BanRow, b: BanRow, column: SortColumn): number {
  switch (column) {
    case "app":
      return appName(a.app).localeCompare(appName(b.app))
    case "account":
      return (a.handle || "~").localeCompare(b.handle || "~")
    case "kind":
      return BAN_KIND_LABELS[a.kind].localeCompare(BAN_KIND_LABELS[b.kind])
    default:
      return new Date(a.at).getTime() - new Date(b.at).getTime()
  }
}

const who = (row: BanRow) => handleWords(row.app, row.account?.handle || row.handle) || `${appName(row.app)} account, not signed in`

const appealWords = (row: BanRow) =>
  !row.appeal ? "None" : row.appeal.answer === "won" ? "Won" : row.appeal.answer === "lost" ? "Lost" : "Waiting"

const afterWords = (row: BanRow) =>
  row.cleanedUpAt ? "Cleaned up" : row.letRunAt ? "Let run again" : row.looksBackAt ? "Looks back" : row.stopped ? "Stopped" : "Retired"

/**
 * Every ban in one list, to spot patterns (Bans task, part 12). Under Anti
 * Detect in the left menu, after Racks. Built like the old Phones dashboard:
 * the shell's table, the filters in the address, and each row opening its
 * ban in a window with the picture (part 10), the screen's words, the appeal
 * (part 25) and the phone's last 20 actions before it.
 *
 * Above the list, only when there is something: the apps the brake holds
 * with Release (part 11), the screens Promo is asking about (part 9), and
 * the sellers' bans and dollars lost (part 16).
 *
 * No row is ticked: nobody changes bans in bulk, so the list has no tick
 * boxes.
 */
export function BansDashboard({ initial, filters }: { initial: BansPage; filters: BansSearch }) {
  const router = useRouter()
  const navigate = useNavigate()
  const page = initial
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("at", "desc")
  const [error, setError] = React.useState<string | null>(null)
  // "Last 30 days" counts from when the page was opened, so a list does not shift while it is read.
  const [openedAt] = React.useState(() => Date.now())

  const refresh = React.useCallback(async () => {
    try {
      await router.invalidate()
      setError(null)
    } catch (failure) {
      setError(getBansErrorMessage(failure))
    }
  }, [router])

  const setFilter = React.useCallback(
    (patch: Partial<BansSearch>, replace = false) => {
      void navigate({
        to: ".",
        replace,
        search: (previous: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...previous }
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === "") delete next[key]
            else next[key] = value
          }
          return next
        },
      })
    },
    [navigate]
  )

  const options = React.useMemo(() => {
    const phones = new Map<string, string>()
    const proxies = new Map<string, string>()
    const projects = new Map<string, string>()
    const sellers = new Set<string>()
    for (const row of page.bans) {
      if (row.phone) phones.set(row.phone.id, row.phone.name)
      if (row.proxy) proxies.set(row.proxy.id, row.proxy.label)
      if (row.project) projects.set(row.project.id, row.project.name)
      if (row.seller) sellers.add(row.seller)
    }
    // A value in the address that is not among them stays as an option, so a filter never changes on its own.
    if (filters.phone && !phones.has(filters.phone)) phones.set(filters.phone, "A phone with no bans")
    if (filters.proxy && !proxies.has(filters.proxy)) proxies.set(filters.proxy, "A proxy with no bans")
    if (filters.project && !projects.has(filters.project)) projects.set(filters.project, "A project with no bans")
    if (filters.seller) sellers.add(filters.seller)
    const list = (map: Map<string, string>) => [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
    return {
      phones: list(phones),
      proxies: list(proxies),
      projects: list(projects),
      sellers: [...sellers].sort((a, b) => a.localeCompare(b)).map((name) => ({ id: name, name })),
    }
  }, [filters.phone, filters.project, filters.proxy, filters.seller, page.bans])

  const shown = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    const since = filters.since ? openedAt - filters.since * DAY_MS : null
    return page.bans
      .filter((row) => {
        if (filters.app && row.app !== filters.app) return false
        if (filters.kind && row.kind !== filters.kind) return false
        if (filters.phone && row.phone?.id !== filters.phone) return false
        if (filters.proxy && row.proxy?.id !== filters.proxy) return false
        if (filters.seller && row.seller.toLowerCase() !== filters.seller.toLowerCase()) return false
        if (filters.project && row.project?.id !== filters.project) return false
        if (since !== null && new Date(row.at).getTime() < since) return false
        return true
      })
      .sort((a, b) => factor * compare(a, b, sort))
  }, [direction, filters, openedAt, page.bans, sort])

  const open = filters.open ? (page.bans.find((row) => row.id === filters.open) ?? null) : null
  const showCards = page.brakes.length > 0 || page.unknown.length > 0 || page.sellers.length > 0

  return (
    <>
      {showCards ? (
        <div className="grid lg:grid-cols-2 2xl:grid-cols-3" style={{ gap: pageGutter }}>
          {page.brakes.length ? <BrakeCard brakes={page.brakes} onChanged={refresh} /> : null}
          {page.unknown.map((screen) => (
            <UnknownScreenCard key={screen.id} screen={screen} onChanged={refresh} />
          ))}
          {page.sellers.length ? <SellersCard sellers={page.sellers} onPick={(seller) => setFilter({ seller })} /> : null}
        </div>
      ) : null}
      <DashboardTable
        title="Bans"
        icon={<BanIcon />}
        count={shown.length}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        controls={
          <>
            <FilterSelect
              label="App"
              value={filters.app ?? ALL}
              onChange={(value) => setFilter({ app: isNetwork(value) ? value : undefined })}
              allLabel="All apps"
              options={NETWORKS.map((network) => ({ id: network, name: NETWORK_NAMES[network] }))}
            />
            <FilterSelect
              label="Kind"
              value={filters.kind ?? ALL}
              onChange={(value) => setFilter({ kind: isBanKind(value) ? value : undefined })}
              allLabel="All kinds"
              options={BAN_KINDS.map((kind) => ({ id: kind, name: BAN_KIND_LABELS[kind] }))}
            />
            {options.phones.length ? (
              <FilterSelect label="Phone" value={filters.phone ?? ALL} onChange={(value) => setFilter({ phone: value === ALL ? undefined : value })} allLabel="All phones" options={options.phones} />
            ) : null}
            {options.proxies.length ? (
              <FilterSelect label="Proxy" value={filters.proxy ?? ALL} onChange={(value) => setFilter({ proxy: value === ALL ? undefined : value })} allLabel="All proxies" options={options.proxies} />
            ) : null}
            {options.sellers.length ? (
              <FilterSelect label="Seller" value={filters.seller ?? ALL} onChange={(value) => setFilter({ seller: value === ALL ? undefined : value })} allLabel="All sellers" options={options.sellers} />
            ) : null}
            {options.projects.length ? (
              <FilterSelect label="Project" value={filters.project ?? ALL} onChange={(value) => setFilter({ project: value === ALL ? undefined : value })} allLabel="All projects" options={options.projects} />
            ) : null}
            <FilterSelect
              label="When"
              value={filters.since ? String(filters.since) : ALL}
              onChange={(value) => setFilter({ since: (BAN_SINCE as readonly number[]).includes(Number(value)) ? (Number(value) as BansSearch["since"]) : undefined })}
              allLabel="Any time"
              options={BAN_SINCE.map((days) => ({ id: String(days), name: `Last ${days} days` }))}
            />
          </>
        }
        header={<SortableTableHeader columns={COLUMNS} sort={sort} direction={direction} onSort={toggleSort} trailing={<TableHead column="meta">Actions</TableHead>} />}
        isEmpty={shown.length === 0}
        emptyText={page.bans.length ? "No bans match that." : "No account has been banned yet"}
        emptyColSpan={COLUMNS.length + 1}
        footer={{ type: "summary", count: shown.length, label: shown.length === 1 ? "ban" : "bans" }}
      >
        {shown.map((row) => (
          <TableRow key={row.id} className="group" rowAction={() => setFilter({ open: row.id })}>
            <TableCell column="main" className="max-w-0">
              <button type="button" className="block max-w-full truncate text-left text-sm font-medium group-hover:underline" onClick={() => setFilter({ open: row.id })}>
                {who(row)}
              </button>
              <span className="block truncate text-xs text-muted-foreground md:hidden">{appName(row.app)}</span>
              <span className="block truncate text-xs text-muted-foreground xl:hidden">
                {[row.phone ? `Phone: ${row.phone.name}` : null, row.proxy ? `Proxy: ${row.proxy.label}` : null, row.simCarrier ? `SIM: ${row.simCarrier}` : null].filter(Boolean).join(" · ") ||
                  "In a browser profile"}
              </span>
              <span className="block truncate text-xs text-muted-foreground 2xl:hidden">
                {[row.ageDays === null ? null : `${row.ageDays} days old`, `${row.postsWeek} posts in the week before`, row.seller ? `from ${row.seller}` : null].filter(Boolean).join(" · ")}
              </span>
            </TableCell>
            <TableCell column="meta" className="text-sm whitespace-nowrap">
              {formatDateTime(row.at)}
            </TableCell>
            <TableCell column="meta" className="hidden text-sm md:table-cell">
              {appName(row.app)}
            </TableCell>
            <TableCell column="meta" className="text-sm">
              <span className={row.counts ? "text-destructive" : undefined}>{BAN_KIND_LABELS[row.kind]}</span>
              {row.counts ? null : <span className="block text-xs text-muted-foreground">Recorded, not counted</span>}
            </TableCell>
            <TableCell column="meta" className="hidden max-w-40 text-sm xl:table-cell">
              {row.phone ? (
                <Link to="/admin/phones" search={{ open: row.phone.id }} className="block truncate hover:underline" onClick={(event) => event.stopPropagation()}>
                  {row.phone.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">Browser profile</span>
              )}
            </TableCell>
            <TableCell column="meta" className="hidden max-w-40 text-sm xl:table-cell">
              <span className="block truncate">{row.proxy ? row.proxy.label : row.simCarrier ? `SIM: ${row.simCarrier}` : <span className="text-muted-foreground">-</span>}</span>
            </TableCell>
            <TableCell column="meta" className="hidden text-sm tabular-nums 2xl:table-cell">
              {row.ageDays === null ? <span className="text-muted-foreground">-</span> : `${row.ageDays} days`}
            </TableCell>
            <TableCell column="meta" className="hidden text-right text-sm tabular-nums 2xl:table-cell">
              {row.postsWeek}
            </TableCell>
            <TableCell column="meta" className="hidden max-w-32 text-sm 2xl:table-cell">
              <span className="block truncate">{row.seller || <span className="text-muted-foreground">-</span>}</span>
            </TableCell>
            <TableCell column="meta" className="hidden text-sm lg:table-cell">
              {appealWords(row)}
            </TableCell>
            <TableCell column="meta" className="hidden text-sm lg:table-cell">
              {afterWords(row)}
            </TableCell>
            <TableCell column="actions">
              <Hint label="The ban: its picture, the appeal and what next">
                <Button type="button" variant="ghost" size="icon" onClick={() => setFilter({ open: row.id })} aria-label={`Open the ban of ${who(row)}`}>
                  <SettingsIcon className="size-4" />
                </Button>
              </Hint>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
      <BanDialog row={open} onClose={() => setFilter({ open: undefined })} onChanged={refresh} />
    </>
  )
}

function BanDialog({ row, onClose, onChanged }: { row: BanRow | null; onClose: () => void; onChanged: () => Promise<void> }) {
  const name = row ? who(row) : ""

  async function runAgain() {
    if (!row?.account) return
    try {
      await letRedditAccountRunAgain(row.account.id)
      await onChanged()
    } catch (failure) {
      showErrorToast(getRedditAccountsErrorMessage(failure))
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(next) => (next ? null : onClose())}>
      {row ? (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              {name} · {appName(row.app)}
            </DialogTitle>
            <DialogDescription>
              {row.phone ? `On the phone ${row.phone.name}` : "In a browser profile"}
              {row.proxy ? `, through the proxy ${row.proxy.label}` : row.simCarrier ? `, on a ${row.simCarrier} SIM` : ""}
              {row.ageDays === null ? "" : `. ${row.ageDays} days old`}, {row.postsWeek} posts in the week before.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-6">
              <BanCard
                ban={{
                  id: row.id,
                  kind: row.kind,
                  at: row.at,
                  words: row.words,
                  hasPicture: row.hasPicture,
                  appealedAt: row.appeal?.at ?? null,
                  appealNote: row.appeal?.note ?? "",
                  appealAnswer: row.appeal?.answer ?? "",
                }}
                accountName={name}
                stopped={row.stopped}
                cleanUpHeldBack={row.cleanUpHeldBack}
                phoneId={row.phone?.id ?? null}
                accountId={row.account?.id ?? null}
                onRunAgain={row.account ? runAgain : null}
                onChanged={onChanged}
                showActionsBefore
              />
              {row.account ? (
                <p className="text-sm text-muted-foreground">
                  {"The account's own history is on its settings window: "}
                  <Link to="/admin/projects" search={{ section: "accounts", open: row.account.id }} className="font-medium text-foreground underline underline-offset-2">
                    open {name} on the Accounts dashboard
                  </Link>
                  .
                </p>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

/** The apps the brake holds (part 11), each with its Release. Nothing restarts by itself. */
function BrakeCard({ brakes, onChanged }: { brakes: BansPage["brakes"]; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = React.useState<string | null>(null)
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Paused after two bans in a day</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {brakes.map((brake) => (
          <div key={brake.app} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">
              Every {appName(brake.app)} account is paused since {formatDateTime(brake.at)}. Their jobs wait.
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={async () => {
                setBusy(brake.app)
                try {
                  await releaseAppBrake(brake.app)
                  await onChanged()
                } catch (failure) {
                  showErrorToast(getBansErrorMessage(failure))
                } finally {
                  setBusy(null)
                }
              }}
            >
              {busy === brake.app ? <Loader2Icon className="animate-spin" /> : null}
              Release {appName(brake.app)}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/** A screen Promo did not know (part 9): its picture and the line, and It's a ban or Not a ban. */
function UnknownScreenCard({ screen, onChanged }: { screen: BansPage["unknown"][number]; onChanged: () => Promise<void> }) {
  const [picture, setPicture] = React.useState<string | null | undefined>(screen.hasPicture ? undefined : null)
  const [busy, setBusy] = React.useState<"ban" | "harmless" | null>(null)

  React.useEffect(() => {
    if (!screen.hasPicture) return
    let live = true
    loadUnknownScreenPicture(screen.id).then(
      (src) => live && setPicture(src),
      () => live && setPicture(null)
    )
    return () => {
      live = false
    }
  }, [screen.hasPicture, screen.id])

  async function answer(verdict: "ban" | "harmless") {
    setBusy(verdict)
    try {
      await answerUnknownScreen(screen.id, verdict)
      await onChanged()
    } catch (failure) {
      showErrorToast(getBansErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  const name = screen.account ? handleWords(screen.account.platform, screen.account.handle) || "An account" : "An account"
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{"Promo doesn't know this screen. Is it a ban?"}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm">
          {name} on {appName(screen.app)}, {formatDateTime(screen.at)}: &ldquo;{screen.line}&rdquo;
        </p>
        {picture === undefined ? <LoadingRow label="Opening the picture" /> : picture ? <img src={picture} alt={`What ${appName(screen.app)} showed`} className="max-h-48 w-fit rounded-md border" /> : null}
        <p className="text-sm text-muted-foreground">The account is stopped until you answer.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="destructive" disabled={busy !== null} onClick={() => void answer("ban")}>
            {busy === "ban" ? <Loader2Icon className="animate-spin" /> : null}
            {"It's a ban"}
          </Button>
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void answer("harmless")}>
            {busy === "harmless" ? <Loader2Icon className="animate-spin" /> : null}
            Not a ban
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`

/** Bans grouped by seller (part 16): "Seller A: 4 bans out of 10 bought, $120 lost". */
function SellersCard({ sellers, onPick }: { sellers: BansPage["sellers"]; onPick: (seller: string) => void }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Sellers</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1">
        {sellers.map((line) => (
          <button
            key={line.seller}
            type="button"
            className="rounded-md px-2 py-1 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={() => onPick(line.seller)}
          >
            <span className="font-medium">{line.seller}:</span> {line.banned} {line.banned === 1 ? "ban" : "bans"} out of {line.bought} bought, {dollars(line.lostCents)} lost
          </button>
        ))}
      </CardContent>
    </Card>
  )
}
