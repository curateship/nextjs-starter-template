import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  ActivityIcon,
  GlobeIcon,
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import { ProxyDialog } from "@/components/browser/proxy-dialog"
import { ProxyImportDialog } from "@/components/browser/proxy-import-dialog"
import { ProxyTestBadge } from "@/components/browser/proxy-test-badge"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  getProxyErrorMessage,
  removeProxies,
  runProxyTest,
  type ProxyView,
} from "@/lib/api/browser/proxies"
import { PROXY_KIND_LABELS, addressWords, namesList } from "@/lib/browser/wording"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { showErrorToast } from "@/lib/toast/error-toast"

type SortColumn = "name" | "endpoint" | "test" | "usedBy" | "address"

const COLUMNS: SortableColumn<SortColumn>[] = [
  { key: "name", label: "Proxy", column: "main" },
  { key: "endpoint", label: "Endpoint", column: "meta" },
  { key: "test", label: "Test", column: "meta" },
  { key: "usedBy", label: "Used by", column: "meta" },
  { key: "address", label: "Outside address", column: "meta" },
]

function compare(a: ProxyView, b: ProxyView, column: SortColumn): number {
  switch (column) {
    case "endpoint":
      return `${a.host}:${a.port}`.localeCompare(`${b.host}:${b.port}`)
    case "test":
      return testRank(a) - testRank(b)
    case "usedBy":
      return a.usedBy.length - b.usedBy.length
    case "address":
      return a.addresses.changesToday - b.addresses.changesToday
    default:
      return (a.label || a.host).localeCompare(b.label || b.host)
  }
}

/** Failed first when sorted, then untested, then working. */
function testRank(proxy: ProxyView): number {
  if (!proxy.lastTestResult) return 1
  return proxy.lastTestResult.ok ? 2 : 0
}

/**
 * Every proxy the browser profiles can go out through.
 *
 * Copied in behaviour from anti-detect's proxies dashboard and built from the
 * shell's own table and windows. Two things anti-detect lacks: the profiles
 * that use each proxy, and a record of each proxy's outside address. A proxy
 * opens as a window over the list, and `?open=<id>` opens one from a link,
 * which is where a dead-proxy notice in the bell leads.
 */
export function ProxiesDashboard({
  initial,
  openId,
}: {
  initial: ProxyView[]
  openId?: string
}) {
  const { config } = useShellRuntime()
  const router = useRouter()
  const navigate = useNavigate()
  const proxies = initial

  const [search, setSearch] = React.useState("")
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("name")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const selection = useSelection()

  const [creating, setCreating] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [deleteTargets, setDeleteTargets] = React.useState<ProxyView[]>([])
  const [deleting, setDeleting] = React.useState(false)
  const [testingIds, setTestingIds] = React.useState<Set<string>>(new Set())
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
  const editing = proxies.find((proxy) => proxy.id === openId) ?? null

  const refresh = React.useCallback(async () => {
    try {
      await router.invalidate()
      setError(null)
    } catch (loadError) {
      setError(getProxyErrorMessage(loadError))
    }
  }, [router])

  const shown = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    const factor = direction === "asc" ? 1 : -1
    return proxies
      .filter(
        (proxy) =>
          !query ||
          proxy.label.toLowerCase().includes(query) ||
          proxy.host.toLowerCase().includes(query) ||
          proxy.usedBy.some((user) => user.name.toLowerCase().includes(query))
      )
      .sort((a, b) => factor * compare(a, b, sort))
  }, [direction, proxies, search, sort])

  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visible = shown.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const visibleIds = visible.map((proxy) => proxy.id)

  async function test(proxy: ProxyView) {
    setTestingIds((current) => new Set(current).add(proxy.id))
    try {
      const result = await runProxyTest(proxy.id)
      if (result.ok) toast.success(`${proxy.label || proxy.host} works.`)
      else showErrorToast(`${proxy.label || proxy.host} failed: ${result.error ?? "no answer"}.`)
      await refresh()
    } catch (testError) {
      showErrorToast(getProxyErrorMessage(testError))
    } finally {
      setTestingIds((current) => {
        const next = new Set(current)
        next.delete(proxy.id)
        return next
      })
    }
  }

  async function remove(targets: ProxyView[]) {
    setDeleting(true)
    try {
      const { deleted } = await removeProxies(targets.map((proxy) => proxy.id))
      toast.success(
        describeBulkResult({
          done: deleted.length,
          kept: targets.length - deleted.length,
          one: "proxy",
          many: "proxies",
          verb: "deleted",
        })
      )
      selection.clear()
      setDeleteTargets([])
      if (editing && deleted.includes(editing.id)) setOpen(undefined)
      await refresh()
    } catch (deleteError) {
      showErrorToast(getProxyErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  const selected = proxies.filter((proxy) => selection.selected.has(proxy.id))
  const losing = Array.from(
    new Set(deleteTargets.flatMap((proxy) => proxy.usedBy.map((user) => user.name)))
  )

  return (
    <>
      <DashboardTable
        title="Proxies"
        icon={<GlobeIcon />}
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
                onClick={() => setDeleteTargets(selected)}
              >
                <Trash2Icon className="size-4" />
                Delete ({selection.selected.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="proxy-search"
              aria-label="Search proxies"
              placeholder="Search proxies…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
            <DashboardToolbarButton type="button" variant="outline" onClick={() => setImporting(true)}>
              <UploadIcon className="size-4" />
              Paste in
            </DashboardToolbarButton>
            <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
              <PlusIcon className="size-4" />
              Add proxy
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
                noun="proxies"
                checked={selection.selectAllState(visibleIds)}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={shown.length === 0}
        emptyText={
          proxies.length
            ? "No proxies match that."
            : "No proxies yet. Add one, or paste in a list, so browser profiles can go out through it."
        }
        emptyColSpan={COLUMNS.length + 2}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: shown.length,
          totalPages,
          onPageChange: (next) => setPage(Math.max(1, Math.min(next, totalPages))),
          onPageSizeChange: (next) => {
            setPage(1)
            setPageSize(next)
          },
        }}
      >
        {visible.map((proxy) => {
          const name = proxy.label || proxy.host
          const testing = testingIds.has(proxy.id)
          return (
            <TableRow key={proxy.id} className="group" rowAction={() => setOpen(proxy.id)}>
              <TableCell column="select">
                <Checkbox
                  checked={selection.selected.has(proxy.id)}
                  onCheckedChange={() => selection.toggle(proxy.id)}
                  aria-label={`Select ${name}`}
                />
              </TableCell>
              <TableCell column="main">
                <button
                  type="button"
                  className="block max-w-full truncate text-left text-sm font-medium group-hover:underline"
                  onClick={() => setOpen(proxy.id)}
                >
                  {name}
                </button>
                <span className="text-xs text-muted-foreground">
                  {PROXY_KIND_LABELS[proxy.kind]} · {proxy.protocol}
                  {proxy.country ? ` · ${proxy.country}` : ""}
                </span>
              </TableCell>
              <TableCell column="meta">
                <span className="font-mono text-xs text-muted-foreground">
                  {proxy.host}:{proxy.port}
                </span>
              </TableCell>
              <TableCell column="meta">
                {testing ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2Icon className="size-3.5 animate-spin" />
                    Testing
                  </span>
                ) : (
                  <ProxyTestBadge result={proxy.lastTestResult} />
                )}
              </TableCell>
              <TableCell column="meta" className="text-sm">
                {proxy.usedBy.length ? (
                  namesList(proxy.usedBy.map((user) => user.name), 2)
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </TableCell>
              <TableCell column="meta" className="text-xs text-muted-foreground">
                {addressWords(proxy.addresses)}
              </TableCell>
              <TableCell column="actions">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={testing}
                  onClick={() => void test(proxy)}
                  title="Test it"
                  aria-label={`Test ${name}`}
                >
                  {testing ? <Loader2Icon className="size-4 animate-spin" /> : <ActivityIcon className="size-4" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpen(proxy.id)}
                  title="Proxy settings"
                  aria-label={`Edit ${name}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTargets([proxy])}
                  title="Delete proxy"
                  aria-label={`Delete ${name}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>

      <ProxyDialog
        key={editing?.id ?? (creating ? "new-proxy" : "closed")}
        open={creating || Boolean(editing)}
        proxy={editing}
        testing={editing ? testingIds.has(editing.id) : false}
        onTest={(proxy) => void test(proxy)}
        onDelete={(proxy) => {
          // One window at a time: the edit window gives way to the question.
          setOpen(undefined)
          setDeleteTargets([proxy])
        }}
        onClose={() => {
          setCreating(false)
          setOpen(undefined)
        }}
        onSaved={async () => {
          // The list first, then the window, so the row is already right when
          // the window goes.
          await refresh()
          setCreating(false)
          setOpen(undefined)
        }}
      />

      <ProxyImportDialog
        key={importing ? "import-open" : "import-closed"}
        open={importing}
        onClose={() => setImporting(false)}
        onImported={refresh}
      />

      <ConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(next) => {
          if (!next) setDeleteTargets([])
        }}
        title={deleteTargets.length === 1 ? "Delete this proxy?" : `Delete ${deleteTargets.length} proxies?`}
        description={
          losing.length
            ? `${namesList(losing)} ${losing.length === 1 ? "uses" : "use"} ${deleteTargets.length === 1 ? "it" : "them"}, and will go out from this computer's own address until given another proxy. An open browser keeps the old proxy until it is closed.`
            : "No browser profile uses them, so nothing else changes."
        }
        confirmLabel={deleteTargets.length === 1 ? "Delete proxy" : "Delete proxies"}
        loading={deleting}
        onConfirm={() => void remove(deleteTargets)}
      />
    </>
  )
}
