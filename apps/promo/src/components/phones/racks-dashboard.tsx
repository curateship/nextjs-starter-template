import * as React from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import { FlaskConicalIcon, PlusIcon, ServerIcon, SettingsIcon, SmartphoneIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { LoosePhonesDialog } from "@/components/phones/loose-phones-dialog"
import { NewRackDialog } from "@/components/phones/new-rack-dialog"
import { PhoneStatusText } from "@/components/phones/phone-status"
import { ResumeRackDialog } from "@/components/phones/resume-rack-dialog"
import { SelfTestDialog } from "@/components/phones/self-test-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton, DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { SelectAllTableHead, SortableTableHeader, type SortableColumn } from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { TableCell, TableGroupRow, TableHead, TableRow } from "@/components/ui/table"
import {
  getPhoneErrorMessage,
  pauseRack,
  removeRacks,
  type PhoneRecord,
  type RacksPage,
  type RackView,
} from "@/lib/api/phones/phones"
import { signedInWords } from "@/lib/browser/wording"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatTimeAgo } from "@/lib/format/format-time"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"
import { setupWarning } from "@/lib/phones/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type SortColumn = "name" | "phones" | "warnings" | "state"

const COLUMNS: SortableColumn<SortColumn>[] = [
  { key: "name", label: "Rack", column: "main" },
  { key: "phones", label: "Phones online", column: "meta", className: "text-right" },
  { key: "warnings", label: "Warnings", column: "meta", className: "hidden text-right sm:table-cell" },
  { key: "state", label: "Checking in", column: "meta", className: "hidden md:table-cell" },
]

/** The rack is read again this often while the dashboard is in view, as each rack's page is. */
const REFRESH_MS = 10_000

const STATE_ORDER = { live: 0, silent: 1, unpaired: 2, disconnected: 3 } as const

/** A rack's phones as the row counts them (parts 75 and 80). */
type RackCounts = { total: number; online: number; warnings: number }

/** A phone needing a look: offline, needing a wipe, or with the amber setup line. */
function needsALook(phone: PhoneRecord): boolean {
  return phone.status === "offline" || Boolean(setupWarning(phone))
}

function countsOf(phones: PhoneRecord[]): RackCounts {
  return {
    total: phones.length,
    online: phones.filter((phone) => phone.status !== "offline").length,
    warnings: phones.filter(needsALook).length,
  }
}

/** Whether a rack is connected, so it cannot be deleted until it is disconnected. */
const connected = (rack: RackView) => rack.state === "live" || rack.state === "silent"

/** "Checking in", "Not checking in, last seen 5 minutes ago", or what to do next. */
function stateWords(rack: RackView): string {
  if (rack.state === "unpaired") return "Waiting for the rack program"
  if (rack.state === "disconnected") return "Disconnected"
  if (rack.state === "live") return "Checking in"
  return rack.seenAt ? `Not checking in, last seen ${formatTimeAgo(rack.seenAt)}` : "Not checked in yet"
}

const STATE_DOT: Record<RackView["state"], string> = {
  live: "bg-emerald-500",
  silent: "bg-destructive",
  unpaired: "bg-muted-foreground/50",
  disconnected: "bg-muted-foreground/50",
}

/**
 * The Racks dashboard (Racks dashboard, part 75; Tyler, 5 Nov 2026: "Rack
 * dashboard > create rack > enter name, discription > rack name (3 panel
 * dashboard)"). Every rack as a row, with its phones online out of all of
 * them, how many need a look, and whether it is checking in. A row opens the
 * rack's own page. New rack makes one and installs its program. Pause and
 * Self-test sit here because each is one switch for every rack.
 *
 * The search box covers the racks and, under them, every phone by name,
 * serial, model or account, so a phone is one search away wherever it is
 * (part 81). Phones on no rack gather in one Not on a rack row (part 83).
 */
export function RacksDashboard({ initial, search }: { initial: RacksPage; search: { q?: string; loose?: "1" } }) {
  const { config } = useShellRuntime()
  const router = useRouter()
  const navigate = useNavigate()
  const setSearch = useListSearchNavigate()
  const page = initial
  const [query, setQuery] = useSearchBoxText(search.q ?? "", (text) => setSearch({ q: text.trim() || undefined }))
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("name")
  const [pageNumber, setPageNumber] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const selection = useSelection()
  const [creating, setCreating] = React.useState(false)
  const [selfTestOpen, setSelfTestOpen] = React.useState(false)
  const [resuming, setResuming] = React.useState(false)
  const [deleteTargets, setDeleteTargets] = React.useState<RackView[]>([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      await router.invalidate()
      setError(null)
    } catch (loadError) {
      setError(getPhoneErrorMessage(loadError))
    }
  }, [router])

  React.useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void router.invalidate().catch(() => {})
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [router])

  const openRack = (rackId: string) => void navigate({ to: "/admin/racks/$rackId", params: { rackId } })

  const counts = React.useMemo(() => {
    const byRack = new Map<string, PhoneRecord[]>()
    for (const phone of page.phones) {
      if (phone.rackId) byRack.set(phone.rackId, [...(byRack.get(phone.rackId) ?? []), phone])
    }
    return new Map(page.racks.map((rack) => [rack.id, countsOf(byRack.get(rack.id) ?? [])]))
  }, [page.phones, page.racks])
  const loose = React.useMemo(() => page.phones.filter((phone) => !phone.rackId), [page.phones])
  const rackNames = new Map(page.racks.map((rack) => [rack.id, rack.name]))

  const typed = query.trim().toLowerCase()
  const shown = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    const count = (rack: RackView) => counts.get(rack.id) ?? { total: 0, online: 0, warnings: 0 }
    return page.racks
      .filter((rack) => !typed || rack.name.toLowerCase().includes(typed) || rack.descriptionText.toLowerCase().includes(typed))
      .sort((a, b) => {
        if (sort === "phones") return factor * (count(a).online - count(b).online)
        if (sort === "warnings") return factor * (count(a).warnings - count(b).warnings)
        if (sort === "state") return factor * (STATE_ORDER[a.state] - STATE_ORDER[b.state])
        return factor * a.name.localeCompare(b.name)
      })
  }, [counts, direction, page.racks, sort, typed])
  const phoneMatches = React.useMemo(
    () =>
      typed
        ? page.phones.filter((phone) =>
            [phone.name, phone.serial, phone.model, ...phone.accounts.map((account) => account.handle)].some((text) =>
              text.toLowerCase().includes(typed)
            )
          )
        : [],
    [page.phones, typed]
  )

  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize))
  const currentPage = Math.min(pageNumber, totalPages)
  const visible = shown.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const visibleIds = visible.map((rack) => rack.id)

  async function remove(targets: RackView[]) {
    setBusy(true)
    try {
      const { deleted, kept } = await removeRacks(targets.map((rack) => rack.id))
      if (deleted.length) toast.success(describeBulkResult({ done: deleted.length, kept: 0, one: "rack", many: "racks", verb: "deleted" }))
      if (kept.length) {
        showErrorToast(kept.map((one) => `${rackNames.get(one.id) ?? "A rack"}: ${one.reason}`).join(" "))
      }
      selection.setSelected(new Set(kept.map((one) => one.id)))
      setDeleteTargets([])
      await refresh()
    } catch (deleteError) {
      showErrorToast(getPhoneErrorMessage(deleteError))
    } finally {
      setBusy(false)
    }
  }

  async function pause() {
    setBusy(true)
    try {
      await pauseRack()
      toast.success("Every rack is paused. No phone job starts until you resume; running ones finish.")
      await refresh()
    } catch (pauseError) {
      showErrorToast(getPhoneErrorMessage(pauseError))
    } finally {
      setBusy(false)
    }
  }

  const colSpan = COLUMNS.length + 2

  return (
    <>
      <DashboardTable
        title="Racks"
        icon={<ServerIcon />}
        count={shown.length}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selection.selected.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => setDeleteTargets(page.racks.filter((rack) => selection.selected.has(rack.id)))}
              >
                <Trash2Icon className="size-4" />
                Delete ({selection.selected.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="rack-search"
              aria-label="Search racks and phones"
              placeholder="Search racks and phones…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPageNumber(1)
              }}
            />
            <span className="flex h-8 items-center gap-2">
              <Switch
                id="racks-paused"
                checked={Boolean(page.pausedAt)}
                disabled={busy}
                onCheckedChange={(checked) => (checked ? void pause() : setResuming(true))}
              />
              <Label htmlFor="racks-paused" className="text-sm font-normal whitespace-nowrap">
                {page.pausedAt ? "Every rack paused" : "Pause every rack"}
              </Label>
            </span>
            <Hint label="Self-test and app updates">
              <DashboardToolbarButton type="button" variant="outline" aria-label="Self-test and app updates" onClick={() => setSelfTestOpen(true)}>
                <FlaskConicalIcon className="size-4" />
                <span className="hidden sm:inline">Self-test</span>
              </DashboardToolbarButton>
            </Hint>
            <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
              <PlusIcon className="size-4" />
              New rack
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <SelectAllTableHead
                noun="racks"
                checked={selection.selectAllState(visibleIds)}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={shown.length === 0 && !phoneMatches.length && !(loose.length && !typed)}
        emptyText={
          page.racks.length
            ? "No racks or phones match that."
            : "No racks yet. Press New rack to make the first one, then install the rack program on the computer the phones plug into."
        }
        emptyColSpan={colSpan}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: shown.length,
          totalPages,
          onPageChange: (next) => setPageNumber(Math.max(1, Math.min(next, totalPages))),
          onPageSizeChange: (next) => {
            setPageNumber(1)
            setPageSize(next)
          },
        }}
      >
        {visible.map((rack) => {
          const count = counts.get(rack.id) ?? { total: 0, online: 0, warnings: 0 }
          return (
            <TableRow key={rack.id} className="group" rowAction={() => openRack(rack.id)}>
              <TableCell column="select">
                <Checkbox
                  checked={selection.selected.has(rack.id)}
                  onCheckedChange={() => selection.toggle(rack.id)}
                  aria-label={`Select ${rack.name}`}
                />
              </TableCell>
              <TableCell column="main" className="max-w-0">
                <button
                  type="button"
                  className="block min-w-0 truncate text-left text-sm font-medium group-hover:underline"
                  onClick={() => openRack(rack.id)}
                >
                  {rack.name}
                </button>
                <span className="block truncate text-xs text-muted-foreground">{rack.descriptionText || "No description yet"}</span>
                <span className="block text-xs text-muted-foreground md:hidden">{stateWords(rack)}</span>
              </TableCell>
              <TableCell column="meta" className="text-right tabular-nums">
                {count.total ? `${count.online} of ${count.total}` : "No phones"}
              </TableCell>
              <TableCell
                column="meta"
                className={cn(
                  "hidden text-right tabular-nums sm:table-cell",
                  count.warnings ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                )}
              >
                {count.warnings ? `${count.warnings} ${count.warnings === 1 ? "phone" : "phones"}` : "None"}
              </TableCell>
              <TableCell column="meta" className="hidden text-sm md:table-cell">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATE_DOT[rack.state]}`} />
                  {stateWords(rack)}
                </span>
                {rack.state !== "unpaired" && rack.version && !rack.upToDate ? (
                  <span className="block text-xs text-muted-foreground">Program {rack.version}, updating</span>
                ) : null}
              </TableCell>
              <TableCell column="actions">
                <Button type="button" variant="ghost" size="icon" onClick={() => openRack(rack.id)} aria-label={`Open ${rack.name}`}>
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTargets([rack])}
                  aria-label={`Delete ${rack.name}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          )
        })}
        {loose.length && !typed ? (
          <TableRow className="group" rowAction={() => setSearch({ loose: "1" })}>
            <TableCell column="select" />
            <TableCell column="main">
              <button
                type="button"
                className="block truncate text-left text-sm font-medium group-hover:underline"
                onClick={() => setSearch({ loose: "1" })}
              >
                Not on a rack
              </button>
              <span className="block truncate text-xs text-muted-foreground">Phones no rack has yet. Put each one on a rack.</span>
            </TableCell>
            <TableCell column="meta" className="text-right tabular-nums">
              {loose.length} {loose.length === 1 ? "phone" : "phones"}
            </TableCell>
            <TableCell column="meta" className="hidden sm:table-cell" />
            <TableCell column="meta" className="hidden md:table-cell" />
            <TableCell column="actions" />
          </TableRow>
        ) : null}
        {phoneMatches.length ? (
          <>
            <TableGroupRow label="Phones" colSpan={colSpan} />
            {phoneMatches.map((phone) => (
              <TableRow key={phone.id} className="group">
                <TableCell column="select" />
                <TableCell column="main" className="max-w-0">
                  <Link
                    to="/admin/phones"
                    search={{ open: phone.id }}
                    className="flex min-w-0 items-center gap-1.5 text-sm font-medium group-hover:underline"
                  >
                    <SmartphoneIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{phone.name}</span>
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[phone.rackId ? rackNames.get(phone.rackId) : "Not on a rack", phone.serial, ...phone.accounts.map(signedInWords)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </TableCell>
                <TableCell column="meta" className="text-sm" colSpan={3}>
                  <PhoneStatusText phone={phone} />
                </TableCell>
                <TableCell column="actions" />
              </TableRow>
            ))}
          </>
        ) : null}
      </DashboardTable>

      <NewRackDialog open={creating} onClose={() => setCreating(false)} onOpenRack={(rackId) => {
        setCreating(false)
        openRack(rackId)
      }} />

      <LoosePhonesDialog
        open={search.loose === "1"}
        phones={loose}
        racks={page.racks}
        onClose={() => setSearch({ loose: undefined })}
        onChanged={refresh}
      />

      <SelfTestDialog open={selfTestOpen} phones={page.phones} onClose={() => setSelfTestOpen(false)} onChanged={refresh} />

      <ResumeRackDialog
        open={resuming}
        onClose={() => setResuming(false)}
        onResumed={async () => {
          setResuming(false)
          await refresh()
        }}
      />

      <ConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(next) => {
          if (!next) setDeleteTargets([])
        }}
        title={deleteTargets.length === 1 ? `Delete ${deleteTargets[0].name}?` : `Delete ${deleteTargets.length} racks?`}
        description={
          deleteTargets.some(connected)
            ? "A rack that is connected is kept: disconnect it on its page first. A rack that is not connected goes, and its phones move to Not on a rack with their history kept."
            : "The rack goes. Its phones move to Not on a rack, and keep their history, readings and finished actions. Nothing on the phones changes."
        }
        confirmLabel={deleteTargets.length === 1 ? "Delete rack" : "Delete racks"}
        loading={busy}
        onConfirm={() => void remove(deleteTargets)}
      />
    </>
  )
}
