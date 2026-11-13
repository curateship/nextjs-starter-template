import * as React from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Trash2Icon, XIcon } from "lucide-react"

import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { CrmTable, CrmTableRow } from "@/components/crm/crm-table"
import { AdminMemberRecord } from "@/components/pomodoro/admin-member-record"
import { anyPaused, SafetyPauseLine, useSafetyPauses } from "@/components/pomodoro/admin-safety-banner"
import { useFlowflyTab } from "@/components/pomodoro/flowfly/flowfly-context"
import { DashboardTablePagination } from "@/components/shared/dashboard-table"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, type SelectedMenuControls } from "@/components/shared/mass-select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { getPomodoroAdminErrorMessage } from "@/lib/api/pomodoro/admin"
import { cn } from "@/lib/utils"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import type { useSelection } from "@/lib/hooks/use-selection"

/**
 * The plumbing every pomodoro operator list shares: hold the rows the loader
 * already fetched, fetch again when the address changes, and draw the result
 * as a tab of the Flowfly admin dashboard (Tyler, 13 Nov 2026), in the
 * shell's CRM header and table shape.
 *
 * Search, filters, sort and page live in the address rather than in memory, so
 * pressing Back returns the exact list you left and the address can be handed
 * to somebody else. Each section owns its own address shape; this file owns
 * everything that would otherwise be written out five times.
 */

/** How long the list waits after a change before asking the server. */
const REFETCH_DELAY_MS = 250

/**
 * Address values that pick which list or page is shown, or what is open over
 * it, rather than narrowing the rows. Every other value set in a list's
 * address is a search or a filter: each list leaves its own out of the
 * address when it is at "all".
 */
const NOT_FILTERS = new Set([
  "page",
  "sort",
  "direction",
  "tab",
  "window",
  "open",
  "message",
  "member",
  // The Flowfly dashboard's own place: which section and tab show.
  "section",
  "list",
  "part",
])

/** True when a list's address holds a search or a filter. */
export function isFilteredSearch(search: Record<string, unknown>) {
  return Object.entries(search).some(
    ([key, value]) => !NOT_FILTERS.has(key) && value !== undefined && value !== ""
  )
}

export type AdminListResult<Row> = { rows: Row[]; total: number }

/** Row ticking, as every operator list hands it to the table below. */
export type AdminListSelection = {
  /** Plural, lower case: "reports". Used in the header checkbox's name. */
  noun: string
  /** The ids of the rows on screen, in the order they are drawn. */
  rowIds: string[]
  state: ReturnType<typeof useSelection>
}

export function useAdminList<Row>({
  initial,
  initialPageSize,
  page,
  onPageChange,
  load,
}: {
  initial: AdminListResult<Row>
  initialPageSize: number
  /** The page the address is asking for, so a page past the end can be fixed. */
  page: number
  onPageChange: (page: number) => void
  /**
   * Fetches the page the address currently describes. Wrap it in
   * `React.useCallback` over the address values: a new identity is what tells
   * this hook the list has changed and a fetch is due.
   */
  load: (pageSize: number) => Promise<AdminListResult<Row>>
}) {
  const [rows, setRows] = React.useState(initial.rows)
  const [total, setTotal] = React.useState(initial.total)
  const [pageSize, setPageSize] = React.useState(initialPageSize)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Which fetch is the current one. Two can be in the air at once — a filter
  // change and the refresh that follows resolving a report — and without this
  // the slower one wins and puts stale rows back on screen.
  const latestRequest = React.useRef(0)

  const refresh = React.useCallback(async () => {
    const request = latestRequest.current + 1
    latestRequest.current = request
    setLoading(true)
    try {
      const result = await load(pageSize)
      if (latestRequest.current !== request) return
      setRows(result.rows)
      setTotal(result.total)
      setError(null)
    } catch (loadError) {
      if (latestRequest.current !== request) return
      setError(getPomodoroAdminErrorMessage(loadError))
    } finally {
      if (latestRequest.current === request) setLoading(false)
    }
  }, [load, pageSize])

  // The loader already fetched what is on screen, so opening the list must not
  // fetch it again. The rows are remembered against the request that produced
  // them, rather than skipping only the first run: React runs this effect a
  // second time straight after mounting with nothing changed, and a first-run
  // flag let that second run refetch, which on an empty list dropped the
  // "No … match" line for a moment and made the footer jump. Every real change
  // after that waits out the same quarter second the shell's tables wait, so
  // holding a key down is one request, not twelve.
  const shownFor = React.useRef(refresh)
  React.useEffect(() => {
    if (shownFor.current === refresh) return
    const timer = setTimeout(() => {
      shownFor.current = refresh
      void refresh()
    }, REFETCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [refresh])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // The page fell off the end — the last report on page 2 was resolved out of
  // a filtered list, or another operator removed rows. Without this the table
  // says "no rows match" while page 1 is full of them.
  React.useEffect(() => {
    if (!loading && total > 0 && page > totalPages) onPageChange(totalPages)
  }, [loading, onPageChange, page, total, totalPages])

  return {
    rows,
    total,
    pageSize,
    setPageSize,
    loading,
    error,
    refresh,
    totalPages,
  }
}

/** What a list's rows read from the table around them. */
type RowsContext = {
  openId: string | undefined
  /** A member is open on the right in place of the row (`?member=`). */
  memberOpen: boolean
  massSelect: boolean
  selection: AdminListSelection["state"] | null
  open: (id: string) => void
  rightClick: (id: string, x: number, y: number, onDelete: (() => void) | undefined) => void
}

const Rows = React.createContext<RowsContext | null>(null)

/** Opens a row on the right, closing a member open there. */
function useOpenRow() {
  const navigate = useNavigate()
  return React.useCallback(
    (id: string) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...previous, open: id }
          delete next.member
          return next
        },
      })
    },
    [navigate]
  )
}

/**
 * One operator list, drawn as a Flowfly tab (Tyler, 13 Nov 2026: "Match
 * design pattern exactly as how shell does it"), the way the shell's Users
 * tab draws its list (`src/components/admin-dashboard/users-tab.tsx`):
 *
 * - **Header:** the section's tabs, then "N selected" while rows are ticked,
 *   the search box, Select, the person chip, Filter, the view dropdown, the
 *   one New button and the ⋮, then the reopen button for a shut right panel.
 * - **Table:** the CRM's `CrmTable`. Tick boxes show only while Select is
 *   on. A row pressed opens on the right with the sliding bar, its cog opens
 *   it too, and its bin asks first. Right-click offers Mass select and the
 *   row's Delete.
 * - **Right:** the open row's record, or the member whose name was pressed
 *   (`?member=`), which replaced the member window (Tyler's pick "Member on
 *   the right").
 * - **Pages** under the table once there is more than one.
 */
export function AdminListTable<Row, Sort extends string>({
  noun,
  columns,
  sort,
  direction,
  onSort,
  selection,
  list,
  page,
  onPageChange,
  search,
  person,
  filter,
  view,
  bulk,
  bulkBusy = false,
  primary,
  menuItems,
  emptyText,
  rowIds,
  record,
  windows,
  footnote,
  children,
}: {
  /** Plural, lower case: "tasks". Used in the empty line and the tick-all box. */
  noun: string
  columns: TableHeaderColumn<Sort>[]
  sort: Sort
  direction: "asc" | "desc"
  onSort: (column: Sort) => void
  /** Row ticking. Leave it out and the list has no Select. */
  selection?: AdminListSelection
  list: ReturnType<typeof useAdminList<Row>>
  page: number
  onPageChange: (page: number) => void
  /** The search box, always in the header. Null on a list with none. */
  search: { name: string; label: string; placeholder: string; value: string; onChange: (text: string) => void } | null
  /** The one member a list is narrowed to (`?user=`), shown as a chip with an ×. */
  person?: { name: string | null; onClear: () => void }
  /** Filter's rows, and how many are set. */
  filter?: { count: number; onClear: () => void; children: React.ReactNode }
  /** Which part of the list shows: a page's old tabs, as the shell's `ViewMenu`. */
  view?: React.ReactNode
  /** The "N selected" menu's rows for the ticked rows on this page. */
  bulk?: (ids: string[], menu: SelectedMenuControls) => React.ReactNode
  bulkBusy?: boolean
  /** The New … button. */
  primary?: React.ReactNode
  /** The ⋮'s rows. */
  menuItems?: { label: string; icon: React.ReactNode; onClick: () => void }[]
  /**
   * The empty line, for a list that wants its own sentence. Left out, it is
   * "No tasks yet." with nothing narrowing the list, and "No tasks match
   * those filters." with a search or filter on.
   */
  emptyText?: string
  /** The rows' ids in the order shown, first first. */
  rowIds: string[]
  /** The open row's record on the right, or null when the list has no rows. */
  record: { label: string; content: (openId: string | undefined) => React.ReactNode }
  /** The list's own windows, such as its delete confirm. */
  windows?: React.ReactNode
  /** One muted line under the rows, such as Focus's totals. */
  footnote?: React.ReactNode
  children: React.ReactNode
}) {
  const { heading, frame, search: address } = useFlowflyTab()
  const openRow = useOpenRow()
  const filtered = isFilteredSearch(useSearch({ strict: false }))
  // A pause switch left on shows in every Pomoder table (admin task 05).
  const pauses = useSafetyPauses()
  const paused = anyPaused(pauses)

  const [massSelect, setMassSelect] = React.useState(false)
  const listKey = `${String(address.q ?? "")}|${sort}|${direction}|${page}|${filter?.count ?? 0}`
  // A list that ticks nothing hands a setter that does nothing.
  useClearSelectionOnListChange(selection?.state.setSelected ?? keepNothing, listKey)
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection?.state.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection?.state.setSelected(new Set([tickId]))
  }

  const [menu, setMenu] = React.useState<{ id: string; x: number; y: number; onDelete?: () => void } | null>(null)

  // The open row: the address's, or the first while it names none in view.
  const openId = address.open && rowIds.includes(address.open) ? address.open : rowIds[0]
  const memberId = typeof address.member === "string" ? address.member : undefined

  // Only the ticks on the page on screen are counted or acted on.
  const ticked = selection ? selection.rowIds.filter((id) => selection.state.selected.has(id)) : []

  const rows: RowsContext = {
    openId: memberId ? undefined : openId,
    memberOpen: Boolean(memberId),
    massSelect: Boolean(selection) && massSelect,
    selection: selection?.state ?? null,
    open: openRow,
    rightClick: (id, x, y, onDelete) => setMenu({ id, x, y, onDelete }),
  }

  const searchText = search?.value.trim() ?? ""
  const empty = list.error ? (
    <span className="grid justify-items-center gap-2">
      {list.error}
      <Button type="button" variant="outline" size="sm" onClick={() => void list.refresh()}>
        Try again
      </Button>
    </span>
  ) : list.rows.length > 0 ? null : emptyText ? (
    emptyText
  ) : filtered ? (
    <span className="grid justify-items-center gap-2">
      {searchText ? `No ${noun} match "${searchText}".` : `No ${noun} match those filters.`}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          search?.onChange("")
          filter?.onClear()
          person?.onClear()
        }}
      >
        Clear filters
      </Button>
    </span>
  ) : (
    `No ${noun} yet.`
  )

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={heading}
        end={<PanelReopenButton side="right" label={`Show the ${record.label.toLowerCase()}`} />}
        menuLabel={`More for ${noun}`}
        selected={
          bulk && massSelect && ticked.length ? (
            <SelectedMenu
              count={ticked.length}
              busy={bulkBusy}
              onClear={() => selection?.state.clear()}
              pages={{}}
              main={(controls) => bulk(ticked, controls)}
            />
          ) : null
        }
        search={search}
        massSelect={selection ? { on: massSelect, onToggle: () => toggleMassSelect() } : null}
        filter={
          <>
            {person ? (
              <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-zinc-200/60 bg-muted px-2 text-sm dark:border-zinc-700/60">
                <span className="max-w-32 truncate">Only {person.name ?? "one member"}</span>
                <button
                  type="button"
                  aria-label="Show everyone"
                  className="rounded-sm text-muted-foreground hover:text-foreground"
                  onClick={person.onClear}
                >
                  <XIcon className="size-3.5" />
                </button>
              </span>
            ) : null}
            {filter ? (
              <FilterPopover contentClassName="w-60" count={filter.count} onClear={filter.onClear} save={null}>
                {filter.children}
              </FilterPopover>
            ) : null}
          </>
        }
        view={view}
        primary={primary}
        menuItems={menuItems}
      />
      {pauses && paused ? (
        <div className="border-b px-6 py-2">
          <SafetyPauseLine pauses={pauses} />
        </div>
      ) : null}
      {/* Below a 448px middle (a phone), every column but the name and its
          buttons drops out: the open row's record on the right holds the rest. */}
      <div className="@container flex min-h-0 flex-1 flex-col @max-md:[&_[data-column=meta]]:hidden @max-md:[&_[data-column=mutedMeta]]:hidden @max-md:[&_[data-column=preview]]:hidden">
        <Rows.Provider value={rows}>
          <CrmTable<Sort>
            // The main column's heading drops the table's 320px floor to 160px,
            // as the shell's Users list does, so a row never runs past the panel.
            columns={columns.map((column) =>
              column.column === "main" ? { ...column, className: cn("min-w-40", column.className) } : column
            )}
            sort={sort}
            direction={direction}
            onSort={onSort}
            select={
              selection && massSelect
                ? {
                    noun,
                    disabled: selection.rowIds.length === 0,
                    checked: selection.state.selectAllState(selection.rowIds),
                    onToggle: () => selection.state.toggleVisible(selection.rowIds),
                  }
                : null
            }
            empty={empty}
          >
            {children}
          </CrmTable>
        </Rows.Provider>
        {footnote ? (
          <p className="border-t px-6 py-2 text-sm text-muted-foreground" aria-live="polite">
            {footnote}
          </p>
        ) : null}
        {list.totalPages > 1 || page > 1 ? (
          <div className="border-t">
            <DashboardTablePagination
              page={page}
              pageSize={list.pageSize}
              total={list.total}
              totalPages={list.totalPages}
              onPageChange={(next) => onPageChange(Math.max(1, Math.min(next, list.totalPages)))}
              onPageSizeChange={(next) => {
                onPageChange(1)
                list.setPageSize(next)
              }}
            />
          </div>
        ) : null}
      </div>
      {menu ? (
        <CrmRowMenu
          key={`${menu.id}-${menu.x}-${menu.y}`}
          at={menu}
          massSelect={
            selection
              ? { on: massSelect, onToggle: () => toggleMassSelect(massSelect ? undefined : menu.id) }
              : null
          }
          items={
            menu.onDelete
              ? [
                  {
                    label: "Delete",
                    icon: <Trash2Icon className="size-4" />,
                    destructive: true,
                    onSelect: menu.onDelete,
                  } satisfies RowMenuItem,
                ]
              : []
          }
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids: rowIds,
    // A phone shows the list again when it changes, and the record when one is pressed.
    showMiddleFor: listKey,
    showRightFor: memberId ?? (address.open && address.open === openId ? address.open : undefined),
    middle,
    right: {
      label: memberId ? "Member" : record.label,
      showLabel: `Show the ${memberId ? "member" : record.label.toLowerCase()}`,
      content: memberId ? <AdminMemberRecord key={memberId} userId={memberId} /> : record.content(openId),
    },
    windows,
  })
}

const keepNothing: React.Dispatch<React.SetStateAction<Set<string>>> = () => {}

/**
 * One row of an operator list, as the CRM draws one (`CrmTableRow`): pressed,
 * it opens on the right; its cog opens it too; `buttons` are its own icon
 * buttons, then the bin, which asks first. While Select is on, a tick box
 * leads and pressing the row ticks it.
 */
export function AdminRow({
  id,
  label,
  tickable = true,
  onDelete,
  buttons,
  children,
}: {
  id: string
  /** What the row is, for its open button and tick box: "Berlin mornings". */
  label: string
  /** False for a row that cannot be ticked, such as a closed room. */
  tickable?: boolean
  onDelete?: () => void
  buttons?: readonly { label: string; icon: React.ReactNode; onPress: () => void }[]
  children: React.ReactNode
}) {
  const rows = React.useContext(Rows)
  if (!rows) throw new Error("An admin row is drawn outside its list.")
  const selection = rows.selection
  return (
    <CrmTableRow
      open={rows.openId === id}
      label={label}
      tick={
        rows.massSelect && selection
          ? { shown: true, ticked: selection.selected.has(id), none: !tickable, onToggle: () => selection.toggle(id) }
          : null
      }
      onOpen={() => rows.open(id)}
      onDelete={onDelete}
      buttons={buttons}
      onRightClick={(x, y) => rows.rightClick(id, x, y, onDelete)}
    >
      {children}
    </CrmTableRow>
  )
}

/** Whether Select is on in the list around a row, so a row can show its drag handle only then. */
export function useMassSelectOn() {
  return React.useContext(Rows)?.massSelect ?? false
}
