import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ActivityIcon, GlobeIcon, Loader2Icon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react"

import { ProxyRecord } from "@/components/anti-detect/proxy-record"
import { ProxyDialog } from "@/components/browser/proxy-dialog"
import { ProxyImportDialog } from "@/components/browser/proxy-import-dialog"
import { ProxyTestBadge } from "@/components/browser/proxy-test-badge"
import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord } from "@/components/crm/record-frame"
import { FilterPick } from "@/components/dashboard-page/filter-pick"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { TableCell } from "@/components/ui/table"
import type { ProjectReach } from "@/lib/anti-detect/project-reach"
import { proxyTestOf } from "@/lib/anti-detect/rows"
import type { AntiDetectSearch, ProxyTest } from "@/lib/anti-detect/search"
import { getProxyErrorMessage, loadProxies, removeProxies, runProxyTest, type ProxyView } from "@/lib/api/browser/proxies"
import { appName } from "@/lib/bans/options"
import { addressWords, namesList, PROXY_KIND_LABELS, renewalText } from "@/lib/browser/wording"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { PROXY_KINDS } from "@/lib/social/options"
import { showErrorToast } from "@/lib/toast/error-toast"

type Column = "name" | "endpoint" | "test" | "usedBy" | "address" | "cost"


/** Failed first when sorted, then untested, then working. */
const TEST_RANK: Record<ProxyTest, number> = { failed: 0, untested: 1, working: 2 }

function compare(a: ProxyView, b: ProxyView, column: Column): number {
  switch (column) {
    case "endpoint":
      return `${a.host}:${a.port}`.localeCompare(`${b.host}:${b.port}`)
    case "test":
      return TEST_RANK[proxyTestOf(a)] - TEST_RANK[proxyTestOf(b)]
    case "usedBy":
      return a.usedBy.length - b.usedBy.length
    case "address":
      return a.addresses.changesToday - b.addresses.changesToday
    // Soonest renewal first when sorting up, then by cost; unset last.
    case "cost":
      return (
        (a.renewsOn ?? "9999").localeCompare(b.renewsOn ?? "9999") ||
        (a.monthlyCost ?? Number.POSITIVE_INFINITY) - (b.monthlyCost ?? Number.POSITIVE_INFINITY)
      )
    default:
      return (a.label || a.host).localeCompare(b.label || b.host)
  }
}

const TEST_WORDS: Record<ProxyTest, string> = { working: "Working", failed: "Failed", untested: "Not tested yet" }

/**
 * The Anti Detect dashboard's Proxies (Tyler, 12 Nov 2026), where the
 * Proxies screen used to be: every proxy the browser profiles can go out
 * through, with its last test, the profiles using it, its outside address
 * and what it costs, in the dashboard's one header and table shape.
 *
 * - **Header:** search, Select, Filter (Test, Kind), New proxy; its ⋮ holds
 *   Paste in a list. Ticked rows are tested or deleted.
 * - **A row** opens the proxy on the right (`ProxyRecord`), where a dead-proxy
 *   notice in the bell leads. Its actions column tests it and has the bin.
 */
export function ProxiesSection({
  initial,
  search,
  reach,
  frame,
}: {
  initial: ProxyView[]
  search: AntiDetectSearch
  /** The project picked in the Projects block: only the proxies its profiles and phones go out through. */
  reach: ProjectReach | null
  frame: CrmFrame
}) {
  const router = useRouter()
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  // Its own copy, read again after a change; a new read of the route replaces it.
  const [proxies, setProxies] = useSyncedDraft(initial)
  const [error, setError] = React.useState<string | null>(null)
  const q = search.q ?? ""

  const [sort, setSort] = React.useState<Column>("name")
  const [direction, setDirection] = React.useState<"asc" | "desc">("asc")
  const toggleSort = (column: Column) => {
    if (column === sort) setDirection(direction === "asc" ? "desc" : "asc")
    else {
      setSort(column)
      setDirection("asc")
    }
  }
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [creating, setCreating] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [deleteTargets, setDeleteTargets] = React.useState<ProxyView[]>([])
  const [deleting, setDeleting] = React.useState(false)
  const [testingIds, setTestingIds] = React.useState<ReadonlySet<string>>(new Set())

  const refresh = React.useCallback(async () => {
    try {
      setProxies(await loadProxies())
      setError(null)
      // The left page's counts and Overview read the route's copy.
      void router.invalidate()
    } catch (failure) {
      setError(getProxyErrorMessage(failure))
    }
  }, [router, setProxies])

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    const sign = direction === "asc" ? 1 : -1
    return proxies
      .filter((proxy) => !reach || reach.proxies.has(proxy.id))
      .filter((proxy) => !search.test || proxyTestOf(proxy) === search.test)
      .filter((proxy) => !search.proxyKind || proxy.kind === search.proxyKind)
      .filter(
        (proxy) =>
          !needle ||
          proxy.label.toLowerCase().includes(needle) ||
          proxy.host.toLowerCase().includes(needle) ||
          proxy.usedBy.some((user) => user.name.toLowerCase().includes(needle))
      )
      .sort((a, b) => sign * compare(a, b, sort) || (a.label || a.host).localeCompare(b.label || b.host))
  }, [direction, proxies, q, reach, search.proxyKind, search.test, sort])
  const ids = rows.map((proxy) => proxy.id)
  const openId = search.open
  const openProxy = proxies.find((proxy) => proxy.id === openId) ?? null

  // The right panel is never left empty: a filter that leaves the open proxy
  // out of the list opens the list's first row instead.
  const firstId = rows[0]?.id
  const openInList = Boolean(openId && rows.some((proxy) => proxy.id === openId))
  React.useEffect(() => {
    if (firstId && !openInList) setListSearch({ open: firstId })
  }, [firstId, openInList, setListSearch])
  const [pressedId, setPressedId] = React.useState<string>()
  const pick = (id: string) => {
    setPressedId(id)
    setOpen(id)
  }

  const listKey = `${q}|${search.test}|${search.proxyKind}|${reach ? [...reach.proxies].join(",") : ""}`
  useClearSelectionOnListChange(selection.setSelected, listKey)
  const selected = proxies.filter((proxy) => selection.selected.has(proxy.id))
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }

  async function test(proxy: ProxyView) {
    setTestingIds((current) => new Set(current).add(proxy.id))
    try {
      const result = await runProxyTest(proxy.id)
      if (!result.ok) showErrorToast(`${proxy.label || proxy.host} failed: ${result.error ?? "no answer"}.`)
      await refresh()
    } catch (failure) {
      showErrorToast(getProxyErrorMessage(failure))
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
      await removeProxies(targets.map((proxy) => proxy.id))
      selection.clear()
      setDeleteTargets([])
      await refresh()
    } catch (failure) {
      showErrorToast(getProxyErrorMessage(failure))
    } finally {
      setDeleting(false)
    }
  }

  /** What a proxy can do, for its right-click menu and its ⋮ on the right. */
  const actionsFor = (proxy: ProxyView): RowMenuItem[] => [
    { label: "Test it", icon: <ActivityIcon className="size-4" />, onSelect: () => void test(proxy) },
    { label: "Delete", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setDeleteTargets([proxy]) },
  ]

  const losing = Array.from(new Set(deleteTargets.flatMap((proxy) => proxy.usedBy.map((user) => user.name))))
  const filterCount = [search.test, search.proxyKind].filter(Boolean).length

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={GlobeIcon} label="Proxies" />}
        end={<PanelReopenButton side="right" label="Show the proxy" />}
        selected={
          massSelect && selected.length ? (
            <SelectedMenu
              count={selected.length}
              busy={deleting}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <>
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      for (const proxy of selected) void test(proxy)
                    }}
                  >
                    <ActivityIcon className="size-4 text-muted-foreground" />
                    Test them
                  </SelectedMenuRow>
                  <SelectedMenuRow
                    className="text-destructive"
                    onClick={() => {
                      menu.close()
                      setDeleteTargets(selected)
                    }}
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </SelectedMenuRow>
                </>
              )}
            />
          ) : null
        }
        menuLabel="More for proxies"
        menuItems={[{ label: "Paste in a list", icon: <UploadIcon className="size-4" />, onClick: () => setImporting(true) }]}
        search={{
          name: "proxy-search",
          label: "Search proxies by name, host or the profiles using them",
          placeholder: "Search proxies",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <FilterPopover
            count={filterCount}
            onClear={() => setListSearch({ test: undefined, proxyKind: undefined })}
            save={null}
            contentClassName="w-60"
          >
            <FilterPick
              id="proxies-test"
              label="Last test"
              value={search.test}
              any="Any result"
              options={(Object.keys(TEST_WORDS) as ProxyTest[]).map((test) => [test, TEST_WORDS[test]])}
              onChange={(test) => setListSearch({ test })}
            />
            <FilterPick
              id="proxies-kind"
              label="Kind"
              value={search.proxyKind}
              any="Every kind"
              options={PROXY_KINDS.map((kind) => [kind, PROXY_KIND_LABELS[kind]])}
              onChange={(proxyKind) => setListSearch({ proxyKind })}
            />
          </FilterPopover>
        }
        primary={
          <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
            <PlusIcon className="size-4" />
            <span className="@max-3xl:sr-only">New proxy</span>
          </DashboardToolbarButton>
        }
      />
      {error ? (
        <div className="px-6 py-3">
          <ErrorRow message={error} onRetry={() => void refresh()} />
        </div>
      ) : null}
      <CrmTable<Column>
        columns={[
          { key: "name", label: "Proxy", column: "main", className: "min-w-40" },
          { key: "endpoint", label: "Endpoint", column: "meta", className: "hidden md:hidden @4xl:table-cell" },
          { key: "test", label: "Test", column: "meta", className: "hidden md:hidden @lg:table-cell" },
          { key: "usedBy", label: "Used by", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
          { key: "address", label: "Outside address", column: "meta", className: "hidden md:hidden @5xl:table-cell" },
          { key: "cost", label: "Cost", column: "preview", className: "hidden md:hidden @3xl:table-cell" },
        ]}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        actions
        select={
          massSelect
            ? {
                noun: "proxies",
                disabled: ids.length === 0,
                checked: selection.selectAllState(ids),
                onToggle: () => selection.toggleVisible(ids),
              }
            : null
        }
        empty={
          rows.length > 0
            ? null
            : proxies.length
              ? "No proxies match that."
              : "No proxies yet. Add one with New proxy, or paste in a list from the ⋮, so browser profiles can go out through it."
        }
      >
        {rows.map((proxy) => {
          const name = proxy.label || proxy.host
          const testing = testingIds.has(proxy.id)
          const bannedOn = Object.keys(proxy.bannedOn)
          return (
            <CrmTableRow
              key={proxy.id}
              open={proxy.id === openId}
              label={name}
              tick={{ shown: massSelect, ticked: selection.selected.has(proxy.id), onToggle: () => selection.toggle(proxy.id) }}
              onOpen={() => pick(proxy.id)}
              cog={{
                label: `Test ${name}`,
                icon: testing ? <Loader2Icon className="size-4 animate-spin" /> : <ActivityIcon className="size-4" />,
                onPress: () => void test(proxy),
              }}
              onDelete={() => setDeleteTargets([proxy])}
              onRightClick={(x, y) => setRightClick({ id: proxy.id, x, y })}
            >
              <MainCell name={name}>
                <Chip muted className="hidden shrink-0 whitespace-nowrap @xl:inline-flex">
                  {PROXY_KIND_LABELS[proxy.kind]}
                </Chip>
                {bannedOn.length ? (
                  <Chip className="shrink-0 whitespace-nowrap text-destructive">
                    Banned on {bannedOn.map(appName).sort().join(", ")}
                  </Chip>
                ) : null}
              </MainCell>
              <TableCell column="meta" className="hidden md:hidden @4xl:table-cell">
                <span className="font-mono text-xs text-muted-foreground">
                  {proxy.host}:{proxy.port}
                </span>
              </TableCell>
              <TableCell column="meta" className="hidden md:hidden @lg:table-cell">
                {testing ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2Icon className="size-3.5 animate-spin" />
                    Testing
                  </span>
                ) : (
                  <ProxyTestBadge result={proxy.lastTestResult} compact />
                )}
              </TableCell>
              <TableCell column="meta" className="hidden max-w-48 text-sm md:hidden @2xl:table-cell">
                <span className="block truncate">
                  {proxy.usedBy.length ? namesList(proxy.usedBy.map((user) => user.name), 2) : <span className="text-muted-foreground">None</span>}
                </span>
              </TableCell>
              <TableCell column="meta" className="hidden max-w-56 text-xs text-muted-foreground md:hidden @5xl:table-cell">
                <span className="block truncate">{addressWords(proxy.addresses)}</span>
              </TableCell>
              <TableCell column="preview" className="hidden md:hidden @3xl:table-cell">
                <span className="block whitespace-nowrap">
                  {proxy.monthlyCost === null ? <span className="text-muted-foreground">No cost set</span> : `$${proxy.monthlyCost.toFixed(2)} a month`}
                </span>
                {proxy.renewsOn ? <span className="block text-xs whitespace-nowrap text-muted-foreground">{renewalText(proxy.renewsOn)}</span> : null}
              </TableCell>
            </CrmTableRow>
          )
        })}
      </CrmTable>
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={(() => {
            const proxy = proxies.find((each) => each.id === rightClick.id)
            return proxy ? actionsFor(proxy) : []
          })()}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: listKey,
    showRightFor: pressedId && pressedId === search.open ? pressedId : undefined,
    middle,
    right: {
      label: "Proxy",
      showLabel: "Show the proxy",
      content: openProxy ? (
        <ProxyRecord
          key={openProxy.id}
          proxy={openProxy}
          testing={testingIds.has(openProxy.id)}
          actions={actionsFor(openProxy)}
          onTest={() => void test(openProxy)}
          onChanged={refresh}
        />
      ) : (
        <EmptyRecord
          title="Proxy"
          icon={<GlobeIcon aria-hidden />}
          line={proxies.length ? "Click a proxy to see it here." : "Add a proxy with New proxy to see it here."}
          hideLabel="Hide the proxy"
        />
      ),
    },
    windows: (
      <>
        <ProxyDialog
          key={creating ? "new-proxy" : "closed"}
          open={creating}
          onClose={() => setCreating(false)}
          onSaved={async (id) => {
            setCreating(false)
            await refresh()
            pick(id)
          }}
        />
        <ProxyImportDialog key={importing ? "import-open" : "import-closed"} open={importing} onClose={() => setImporting(false)} onImported={refresh} />
        <ConfirmDialog
          open={deleteTargets.length > 0}
          onOpenChange={(next) => {
            if (!next) setDeleteTargets([])
          }}
          title={deleteTargets.length === 1 ? `Delete ${deleteTargets[0].label || deleteTargets[0].host}?` : `Delete ${deleteTargets.length} proxies?`}
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
    ),
  })
}
