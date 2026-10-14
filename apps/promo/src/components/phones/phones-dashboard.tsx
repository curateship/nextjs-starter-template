import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  AlertTriangleIcon,
  FlaskConicalIcon,
  MonitorSmartphoneIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  ServerIcon,
  SettingsIcon,
  ShapesIcon,
  SmartphoneIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { FilterSelect } from "@/components/browser/sorting-filters"
import { ALL, LABEL_DOT, NONE } from "@/lib/browser/sorting"
import { rackMix } from "@/lib/phones/rack-mix"
import { PhoneDialog } from "@/components/phones/phone-dialog"
import { PhoneScreenDialog } from "@/components/phones/phone-screen-dialog"
import { PhoneStatusText } from "@/components/phones/phone-status"
import { RackDialog } from "@/components/phones/rack-dialog"
import { ResumeRackDialog } from "@/components/phones/resume-rack-dialog"
import { RackMixDialog } from "@/components/phones/rack-mix-dialog"
import { SelfTestDialog } from "@/components/phones/self-test-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Hint } from "@/components/social/hint"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  changePhones,
  disconnectPhoneRack,
  getPhoneErrorMessage,
  pauseRack,
  type BulkPhoneAction,
  type PhoneRecord,
  type PhonesPage,
  type RackView,
} from "@/lib/api/phones/phones"
import { signedInWords } from "@/lib/browser/wording"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatTimeAgo } from "@/lib/format/format-time"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { appVersionWords, connectionWords } from "@/lib/phones/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

type SortColumn = "name" | "account" | "status" | "carrier" | "lastSeen"

const COLUMNS: SortableColumn<SortColumn>[] = [
  { key: "name", label: "Phone", column: "main" },
  { key: "account", label: "Account", column: "meta", className: "hidden xl:table-cell" },
  { key: "status", label: "Status", column: "meta" },
  // Folded away on narrower windows, or the row is wider than its card and
  // its buttons go off the edge (measured 14 Oct 2026: 1148px of columns in
  // a 1082px card at 1280 wide, 837px in 826px at 1024). The account folds
  // into a line under the phone's name; the carrier is in its window.
  { key: "carrier", label: "Carrier", column: "meta", className: "hidden xl:table-cell" },
  { key: "lastSeen", label: "Last seen", column: "meta", className: "hidden 2xl:table-cell" },
]

const STATUS_ORDER = { connected: 0, busy: 1, held: 2, offline: 3 } as const

function compare(a: PhoneRecord, b: PhoneRecord, column: SortColumn): number {
  switch (column) {
    case "account":
      return (a.accounts[0]?.handle ?? "").localeCompare(b.accounts[0]?.handle ?? "")
    case "status":
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    case "carrier":
      return connectionWords(a).localeCompare(connectionWords(b))
    case "lastSeen":
      return (a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0) - (b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0)
    default:
      return a.name.localeCompare(b.name)
  }
}

/**
 * The rack checks in every 15 seconds and a phone counts as offline after 45,
 * so the list is read again every 10 seconds while the page is in view. A
 * phone plugged in or pulled out shows within a minute without a reload.
 */
const REFRESH_MS = 10_000

/**
 * Every phone on the rack: the account on it, its app versions, whether it is
 * connected, its carrier and when the rack last saw it. Self-test opens the
 * daily self-test and app updates.
 *
 * Built like the Browser profiles dashboard, and sorted with the same
 * folders, labels and tags. A phone's window keeps it in `?open=<id>`, which
 * is where its bell notice leads. The rack itself, pairing it and
 * disconnecting it, is behind the Rack button.
 */
export function PhonesDashboard({ initial, openId }: { initial: PhonesPage; openId?: string }) {
  const { config } = useShellRuntime()
  const router = useRouter()
  const navigate = useNavigate()
  const page = initial
  const phones = page.phones
  const mix = React.useMemo(
    () =>
      rackMix(
        phones.map((phone) => ({
          model: phone.model,
          androidVersion: phone.androidVersion,
          connection: phone.connection,
          // What the SIM itself says beats what was typed.
          carrier: phone.setupCheck?.figures.simCarrier || phone.simCarrier,
          proxyName: phone.proxy ? phone.proxy.label || phone.proxy.host : "",
        }))
      ),
    [phones]
  )

  const [search, setSearch] = React.useState("")
  const [folderFilter, setFolderFilter] = React.useState(ALL)
  const [labelFilter, setLabelFilter] = React.useState(ALL)
  const [tagFilter, setTagFilter] = React.useState(ALL)
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("name")
  const [pageNumber, setPageNumber] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const selection = useSelection()

  const [creating, setCreating] = React.useState(false)
  const [rackOpen, setRackOpen] = React.useState(false)
  const [deleteTargets, setDeleteTargets] = React.useState<PhoneRecord[]>([])
  const [disconnecting, setDisconnecting] = React.useState<RackView | null>(null)
  const [resuming, setResuming] = React.useState(false)
  const [selfTestOpen, setSelfTestOpen] = React.useState(false)
  const [mixOpen, setMixOpen] = React.useState(false)
  const [screenFor, setScreenFor] = React.useState<string | null>(null)
  const [tagging, setTagging] = React.useState(false)
  const [tagText, setTagText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const setOpen = React.useCallback(
    (id: string | undefined) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next = { ...previous }
          if (id) next.open = id
          else delete next.open
          return next
        },
      })
    },
    [navigate]
  )
  const editing = phones.find((phone) => phone.id === openId) ?? null

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

  const tags = React.useMemo(
    () => Array.from(new Set(phones.flatMap((phone) => phone.tags))).sort((a, b) => a.localeCompare(b)),
    [phones]
  )
  const folderName = (id: string | null) => page.folders.find((folder) => folder.id === id)?.name
  const label = (id: string | null) => page.labels.find((one) => one.id === id)

  const shown = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    const factor = direction === "asc" ? 1 : -1
    return phones
      .filter((phone) => {
        if (folderFilter === NONE ? phone.folderId : folderFilter !== ALL && phone.folderId !== folderFilter) return false
        if (labelFilter === NONE ? phone.labelId : labelFilter !== ALL && phone.labelId !== labelFilter) return false
        if (tagFilter !== ALL && !phone.tags.includes(tagFilter)) return false
        if (!query) return true
        return [phone.name, phone.model, phone.serial, phone.simCarrier, phone.simNumber, phone.notes, phone.shelfSlot]
          .concat(phone.tags, phone.accounts.map((account) => account.handle))
          .some((text) => text.toLowerCase().includes(query))
      })
      .sort((a, b) => factor * compare(a, b, sort))
  }, [direction, folderFilter, labelFilter, phones, search, sort, tagFilter])

  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize))
  const currentPage = Math.min(pageNumber, totalPages)
  const visible = shown.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const visibleIds = visible.map((phone) => phone.id)
  const selectedIds = Array.from(selection.selected)

  async function bulk(action: BulkPhoneAction, verb: string) {
    setBusy(true)
    try {
      const { done, skipped } = await changePhones(action)
      toast.success(describeBulkResult({ done: done.length, kept: skipped.length, one: "phone", many: "phones", verb }))
      if (action.action === "delete") {
        selection.setSelected(new Set(skipped))
        setDeleteTargets([])
      }
      await refresh()
      return true
    } catch (bulkError) {
      showErrorToast(getPhoneErrorMessage(bulkError))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!disconnecting) return
    setBusy(true)
    try {
      await disconnectPhoneRack(disconnecting.id)
      toast.success(`${disconnecting.name || "The rack"} is disconnected.`)
      setDisconnecting(null)
      await refresh()
    } catch (disconnectError) {
      showErrorToast(getPhoneErrorMessage(disconnectError))
    } finally {
      setBusy(false)
    }
  }

  async function pause() {
    setBusy(true)
    try {
      await pauseRack()
      toast.success("The rack is paused. No phone job starts until you resume it; running ones finish.")
      await refresh()
    } catch (pauseError) {
      showErrorToast(getPhoneErrorMessage(pauseError))
    } finally {
      setBusy(false)
    }
  }

  const liveRack = page.racks.find((rack) => rack.live)
  const rackWords = !page.racks.length ? "Connect a rack" : liveRack ? "Rack connected" : "Rack not checking in"
  const deletedAccounts = deleteTargets.flatMap((phone) => phone.accounts)

  return (
    <>
      <DashboardTable
        title="Phones"
        icon={<SmartphoneIcon />}
        count={shown.length}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selection.selected.size ? (
              <>
                <Select
                  value=""
                  onValueChange={(value) =>
                    void bulk({ action: "folder", ids: selectedIds, folderId: value === NONE ? null : value }, "moved")
                  }
                  disabled={busy}
                >
                  <DashboardToolbarSelectTrigger aria-label="Move the ticked phones to a folder">
                    <SelectValue placeholder="Move to folder" />
                  </DashboardToolbarSelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No folder</SelectItem>
                    {page.folders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value=""
                  onValueChange={(value) =>
                    void bulk({ action: "label", ids: selectedIds, labelId: value === NONE ? null : value }, "labelled")
                  }
                  disabled={busy}
                >
                  <DashboardToolbarSelectTrigger aria-label="Label the ticked phones">
                    <SelectValue placeholder="Set label" />
                  </DashboardToolbarSelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No label</SelectItem>
                    {page.labels.map((one) => (
                      <SelectItem key={one.id} value={one.id}>
                        {one.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DashboardToolbarButton type="button" variant="outline" disabled={busy} onClick={() => setTagging(true)}>
                  <TagIcon className="size-4" />
                  Add tag
                </DashboardToolbarButton>
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void bulk({ action: "hold", ids: selectedIds, held: true }, "held")}
                >
                  <PauseIcon className="size-4" />
                  Hold
                </DashboardToolbarButton>
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void bulk({ action: "hold", ids: selectedIds, held: false }, "released")}
                >
                  <PlayIcon className="size-4" />
                  Release
                </DashboardToolbarButton>
                <DashboardToolbarButton
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setDeleteTargets(phones.filter((phone) => selection.selected.has(phone.id)))}
                >
                  <Trash2Icon className="size-4" />
                  Delete ({selection.selected.size})
                </DashboardToolbarButton>
              </>
            ) : null}
            <DashboardToolbarSearch
              name="phone-search"
              aria-label="Search phones"
              placeholder="Search phones…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPageNumber(1)
              }}
            />
            <FilterSelect
              label="Folder"
              value={folderFilter}
              onChange={setFolderFilter}
              allLabel="All folders"
              noneLabel="No folder"
              options={page.folders}
            />
            <FilterSelect
              label="Label"
              value={labelFilter}
              onChange={setLabelFilter}
              allLabel="All labels"
              noneLabel="No label"
              options={page.labels}
            />
            {tags.length ? (
              <FilterSelect
                label="Tag"
                value={tagFilter}
                onChange={setTagFilter}
                allLabel="All tags"
                options={tags.map((tag) => ({ id: tag, name: tag }))}
              />
            ) : null}
            <span className="flex h-8 items-center gap-2">
              <Switch
                id="phones-rack-paused"
                checked={Boolean(page.pausedAt)}
                disabled={busy}
                onCheckedChange={(checked) => (checked ? void pause() : setResuming(true))}
              />
              <Label htmlFor="phones-rack-paused" className="text-sm font-normal whitespace-nowrap">
                {page.pausedAt ? "Rack paused" : "Pause the rack"}
              </Label>
            </span>
            <Hint label={mix.warnings.length ? mix.warnings[0].text : "Rack mix: models, carriers and Android versions"}>
              <DashboardToolbarButton
                type="button"
                variant="outline"
                aria-label={mix.warnings.length ? `Rack mix: ${mix.warnings.length} ${mix.warnings.length === 1 ? "warning" : "warnings"}` : "Rack mix"}
                onClick={() => setMixOpen(true)}
              >
                {mix.warnings.length ? (
                  <AlertTriangleIcon className="size-4 text-amber-600 dark:text-amber-400" />
                ) : (
                  <ShapesIcon className="size-4" />
                )}
                <span className="hidden sm:inline">Mix</span>
              </DashboardToolbarButton>
            </Hint>
            <Hint label="Self-test and app updates">
              <DashboardToolbarButton
                type="button"
                variant="outline"
                aria-label="Self-test and app updates"
                onClick={() => setSelfTestOpen(true)}
              >
                <FlaskConicalIcon className="size-4" />
                <span className="hidden sm:inline">Self-test</span>
              </DashboardToolbarButton>
            </Hint>
            <Hint label={rackWords}>
              <DashboardToolbarButton type="button" variant="outline" aria-label={rackWords} onClick={() => setRackOpen(true)}>
                <span
                  aria-hidden
                  className={`size-2 rounded-full ${liveRack ? "bg-emerald-500" : page.racks.length ? "bg-destructive" : "bg-muted-foreground/50"}`}
                />
                <ServerIcon className="size-4" />
                {/* Words from the small breakpoint up; a phone gets the icon so
                    the search box keeps its room. */}
                <span className="hidden sm:inline">Rack</span>
              </DashboardToolbarButton>
            </Hint>
            <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
              <PlusIcon className="size-4" />
              New phone
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
                noun="phones"
                checked={selection.selectAllState(visibleIds)}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={shown.length === 0}
        emptyText={
          phones.length
            ? "No phones match that."
            : page.racks.length
              ? "No phones yet. Plug one into the rack with USB debugging on, or press New phone to add one by hand."
              : "No phones yet. Press Rack to connect the computer the phones plug into, or New phone to add one by hand."
        }
        emptyColSpan={COLUMNS.length + 2}
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
        {visible.map((phone) => {
          const phoneLabel = label(phone.labelId)
          const folder = folderName(phone.folderId)
          return (
            <TableRow key={phone.id} className="group" rowAction={() => setOpen(phone.id)}>
              <TableCell column="select">
                <Checkbox
                  checked={selection.selected.has(phone.id)}
                  onCheckedChange={() => selection.toggle(phone.id)}
                  aria-label={`Select ${phone.name}`}
                />
              </TableCell>
              <TableCell column="main">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    className="truncate text-left text-sm font-medium group-hover:underline"
                    onClick={() => setOpen(phone.id)}
                  >
                    {phone.name}
                  </button>
                  {phoneLabel ? (
                    <Badge variant="outline" className="gap-1.5">
                      <span className={`size-1.5 rounded-full ${LABEL_DOT[phoneLabel.color] ?? LABEL_DOT.slate}`} />
                      {phoneLabel.name}
                    </Badge>
                  ) : null}
                </div>
                <span className="line-clamp-1 text-xs text-muted-foreground">
                  {[
                    phone.model,
                    phone.androidVersion ? `Android ${phone.androidVersion}` : "",
                    folder,
                    ...phone.tags.map((tag) => `#${tag}`),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No model read yet"}
                </span>
                <span className="line-clamp-1 text-xs text-muted-foreground xl:hidden">
                  {phone.accounts.length ? phone.accounts.map(signedInWords).join(", ") : "No account on it"}
                </span>
                <span className="line-clamp-1 text-xs text-muted-foreground">
                  {phone.id === page.testPhoneId ? "Self-test phone · " : ""}
                  {appVersionWords(phone)}
                </span>
                {setupWarning(phone) ? (
                  <span className="line-clamp-1 text-xs text-amber-600 dark:text-amber-400">{setupWarning(phone)}</span>
                ) : null}
              </TableCell>
              <TableCell column="meta" className="hidden text-sm xl:table-cell">
                {phone.accounts.length ? (
                  <span className="grid">
                    {phone.accounts.map((account) => (
                      <span key={account.id}>{signedInWords(account)}</span>
                    ))}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Nobody</span>
                )}
              </TableCell>
              <TableCell column="meta" className="text-sm">
                <PhoneStatusText phone={phone} />
              </TableCell>
              <TableCell column="meta" className="hidden max-w-48 text-sm xl:table-cell">
                <span className="line-clamp-2">{connectionWords(phone)}</span>
              </TableCell>
              <TableCell column="meta" className="hidden text-sm text-muted-foreground 2xl:table-cell">
                {phone.lastSeenAt ? formatTimeAgo(phone.lastSeenAt) : "Never"}
              </TableCell>
              <TableCell column="actions">
                <Hint label={phone.held ? "Release: back in use" : "Hold: take it out of use"}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    onClick={() =>
                      void bulk({ action: "hold", ids: [phone.id], held: !phone.held }, phone.held ? "released" : "held")
                    }
                    aria-label={phone.held ? `Release ${phone.name}` : `Hold ${phone.name}`}
                  >
                    {phone.held ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
                  </Button>
                </Hint>
                <Hint label="Show the screen">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setScreenFor(phone.id)}
                    aria-label={`Show the screen of ${phone.name}`}
                  >
                    <MonitorSmartphoneIcon className="size-4" />
                  </Button>
                </Hint>
                <Hint label="Phone settings">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setOpen(phone.id)}
                    aria-label={`Edit ${phone.name}`}
                  >
                    <SettingsIcon className="size-4" />
                  </Button>
                </Hint>
                <Hint label="Delete phone">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTargets([phone])}
                    aria-label={`Delete ${phone.name}`}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </Hint>
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>

      <PhoneDialog
        key={editing?.id ?? (creating ? "new-phone" : "closed")}
        open={creating || Boolean(editing)}
        phone={editing}
        page={page}
        onDelete={(phone) => {
          // One window at a time: the phone's window gives way to the question.
          setOpen(undefined)
          setDeleteTargets([phone])
        }}
        onClose={() => {
          setCreating(false)
          setOpen(undefined)
        }}
        onSaved={async () => {
          await refresh()
          setCreating(false)
          setOpen(undefined)
        }}
        onChanged={refresh}
      />

      <RackDialog
        open={rackOpen}
        page={page}
        onClose={() => setRackOpen(false)}
        onDisconnect={(rack) => {
          setRackOpen(false)
          setDisconnecting(rack)
        }}
      />

      <PhoneScreenDialog
        phone={phones.find((phone) => phone.id === screenFor) ?? null}
        onClose={() => setScreenFor(null)}
        onChanged={refresh}
      />

      <RackMixDialog open={mixOpen} mix={mix} onClose={() => setMixOpen(false)} />
      <SelfTestDialog
        open={selfTestOpen}
        phones={phones}
        onClose={() => setSelfTestOpen(false)}
        onChanged={refresh}
      />

      <ResumeRackDialog
        open={resuming}
        onClose={() => setResuming(false)}
        onResumed={async () => {
          setResuming(false)
          await refresh()
        }}
      />

      <ConfirmDialog
        open={disconnecting !== null}
        onOpenChange={(next) => {
          if (!next) setDisconnecting(null)
        }}
        title="Disconnect this rack?"
        description="Its key stops working at once. Its phones go offline, waiting checks are cancelled, and nothing reaches the phones until it is installed again with a new code. The phone records and the accounts on them stay."
        confirmLabel="Disconnect rack"
        loading={busy}
        onConfirm={() => void disconnect()}
      />

      <ConfirmDialog
        open={tagging}
        onOpenChange={(next) => {
          if (!next) {
            setTagging(false)
            setTagText("")
          }
        }}
        title={`Add a tag to ${selection.selected.size} ${selection.selected.size === 1 ? "phone" : "phones"}?`}
        description="A phone that already has the tag, or already has twenty, is left as it is."
        confirmLabel="Add tag"
        destructive={false}
        loading={busy}
        disabled={!tagText.trim()}
        onConfirm={async () => {
          if (await bulk({ action: "tag", ids: selectedIds, tag: tagText }, "tagged")) {
            setTagging(false)
            setTagText("")
          }
        }}
      >
        <div className="grid gap-2 pt-4">
          <Label htmlFor="bulk-phone-tag">Tag</Label>
          <Input id="bulk-phone-tag" value={tagText} onChange={(event) => setTagText(event.target.value)} />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(next) => {
          if (!next) setDeleteTargets([])
        }}
        title={deleteTargets.length === 1 ? "Delete this phone?" : `Delete ${deleteTargets.length} phones?`}
        description={[
          "Only the record goes. Nothing on the phone changes, and if it is still plugged in the rack adds it back as a new phone on its next check-in.",
          deletedAccounts.length
            ? `${deletedAccounts.map(signedInWords).join(", ")} will run on nothing until you pick a browser profile or phone for ${deletedAccounts.length === 1 ? "it" : "them"} on the Reddit accounts dashboard.`
            : "No account runs on it.",
        ].join(" ")}
        confirmLabel={deleteTargets.length === 1 ? "Delete phone" : "Delete phones"}
        loading={busy}
        onConfirm={() => void bulk({ action: "delete", ids: deleteTargets.map((phone) => phone.id) }, "deleted")}
      />
    </>
  )
}

/**
 * The one thing about a phone's setup worth a line on its row, most urgent
 * first: the wrong address showing, a wipe owed, a wiped phone not set up
 * again, or a setup check with lines that do not pass. Its Setup tab has the rest.
 */
function setupWarning(phone: PhoneRecord): string {
  if (phone.addressStop) return "Stopped: the wrong address showed"
  if (phone.needsWipeAt) return "Needs wiping before another account"
  const check = phone.setupCheck
  if (phone.wipedAt && !(check?.passed && new Date(check.checkedAt) > new Date(phone.wipedAt))) {
    return "Wiped: set it up again and run its setup check"
  }
  if (check && !check.passed) {
    const failing = check.lines.filter((line) => line.verdict === "fails").length
    return failing ? `Setup check: ${failing} of ${check.lines.length} lines fail` : ""
  }
  return ""
}
