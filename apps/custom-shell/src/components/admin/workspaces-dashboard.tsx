import { capitalise, workspaceWord } from "@/lib/app-options"
import * as React from "react"
import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  ArrowRightIcon,
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { WorkspaceFormDialog } from "@/components/shared/workspace-form-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import type { WorkspaceStatus } from "@/lib/workspaces/status"
import {
  deleteWorkspace,
  deleteWorkspaces,
  getWorkspaceErrorMessage,
  type WorkspaceItem,
  type WorkspaceCopyChoice,
} from "@/lib/api/people/workspaces"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { plural } from "@/lib/format/plural"
import { renderShellIcon } from "@/lib/custom-shell"
import { workspaceListedAddress } from "@/lib/workspaces/addresses"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useClientPage } from "@/lib/hooks/use-client-page"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { useSwitchWorkspace } from "@/lib/hooks/use-switch-workspace"

type WorkspaceSortColumn = "name" | "address" | "status"

const workspacesRoute = getRouteApi("/_authenticated/workspaces")

/**
 * What the Status column says, and it is **the workspace's own status** — not
 * whether you happen to be in it.
 *
 * It used to show "Active" on the one you were in and "Inactive" on every
 * other, which was two different mistakes at once: it never showed the real
 * status at all, and it called three perfectly live workspaces switched off.
 * Harmless while the only thing you could do here was rename them; actively
 * misleading now there is a button beside it for going into one.
 *
 * Short wording on purpose. The edit window spells each one out in full,
 * because that is where somebody is choosing between them.
 */
const STATUS_BADGES: Record<
  WorkspaceStatus,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  active: { label: "Live", variant: "default" },
  draft: { label: "Draft", variant: "outline" },
  inactive: { label: "Switched off", variant: "secondary" },
}

/** Live first, then draft, then switched off — most reachable at the top. */
const STATUS_ORDER: Record<WorkspaceStatus, number> = {
  active: 0,
  draft: 1,
  inactive: 2,
}

export function WorkspacesDashboard({
  initialWorkspaces: workspaces,
  baseDomain = "",
  copyChoices = [],
}: {
  initialWorkspaces: WorkspaceItem[]
  /** The domain workspaces hang off, for the address field's preview. */
  baseDomain?: string
  copyChoices?: WorkspaceCopyChoice[]
}) {
  // Read inside the component, never at module level — an app's options file
  // can import its way back here.
  const word = workspaceWord()
  const router = useRouter()
  const navigate = useNavigate()
  const { open: openWorkspaceId } = workspacesRoute.useSearch()
  const { config } = useShellRuntime()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [editing, setEditing] = React.useState<WorkspaceItem | null>(null)
  const [pendingDelete, setPendingDelete] =
    React.useState<WorkspaceItem | null>(null)
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)
  const [formOpen, setFormOpen] = React.useState(false)
  const [run, busy] = useAsyncAction(getWorkspaceErrorMessage)
  const { sort, direction: sortDirection, toggleSort } =
    useTableSort<WorkspaceSortColumn>("name")
  const selection = useSelection()
  // The same act as the sidebar switcher, and deliberately the same code —
  // switching has to throw the page away, and that reasoning lives in one file.
  const { switchToWorkspace, busyWorkspaceId } = useSwitchWorkspace()
  const selectedIds = selection.selected
  const setOpenWorkspace = React.useCallback(
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

  // Built here rather than at the top of the file: the header names the thing
  // whatever this app calls it, and `workspaceWord()` may only be read inside a
  // component. Not memoised — two objects per render costs nothing, and
  // `workspaceWord()` hands back a fresh literal when an app has not set one,
  // so a memo keyed on it would rebuild every render anyway while looking as
  // though it did not.
  const columns: SortableColumn<WorkspaceSortColumn>[] = [
    { key: "name", label: capitalise(word.one), column: "main" },
    { key: "address", label: "Address", column: "meta" },
    { key: "status", label: "Status", column: "meta" },
  ]

  // Worked out once per render and reused by the search, the sort and the cell,
  // so the three can never disagree about what a row's address is.
  const addressOf = React.useCallback(
    (workspace: WorkspaceItem) => workspaceListedAddress(workspace, baseDomain),
    [baseDomain]
  )

  const sortedWorkspaces = React.useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1
    const query = searchQuery.trim().toLowerCase()
    return workspaces
      .filter((workspace) => {
        if (!query) return true
        return (
          workspace.name.toLowerCase().includes(query) ||
          addressOf(workspace).text.toLowerCase().includes(query)
        )
      })
      .sort((a, b) => {
        if (sort === "address") {
          const gap = addressOf(a).text.localeCompare(addressOf(b).text)
          // Two rows can share an address only when neither has one to show, so
          // the name breaks the tie and the order stays the same every render.
          if (gap !== 0) return gap * direction
          return a.name.localeCompare(b.name)
        }
        if (sort === "status") {
          // Sorted by what the column actually shows. It used to sort by which
          // one you were in, which is not what the header says and left the
          // order looking random.
          const gap = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
          if (gap !== 0) return gap * direction
          return a.name.localeCompare(b.name)
        }
        return a.name.localeCompare(b.name) * direction
      })
  }, [addressOf, searchQuery, sort, sortDirection, workspaces])

  const {
    page: currentPage,
    pageSize,
    visible: paginatedWorkspaces,
    footer,
  } = useClientPage(
    sortedWorkspaces,
    config.dashboardRowsPerPage,
    `${searchQuery}|${sort}|${sortDirection}`
  )
  const visibleIds = paginatedWorkspaces.map((workspace) => workspace.id)

  useClearSelectionOnListChange(
    selection.setSelected,
    `${searchQuery}|${sort}|${sortDirection}|${currentPage}|${pageSize}`
  )

  function openCreateForm() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEditForm(workspace: WorkspaceItem) {
    setEditing(workspace)
    setFormOpen(true)
    setOpenWorkspace(workspace.id)
  }

  React.useEffect(() => {
    if (openWorkspaceId) {
      const workspace = workspaces.find((item) => item.id === openWorkspaceId)
      if (workspace) {
        setEditing(workspace)
        setFormOpen(true)
      }
      return
    }
    if (!formOpen || editing) {
      setEditing(null)
      setFormOpen(false)
    }
  }, [editing, formOpen, openWorkspaceId, workspaces])

  // One request for the whole selection, and the server decides what it can
  // take — one workspace always has to survive, so the last one never goes.
  async function confirmMassDelete() {
    await run(async () => {
      const { deleted, kept } = await deleteWorkspaces([...selectedIds])
      await router.invalidate()
      // Anything that would not go stays ticked, so the rows still on screen
      // are the ones the count is talking about.
      selection.setSelected(new Set(kept))

      if (deleted.length === 0) {
        showErrorToast(
          `No ${word.many} were deleted. One ${word.one} always has to stay, and the others may already be gone.`
        )
        return
      }

      toast.success(
        describeBulkResult({
          done: deleted.length,
          kept: kept.length,
          one: word.one,
          many: word.many,
          verb: "deleted",
        })
      )
      setMassDeleteOpen(false)
    })
  }

  async function confirmDelete() {
    if (!pendingDelete) return

    await run(async () => {
      await deleteWorkspace(pendingDelete.id)
      await router.invalidate()
      toast.success(`${capitalise(word.one)} deleted.`)
      setPendingDelete(null)
    })
  }

  return (
    <>
      <DashboardTable
        title={capitalise(word.many)}
        icon={renderShellIcon("briefcaseBusiness", "text-muted-foreground")}
        count={sortedWorkspaces.length}
        selectedCount={selectedIds.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedIds.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                onClick={() => setMassDeleteOpen(true)}
                disabled={busy || selectedIds.size >= workspaces.length}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedIds.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="workspace-search"
              aria-label={`Search ${word.many} by name or address`}
              placeholder="Search by name or address…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <DashboardToolbarButton type="button" onClick={openCreateForm}>
              <PlusIcon className="size-4" />
              New {word.one}
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={columns}
            sort={sort}
            direction={sortDirection}
            onSort={toggleSort}
            leading={
              <SelectAllTableHead noun={word.many} checked={selection.selectAllState(visibleIds)} onCheckedChange={() => selection.toggleVisible(visibleIds)} />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={sortedWorkspaces.length === 0}
        emptyText={`No ${word.many} found.`}
        emptyColSpan={5}
        footer={footer}
      >
        {paginatedWorkspaces.map((workspace) => (
          <TableRow
            key={workspace.id}
            className="group"
            rowAction={() => openEditForm(workspace)}
          >
            <TableCell column="select">
              <Checkbox
                checked={selectedIds.has(workspace.id)}
                onCheckedChange={() => selection.toggle(workspace.id)}
                aria-label={`Select ${workspace.name}`}
              />
            </TableCell>
            <TableCell column="main">
              <div className="flex items-center gap-3">
                <span className="flex h-8 min-w-8 shrink-0 items-center justify-center border-border">
                  {workspace.favicon ? (
                    <img
                      src={workspace.favicon}
                      alt={`${workspace.name} favicon`}
                      className="h-8 w-auto object-contain"
                    />
                  ) : (
                    renderShellIcon(workspace.icon)
                  )}
                </span>
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    className="block max-w-full truncate text-left font-medium group-hover:underline"
                    onClick={() => openEditForm(workspace)}
                    title={workspace.name}
                  >
                    {workspace.name}
                  </button>
                  {/* Which one you are in belongs next to its name, not in the
                      Status column — that column is about the workspace, and
                      this is about you. */}
                  {workspace.active ? (
                    <Badge variant="outline" className="shrink-0">
                      Current
                    </Badge>
                  ) : null}
                </div>
              </div>
            </TableCell>
            <TableCell column="meta">
              {(() => {
                const address = addressOf(workspace)
                // A domain of its own is the real address, so it is set in the
                // ordinary text weight. The fallback subdomain is quieter and
                // says what it is on hover — the two never rely on colour alone
                // to be told apart.
                return (
                  <span
                    className={
                      address.kind === "domain"
                        ? "block max-w-full truncate font-medium"
                        : "block max-w-full truncate text-muted-foreground"
                    }
                    title={
                      address.kind === "domain"
                        ? address.text
                        : address.kind === "subdomain"
                          ? `${address.text} — no domain of its own yet.`
                          : `No address yet: this deployment has no base domain set.`
                    }
                  >
                    {address.text}
                  </span>
                )
              })()}
            </TableCell>
            <TableCell column="meta">
              <Badge variant={STATUS_BADGES[workspace.status].variant}>
                {STATUS_BADGES[workspace.status].label}
              </Badge>
            </TableCell>
            <TableCell column="actions">
                {/*
                 * Going into a workspace, from the one screen that lists them
                 * all. The sidebar switcher used to be the only way, so this
                 * screen could show you a workspace and then offer no way to
                 * work in it.
                 */}
                <DisabledReason
                  disabled={workspace.active}
                  reason={`You are already in this ${word.one}.`}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={workspace.active || Boolean(busyWorkspaceId)}
                    onClick={() => void switchToWorkspace(workspace.id)}
                    aria-label={`Switch to ${workspace.name}`}
                    title={`Switch to ${workspace.name}`}
                  >
                    {busyWorkspaceId === workspace.id ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <ArrowRightIcon className="size-4" />
                    )}
                  </Button>
                </DisabledReason>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => openEditForm(workspace)}
                  aria-label={`Edit ${workspace.name}`}
                  title={`Edit ${workspace.name}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <DisabledReason
                  disabled={workspaces.length <= 1}
                  reason={`This is your last ${word.one}, and the app needs one. Make another before deleting this.`}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={workspaces.length <= 1}
                    onClick={() => setPendingDelete(workspace)}
                    aria-label={`Delete ${workspace.name}`}
                    title={`Delete ${workspace.name}`}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </DisabledReason>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <ConfirmDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        title={`Delete ${selectedIds.size} ${plural(selectedIds.size, word.one, word.many)}?`}
        description="Their settings and navigation are removed. This cannot be undone."
        confirmLabel={`Delete ${word.many}`}
        loading={busy}
        onConfirm={confirmMassDelete}
      />

      <WorkspaceFormDialog
        baseDomain={baseDomain}
        availableWorkspaces={workspaces}
        copyChoices={copyChoices}
        open={formOpen}
        editing={editing}
        onClose={() => {
          setEditing(null)
          setFormOpen(false)
          setOpenWorkspace(undefined)
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={`Delete this ${word.one}?`}
        description={`${pendingDelete?.name ?? `This ${word.one}`} and its settings are removed. This cannot be undone.`}
        confirmLabel={`Delete ${word.one}`}
        loading={busy}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
