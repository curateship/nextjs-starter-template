import * as React from "react"
import { EyeIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { AccountActionDialogs, type AccountAsk } from "@/components/admin-dashboard/account-actions"
import {
  accountStatusWords,
  describeDeletion,
  describePaidPlans,
  planCellLabel,
  STANDING_DOT,
  targetOfRow,
  viewAsRefusal,
} from "@/components/admin-dashboard/account-words"
import type { AdminFrame } from "@/components/admin-dashboard/admin-dashboard"
import { FilterRow, TagChips } from "@/components/admin-dashboard/list-parts"
import { UserPanel } from "@/components/admin-dashboard/user-panel"
import { AddAccountDialog } from "@/components/admin/add-account-dialog"
import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, Dot, MainCell } from "@/components/crm/crm-table"
import { DashboardTablePagination } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import { ACCOUNT_RESTORE_DAYS, isPendingDeletion } from "@/lib/account-deletion"
import type { AdminSearch, AdminUsersSearch, UserSortColumn } from "@/lib/admin-dashboard/admin-search"
import {
  deleteAccountsAsAdmin,
  getAdminUserErrorMessage,
  listAdminAccounts,
  restoreAccountsAsAdmin,
  type AccountRow,
  type loadAdminUsersPage,
} from "@/lib/api/people/admin-users"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useOpenRecord } from "@/lib/nav/list-search"
import { roleLabel } from "@/lib/roles"
import { showErrorToast } from "@/lib/toast/error-toast"

/** What the route's loader read for the Users tab: the first page, from the address. */
export type UsersLoaded = Awaited<ReturnType<typeof loadAdminUsersPage>>

/** How long the list waits after the address changes before it asks again. */
const REFETCH_DELAY_MS = 250

const STATUS_FILTER_LABELS: Record<NonNullable<AdminUsersSearch["status"]>, string> = {
  all: "All accounts",
  active: "Active",
  unverified: "Not verified",
  suspended: "Suspended",
  pending_deletion: "Scheduled for deletion",
  locked_out: "Locked out",
}

/**
 * The Admin dashboard's Users tab (Tyler, 8 Nov 2026,
 * `workspace/tasks/features/admin/admin.md` B3 and B4).
 *
 * - **Middle:** every account in the CRM's one header and table shape. The
 *   header has "N selected" while rows are ticked (Restore, Delete), Filter
 *   (Role and Status), Add account and the ⋮ with Search and Mass select.
 *   Email, Role, Plan and Tags drop out as the panel narrows.
 * - **Right:** the person open (`UserPanel`). With no `?open=` it is the first
 *   row, so the panel is never empty while the list has anyone in it.
 *
 * The loader reads the first page from the address. After that the list asks
 * again in place, 250ms after the search, a filter, the sort or the page
 * changes, so typing never reloads the whole tab. Your own row cannot be
 * ticked or deleted.
 */
export function UsersTab({
  loaded,
  search,
  currentUserId,
  heading,
  headingEnd,
  frame,
}: {
  loaded: UsersLoaded
  search: AdminSearch
  currentUserId: string
  heading: React.ReactNode
  /** Last in the header: the button that reopens the right panel. */
  headingEnd: React.ReactNode
  frame: AdminFrame
}) {
  // The reader left only this tab's keys in the address (`readAdminSearch`).
  const listSearch = search as AdminUsersSearch
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = listSearch.q ?? ""
  const role = listSearch.role ?? "all"
  const status = listSearch.status ?? "all"
  const sort: UserSortColumn = listSearch.sort ?? "created"
  const direction = listSearch.direction ?? "desc"
  const page = listSearch.page ?? 1

  const [accounts, setAccounts] = React.useState(loaded.accounts.accounts)
  const [total, setTotal] = React.useState(loaded.accounts.total)
  const [pageSize, setPageSize] = React.useState(loaded.pageSize)
  const [error, setError] = React.useState<string | null>(null)
  // Which list the rows shown were read for. While it differs from the
  // address's, the first row is not yet the list's first row.
  const listKey = `${q}|${role}|${status}|${sort}|${direction}|${page}|${pageSize}`
  const [shownKey, setShownKey] = React.useState(listKey)
  // Goes up after every change, so the open person is read again too.
  const [refreshes, setRefreshes] = React.useState(0)
  const latestRequest = React.useRef(0)

  const refresh = React.useCallback(async () => {
    const request = ++latestRequest.current
    try {
      const result = await listAdminAccounts({ search: q, role, status, page, pageSize, sort, direction })
      if (request !== latestRequest.current) return
      setAccounts(result.accounts)
      setTotal(result.total)
      setError(null)
    } catch (loadError) {
      if (request !== latestRequest.current) return
      setError(getAdminUserErrorMessage(loadError))
    } finally {
      if (request === latestRequest.current) setShownKey(listKey)
    }
  }, [q, role, status, page, pageSize, sort, direction, listKey])

  // The loader already read the first list, so the first run asks nothing.
  const isFirstRender = React.useRef(true)
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const timer = setTimeout(() => void refresh(), REFETCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [refresh])

  /**
   * After a change: the list, then the person open, read again. The list
   * first, so a person deleted for good has left the panel before it reads.
   */
  const changed = React.useCallback(async () => {
    await refresh()
    setRefreshes((count) => count + 1)
  }, [refresh])

  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  useClearSelectionOnListChange(selection.setSelected, listKey)
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }

  // Your own row is never ticked: an admin cannot delete themselves here.
  const selectableIds = accounts.filter((account) => account.id !== currentUserId).map((account) => account.id)
  const ticked = accounts.filter((account) => selection.selected.has(account.id))
  const tickedLeaving = ticked.filter((account) => isPendingDeletion(account)).map((account) => account.id)
  // How many ticked rows are paying, so the bulk question can say what it
  // stops. Ticks clear whenever the list changes, so every one is on this page.
  const tickedPaying = ticked.filter((account) => account.planIsPaid || account.paused).length

  const [adding, setAdding] = React.useState(false)
  const [ask, setAsk] = React.useState<AccountAsk | null>(null)
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [runBulk, bulkBusy] = useAsyncAction(getAdminUserErrorMessage)

  const restoreTicked = () =>
    void runBulk(async () => {
      const { restored } = await restoreAccountsAsAdmin(tickedLeaving)
      toast.success(
        `${restored} ${plural(restored, "account", "accounts")} restored. In-app notices were created and emails were attempted.`
      )
      selection.clear()
      await changed()
    })

  const deleteTicked = () =>
    void runBulk(async () => {
      const result = await deleteAccountsAsAdmin(ticked.map((account) => account.id))
      toast.success(describeDeletion(result))
      // One already scheduled for deletion is gone for good now, so if it was
      // open the panel falls back to the first row.
      const goneOpen = ticked.some((account) => account.id === listSearch.open && isPendingDeletion(account))
      if (goneOpen) setListSearch({ open: undefined })
      selection.clear()
      setMassDeleteOpen(false)
      await changed()
    })

  const toggleSort = useListSort<UserSortColumn>({ sort, direction }, (column) =>
    column === "created" ? "desc" : "asc"
  )
  const columns: TableHeaderColumn<UserSortColumn>[] = [
    // Name only as wide as it needs and Email takes the rest, as the CRM's
    // Inbox lays out From and Email (Tyler, 8 Nov 2026: "there is a lot more
    // space for the email to show more").
    { key: "name", label: "Name", column: "main", className: "w-px min-w-40" },
    {
      key: "email",
      label: "Email",
      column: "preview",
      // Right-aligned, so the address sits beside Role rather than leaving
      // the gap after it (Tyler, 8 Nov 2026: "align email to right").
      // The sort button sits at the right edge with its arrow before the word,
      // so "Email" ends where the addresses do.
      className:
        "hidden w-full max-w-none min-w-40 text-right md:hidden @2xl:table-cell [&_button]:ml-auto [&_button]:w-fit [&_button]:flex-row-reverse",
    },
    { key: "role", label: "Role", column: "preview", className: "hidden md:hidden @4xl:table-cell" },
    { key: "status", label: "Status", column: "preview" },
    { key: "plan", label: "Plan", column: "preview", className: "hidden md:hidden @3xl:table-cell" },
    { key: "tags", label: "Tags", sortable: false, column: "preview", className: "hidden md:hidden @6xl:table-cell" },
    { key: "created", label: "Joined", column: "meta" },
  ]

  /** What a row offers, in its right-click menu: View as member, Restore, then Delete. */
  const rowMenuItems = (account: AccountRow): RowMenuItem[] => {
    const target = targetOfRow(account)
    const refusal = viewAsRefusal(target)
    return [
      {
        label: "View as member",
        icon: <EyeIcon className="size-4" />,
        onSelect: () => (refusal ? showErrorToast(refusal) : setAsk({ kind: "viewAs", account: target })),
      },
      ...(isPendingDeletion(account)
        ? [
            {
              label: "Restore account",
              icon: <RotateCcwIcon className="size-4" />,
              onSelect: () => setAsk({ kind: "restore", account: target }),
            },
          ]
        : []),
      ...(account.id === currentUserId
        ? []
        : [
            {
              label: "Delete account",
              icon: <Trash2Icon className="size-4" />,
              destructive: true,
              onSelect: () => setAsk({ kind: "delete", account: target }),
            },
          ]),
    ]
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  // Role is the header's tabs, so Filter holds Status alone.
  const filterCount = status === "all" ? 0 : 1
  const rightClicked = rightClick ? accounts.find((account) => account.id === rightClick.id) : undefined
  const openId = listSearch.open ?? accounts[0]?.id

  return frame({
    header: (
      <CrmListHeader
        tabs={heading}
        end={headingEnd}
        selected={
          massSelect && ticked.length ? (
            <SelectedMenu
              count={ticked.length}
              busy={bulkBusy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <>
                  {tickedLeaving.length ? (
                    <SelectedMenuRow
                      onClick={() => {
                        menu.close()
                        restoreTicked()
                      }}
                    >
                      <RotateCcwIcon className="size-4 text-muted-foreground" />
                      Restore {tickedLeaving.length}
                    </SelectedMenuRow>
                  ) : null}
                  <SelectedMenuRow
                    className="text-destructive"
                    onClick={() => {
                      menu.close()
                      setMassDeleteOpen(true)
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
        filter={
          <FilterPopover
            // Narrow: a label and a select a row (Tyler, 8 Nov 2026: "filter dropdown is too wide").
            contentClassName="w-60"
            count={filterCount}
            onClear={() => setListSearch({ status: undefined, page: undefined })}
            save={null}
          >
            <FilterRow id="admin-users-status" label="Status">
              <Select
                value={status}
                onValueChange={(value) =>
                  setListSearch({ status: value === "all" ? undefined : value, page: undefined })
                }
              >
                <SelectTrigger id="admin-users-status" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_FILTER_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>
          </FilterPopover>
        }
        primary={
          <DashboardToolbarButton type="button" aria-label="Add account" onClick={() => setAdding(true)}>
            <PlusIcon className="size-4" />
            <span className="@max-3xl:sr-only">Add account</span>
          </DashboardToolbarButton>
        }
        menuLabel="More for users"
        search={{
          name: "user-search",
          label: "Search accounts",
          placeholder: "Search name or email",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
      />
    ),
    middle: (
      <div className="@container flex min-h-0 flex-1 flex-col">
        <CrmTable<UserSortColumn>
          columns={columns}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          select={
            massSelect
              ? {
                  noun: "accounts",
                  disabled: selectableIds.length === 0,
                  checked: selection.selectAllState(selectableIds),
                  onToggle: () => selection.toggleVisible(selectableIds),
                }
              : null
          }
          empty={
            error ? (
              <span className="grid justify-items-center gap-2">
                {error}
                <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
                  Try again
                </Button>
              </span>
            ) : accounts.length > 0 ? null : q.trim() || filterCount ? (
              <span className="grid justify-items-center gap-2">
                {q.trim() ? `No accounts match "${q.trim()}".` : "No accounts match those filters."}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  // The role is the header's tab, not a filter, so it stays.
                  onClick={() => setListSearch({ q: undefined, status: undefined, page: undefined })}
                >
                  Clear filters
                </Button>
              </span>
            ) : role !== "all" ? (
              `Nobody has the ${roleLabel(role)} role.`
            ) : (
              "No accounts yet."
            )
          }
        >
          {accounts.map((account) => {
            const words = accountStatusWords(account)
            const own = account.id === currentUserId
            return (
              <CrmTableRow
                key={account.id}
                open={account.id === openId}
                label={account.name}
                tick={
                  massSelect
                    ? {
                        shown: true,
                        ticked: selection.selected.has(account.id),
                        none: own,
                        onToggle: () => selection.toggle(account.id),
                      }
                    : null
                }
                onOpen={() => setOpen(account.id)}
                onDelete={own ? undefined : () => setAsk({ kind: "delete", account: targetOfRow(account) })}
                onRightClick={(x, y) => setRightClick({ id: account.id, x, y })}
              >
                <MainCell name={account.name} lead={<Dot className={STANDING_DOT[words.standing]} label={words.label} />}>
                  {own ? <Chip muted>You</Chip> : null}
                </MainCell>
                <TableCell column="preview" className="hidden w-full max-w-0 min-w-40 text-right md:hidden @2xl:table-cell">
                  <span className="block truncate text-muted-foreground">{account.email}</span>
                </TableCell>
                <TableCell column="preview" className="hidden md:hidden @4xl:table-cell">
                  <Chip muted={account.role !== "admin"}>{roleLabel(account.role)}</Chip>
                </TableCell>
                <TableCell column="preview">
                  {/* Grey, as every chip in the list but an admin's role (Tyler, 8 Nov 2026: "the status col and these are not gray"). */}
                  <Chip muted>{words.label}</Chip>
                </TableCell>
                {/* The plan's name alone: whether it was granted or is ending
                    is on the right panel. */}
                <TableCell column="preview" className="hidden md:hidden @3xl:table-cell">
                  <Chip muted>{planCellLabel(account)}</Chip>
                </TableCell>
                <TableCell column="preview" className="hidden md:hidden @6xl:table-cell">
                  <TagChips tags={account.tags} />
                </TableCell>
                <TableCell column="mutedMeta">{formatDate(account.createdAt)}</TableCell>
              </CrmTableRow>
            )
          })}
        </CrmTable>

        {totalPages > 1 || page > 1 ? (
          <div className="border-t">
            <DashboardTablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              onPageChange={(next) => {
                const clamped = Math.max(1, Math.min(next, totalPages))
                setListSearch({ page: clamped > 1 ? clamped : undefined })
              }}
              onPageSizeChange={(next) => {
                setListSearch({ page: undefined })
                setPageSize(next)
              }}
            />
          </div>
        ) : null}

        {rightClick && rightClicked ? (
          <CrmRowMenu
            key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
            at={rightClick}
            massSelect={{
              on: massSelect,
              onToggle: () => toggleMassSelect(!massSelect && rightClick.id !== currentUserId ? rightClick.id : undefined),
            }}
            items={rowMenuItems(rightClicked)}
            onClose={() => setRightClick(null)}
          />
        ) : null}
      </div>
    ),
    right: {
      label: "Person",
      content: (
        <UserPanel
          key={openId ?? "none"}
          userId={openId}
          refreshes={refreshes}
          currentUserId={currentUserId}
          onChanged={changed}
          onAsk={setAsk}
        />
      ),
    },
    ids: accounts.map((account) => account.id),
    openId,
    ready: shownKey === listKey,
    windows: (
      <>
        <AddAccountDialog
          // Remounts on every open, so the last invite's fields never linger.
          key={adding ? "add-open" : "add-closed"}
          open={adding}
          onClose={() => setAdding(false)}
          onCreated={async () => {
            setAdding(false)
            await refresh()
          }}
        />
        <AccountActionDialogs
          ask={ask}
          onClose={() => setAsk(null)}
          onDone={async ({ accountId, goneForGood }) => {
            // Gone for good, they leave the panel, which falls back to the first row.
            if (goneForGood && accountId === listSearch.open) setListSearch({ open: undefined })
            selection.setSelected((current) => {
              if (!current.has(accountId)) return current
              const next = new Set(current)
              next.delete(accountId)
              return next
            })
            await changed()
          }}
        />
        <ConfirmDialog
          open={massDeleteOpen}
          onOpenChange={setMassDeleteOpen}
          title={`Delete ${ticked.length} ${plural(ticked.length, "account", "accounts")}?`}
          description={`Those people are signed out everywhere and cannot sign in. You can restore them for ${ACCOUNT_RESTORE_DAYS} days. Any that were already scheduled for deletion are removed for good now.${describePaidPlans(tickedPaying)}`}
          confirmLabel="Delete accounts"
          loading={bulkBusy}
          onConfirm={deleteTicked}
        />
      </>
    ),
  })
}
