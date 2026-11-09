import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ArchiveIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import type { AdminFrame } from "@/components/admin-dashboard/admin-dashboard"
import { AnnouncementPanel } from "@/components/admin-dashboard/announcement-panel"
import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, Dot, OpenBar } from "@/components/crm/crm-table"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { DashboardTablePagination } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import type {
  AdminAnnouncementsSearch,
  AdminSearch,
  AnnouncementSortColumn,
} from "@/lib/admin-dashboard/admin-search"
import { announcementStatus, announcementStatusLabels } from "@/lib/admin-dashboard/announcement-status"
import { ANNOUNCEMENT_LEVELS, announcementLevelLabels } from "@/lib/announcement"
import {
  deleteAdminAnnouncements,
  getAnnouncementErrorMessage,
  retireAdminAnnouncements,
  type Announcement,
} from "@/lib/api/content/announcements"
import { formatUtcDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useOpenRecord } from "@/lib/nav/list-search"

/** What the route's loader read for the Announcements tab: every one the site has. */
export type AnnouncementsLoaded = Announcement[]

type Status = ReturnType<typeof announcementStatus>

/** A row's dot: green up now, blue starting later, grey over. */
const STATUS_DOT: Record<Status, string> = {
  showing: "bg-green-600",
  scheduled: "bg-blue-500",
  ended: "bg-muted-foreground/40",
}

/** Where it shows, in a word or three. */
function whereText(announcement: Announcement) {
  return [
    announcement.showBanner ? "Banner" : null,
    announcement.notify ? "Tray" : null,
    announcement.showBanner && announcement.audience === "everyone" ? "Visitors" : null,
  ]
    .filter(Boolean)
    .join(", ")
}

/**
 * The Admin dashboard's Announcements section (Tyler, 9 Nov 2026: "Move the
 * announcement from the top left settings into its own dashboard"). Until
 * then they were a short list in the left page's ⋮ that opened a window.
 *
 * - **Middle:** every announcement in the CRM's one header and table shape.
 *   The header has "N selected" while rows are ticked (Retire, Delete),
 *   Filter (Status), New announcement and the ⋮ with Search and Mass select.
 * - **Right:** the announcement open, changed in place
 *   (`AnnouncementPanel`). With no `?open=` it is the first row. New
 *   announcement puts a blank one there.
 *
 * The route's loader reads them all once; search, Status, sort and the page
 * work on that copy here. Opening another row, or New announcement, while
 * the panel has unsaved changes asks first.
 */
export function AnnouncementsTab({
  loaded,
  search,
  heading,
  headingEnd,
  frame,
}: {
  loaded: AnnouncementsLoaded
  search: AdminSearch
  heading: React.ReactNode
  /** Last in the header: the button that reopens the right panel. */
  headingEnd: React.ReactNode
  frame: AdminFrame
}) {
  const router = useRouter()
  const { config } = useShellRuntime()
  // The reader left only this tab's keys in the address (`readAdminSearch`).
  const listSearch = search as AdminAnnouncementsSearch
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = listSearch.q ?? ""
  const shows = listSearch.shows ?? "all"
  const sort: AnnouncementSortColumn = listSearch.sort ?? "starts"
  const direction = listSearch.direction ?? "desc"
  const page = listSearch.page ?? 1
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  // When the section opened, so each row's Showing or Ended is read once.
  const [openedAt] = React.useState(() => Date.now())

  // The announcements as the loader read them, then as changed here. A new
  // read from the loader replaces them.
  const [items, setItems] = React.useState(loaded)
  const [readFrom, setReadFrom] = React.useState(loaded)
  if (readFrom !== loaded) {
    setReadFrom(loaded)
    setItems(loaded)
  }

  const matching = React.useMemo(() => {
    const query = q.trim().toLowerCase()
    const found = items.filter(
      (item) =>
        (shows === "all" || announcementStatus(item, openedAt) === shows) &&
        (!query || item.title.toLowerCase().includes(query) || item.body.toLowerCase().includes(query))
    )
    const sign = direction === "asc" ? 1 : -1
    return found.sort((a, b) => sign * compareAnnouncements(a, b, sort))
  }, [items, q, shows, sort, direction, openedAt])
  const totalPages = Math.max(1, Math.ceil(matching.length / pageSize))
  const shown = matching.slice((page - 1) * pageSize, page * pageSize)
  const shownIds = shown.map((item) => item.id)
  const openId = listSearch.open ?? shownIds[0]
  const openAnnouncement = items.find((item) => item.id === openId) ?? null

  // A new one being written in the right panel, in place of the row open.
  const [drafting, setDrafting] = React.useState(false)
  // Whether the right panel holds changes not yet saved. Opening another
  // row, or a new one, asks before throwing them away.
  const dirty = React.useRef(false)
  const onDirtyChange = React.useCallback((next: boolean) => {
    dirty.current = next
  }, [])
  const [pendingSwitch, setPendingSwitch] = React.useState<(() => void) | null>(null)
  const guarded = (action: () => void) => {
    if (dirty.current) setPendingSwitch(() => action)
    else action()
  }
  const openRow = (id: string) =>
    guarded(() => {
      setDrafting(false)
      setOpen(id)
    })
  const startNew = () => guarded(() => setDrafting(true))

  // New announcement from the Admin header's +: a blank one opens here, and
  // the flag leaves the address once it has, so Back or a reload does not
  // open another.
  const [draftAsked, setDraftAsked] = React.useState(false)
  if (listSearch.draft && !draftAsked) {
    setDraftAsked(true)
    setDrafting(true)
  }
  React.useEffect(() => {
    if (listSearch.draft) setListSearch({ draft: undefined })
  }, [listSearch.draft, setListSearch])

  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const listKey = `${q}|${shows}|${sort}|${direction}|${page}|${pageSize}`
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
  const tickedCount = selection.selected.size
  const pageFullyTicked = shownIds.length > 0 && shownIds.every((id) => selection.selected.has(id))

  const [deleteTarget, setDeleteTarget] = React.useState<Announcement | null>(null)
  const closingDeleteTarget = useLastValue(deleteTarget)
  const [retireTarget, setRetireTarget] = React.useState<Announcement | null>(null)
  const closingRetireTarget = useLastValue(retireTarget)
  const [massAction, setMassAction] = React.useState<"retire" | "delete" | null>(null)
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [runOne, oneBusy] = useAsyncAction(getAnnouncementErrorMessage)
  const [runMass, massBusy] = useAsyncAction(getAnnouncementErrorMessage)

  /** Takes them off the list; an open one leaves the panel for the first row. */
  const removed = (ids: string[]) => {
    const gone = new Set(ids)
    setItems((current) => current.filter((item) => !gone.has(item.id)))
    selection.setSelected((current) => new Set([...current].filter((id) => !gone.has(id))))
    if (listSearch.open && gone.has(listSearch.open)) setListSearch({ open: undefined })
  }
  // A retire sets the end on the server; reading them again shows it.
  const readAgain = () => void router.invalidate()

  const saved = (announcement: Announcement) => {
    const known = items.some((item) => item.id === announcement.id)
    setItems((current) =>
      known ? current.map((item) => (item.id === announcement.id ? announcement : item)) : [announcement, ...current]
    )
    if (!known) {
      // The new one is the row open from now on.
      setDrafting(false)
      setOpen(announcement.id)
    }
  }

  const removeOne = () => {
    if (!deleteTarget) return
    const target = deleteTarget
    void runOne(async () => {
      await deleteAdminAnnouncements([target.id])
      removed([target.id])
      setDeleteTarget(null)
    }, "Announcement deleted.")
  }
  const retireOne = () => {
    if (!retireTarget) return
    const target = retireTarget
    void runOne(async () => {
      await retireAdminAnnouncements([target.id])
      setRetireTarget(null)
      readAgain()
    }, "Announcement retired.")
  }
  const runTicked = () => {
    const ids = [...selection.selected]
    const action = massAction
    void runMass(async () => {
      if (action === "delete") {
        await deleteAdminAnnouncements(ids)
        removed(ids)
      } else {
        await retireAdminAnnouncements(ids)
        readAgain()
      }
      selection.clear()
      setMassAction(null)
      toast.success(
        `${ids.length} ${plural(ids.length, "announcement", "announcements")} ${action === "delete" ? "deleted" : "retired"}.`
      )
    })
  }

  const toggleSort = useListSort<AnnouncementSortColumn>({ sort, direction }, (column) =>
    column === "starts" || column === "ends" ? "desc" : "asc"
  )
  const columns: TableHeaderColumn<AnnouncementSortColumn>[] = [
    { key: "title", label: "Announcement", column: "main", className: "min-w-40" },
    { key: "level", label: "Kind", column: "preview" },
    { key: "where", label: "Shows on", sortable: false, column: "preview", className: "hidden md:hidden @2xl:table-cell" },
    { key: "starts", label: "Starts", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
    { key: "ends", label: "Ends", column: "meta" },
  ]

  const rowMenuItems = (item: Announcement): RowMenuItem[] => [
    ...(announcementStatus(item, openedAt) === "ended"
      ? []
      : [{ label: "Retire now", icon: <ArchiveIcon className="size-4" />, onSelect: () => setRetireTarget(item) }]),
    {
      label: "Delete announcement",
      icon: <Trash2Icon className="size-4" />,
      destructive: true,
      onSelect: () => setDeleteTarget(item),
    },
  ]
  const rightClicked = rightClick ? items.find((item) => item.id === rightClick.id) : undefined

  return frame({
    header: (
      <CrmListHeader
        tabs={heading}
        end={headingEnd}
        selected={
          massSelect && tickedCount ? (
            <SelectedMenu
              count={tickedCount}
              busy={massBusy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <>
                  {pageFullyTicked && matching.length > tickedCount ? (
                    <SelectedMenuRow onClick={() => selection.setSelected(new Set(matching.map((item) => item.id)))}>
                      Tick all {matching.length} that match
                    </SelectedMenuRow>
                  ) : null}
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      setMassAction("retire")
                    }}
                  >
                    <ArchiveIcon className="size-4" />
                    Retire
                  </SelectedMenuRow>
                  <SelectedMenuRow
                    className="text-destructive"
                    onClick={() => {
                      menu.close()
                      setMassAction("delete")
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
            contentClassName="w-60"
            count={shows === "all" ? 0 : 1}
            onClear={() => setListSearch({ shows: undefined, page: undefined })}
            save={null}
          >
            <FilterRow id="admin-announcement-status" label="Status">
              <Select
                value={shows}
                onValueChange={(value) => setListSearch({ shows: value === "all" ? undefined : value, page: undefined })}
              >
                <SelectTrigger id="admin-announcement-status" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Every status</SelectItem>
                  {Object.entries(announcementStatusLabels).map(([value, label]) => (
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
          <DashboardToolbarButton type="button" aria-label="New announcement" onClick={startNew}>
            <PlusIcon className="size-4" />
            <span className="@max-3xl:sr-only">New announcement</span>
          </DashboardToolbarButton>
        }
        menuLabel="More for announcements"
        search={{
          name: "announcement-search",
          label: "Search announcements",
          placeholder: "Search announcements",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
      />
    ),
    middle: (
      <div className="@container flex min-h-0 flex-1 flex-col">
        <CrmTable<AnnouncementSortColumn>
          columns={columns}
          sort={sort}
          direction={direction}
          onSort={toggleSort}
          select={
            massSelect
              ? {
                  noun: "announcements",
                  disabled: shownIds.length === 0,
                  checked: selection.selectAllState(shownIds),
                  onToggle: () => selection.toggleVisible(shownIds),
                }
              : null
          }
          empty={
            shown.length > 0 ? null : q.trim() || shows !== "all" ? (
              <span className="grid justify-items-center gap-2">
                {q.trim() ? `No announcement matches "${q.trim()}".` : "No announcement matches."}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setListSearch({ q: undefined, shows: undefined, page: undefined })}
                >
                  Clear filters
                </Button>
              </span>
            ) : (
              "No announcements yet. New announcement writes the first one."
            )
          }
        >
          {shown.map((item) => {
            const status = announcementStatus(item, openedAt)
            return (
              <CrmTableRow
                key={item.id}
                open={!drafting && item.id === openId}
                label={quoteOneLine(item.title)}
                tick={
                  massSelect
                    ? { shown: true, ticked: selection.selected.has(item.id), onToggle: () => selection.toggle(item.id) }
                    : null
                }
                onOpen={() => openRow(item.id)}
                onDelete={() => setDeleteTarget(item)}
                onRightClick={(x, y) => setRightClick({ id: item.id, x, y })}
              >
                <TableCell column="main" className="w-full max-w-0 min-w-40">
                  <span className="flex min-w-0 items-center gap-2">
                    <OpenBar />
                    <Dot className={STATUS_DOT[status]} label={announcementStatusLabels[status]} />
                    <span data-row-name="" className="truncate font-medium">
                      {item.title}
                    </span>
                  </span>
                </TableCell>
                <TableCell column="preview">
                  <Chip>{announcementLevelLabels[item.level]}</Chip>
                </TableCell>
                <TableCell column="preview" className="hidden md:hidden @2xl:table-cell">
                  <span className="whitespace-nowrap text-muted-foreground">{whereText(item)}</span>
                </TableCell>
                <TableCell column="mutedMeta" className="hidden md:hidden @3xl:table-cell">
                  {formatUtcDate(item.startsAt)}
                </TableCell>
                <TableCell column="mutedMeta">{item.endsAt ? formatUtcDate(item.endsAt) : "Until retired"}</TableCell>
              </CrmTableRow>
            )
          })}
        </CrmTable>

        {totalPages > 1 || page > 1 ? (
          <div className="border-t">
            <DashboardTablePagination
              page={page}
              pageSize={pageSize}
              total={matching.length}
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
            massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(massSelect ? undefined : rightClick.id) }}
            items={rowMenuItems(rightClicked)}
            onClose={() => setRightClick(null)}
          />
        ) : null}
      </div>
    ),
    right: {
      label: "Announcement",
      content: (
        <AnnouncementPanel
          // Fresh per announcement, so the draft starts from the right one.
          key={drafting ? "new" : (openAnnouncement ? `${openAnnouncement.id}:${openAnnouncement.endsAt ?? ""}` : (openId ?? "none"))}
          announcement={drafting ? null : openAnnouncement}
          isNew={drafting}
          openId={openId}
          onDirtyChange={onDirtyChange}
          onSaved={saved}
          onRetired={readAgain}
          onRemoved={(id) => removed([id])}
        />
      ),
    },
    ids: shownIds,
    openId,
    windows: (
      <>
        <ConfirmDialog
          open={pendingSwitch !== null}
          onOpenChange={(open) => {
            if (!open) setPendingSwitch(null)
          }}
          title="Throw away your changes?"
          description="The announcement on the right has changes that are not saved yet."
          confirmLabel="Throw them away"
          onConfirm={() => {
            const action = pendingSwitch
            setPendingSwitch(null)
            dirty.current = false
            action?.()
          }}
        />
        <ConfirmDialog
          open={retireTarget !== null}
          onOpenChange={(open) => {
            if (!open) setRetireTarget(null)
          }}
          title="Take this announcement down?"
          description={
            closingRetireTarget
              ? `${quoteOneLine(closingRetireTarget.title)} disappears from everyone's banner straight away. Notices already in people's trays stay there, and you can put it back up by giving it a new end date.`
              : null
          }
          confirmLabel="Retire"
          destructive={false}
          loading={oneBusy}
          onConfirm={retireOne}
        />
        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null)
          }}
          title="Delete this announcement?"
          description={
            closingDeleteTarget
              ? `${quoteOneLine(closingDeleteTarget.title)} disappears from everyone's banner and from their notification tray. This cannot be undone.`
              : null
          }
          confirmLabel="Delete announcement"
          loading={oneBusy}
          onConfirm={removeOne}
        />
        <ConfirmDialog
          open={massAction !== null}
          onOpenChange={(open) => {
            if (!open) setMassAction(null)
          }}
          title={
            massAction === "delete"
              ? `Delete ${tickedCount} ${plural(tickedCount, "announcement", "announcements")}?`
              : `Take ${tickedCount} ${plural(tickedCount, "announcement", "announcements")} down?`
          }
          description={
            massAction === "delete"
              ? "They disappear from everyone's banner and notification tray. This cannot be undone."
              : "They disappear from everyone's banner straight away. Notices already in trays stay there."
          }
          confirmLabel={massAction === "delete" ? "Delete" : "Retire"}
          destructive={massAction === "delete"}
          loading={massBusy}
          onConfirm={runTicked}
        />
      </>
    ),
  })
}

/** The order of two by one column, before the direction is applied. */
function compareAnnouncements(a: Announcement, b: Announcement, sort: AnnouncementSortColumn) {
  if (sort === "title") return a.title.localeCompare(b.title)
  if (sort === "level") return ANNOUNCEMENT_LEVELS.indexOf(a.level) - ANNOUNCEMENT_LEVELS.indexOf(b.level)
  if (sort === "ends") {
    // One with no end runs longest, so it sorts after every dated one.
    if (!a.endsAt || !b.endsAt) return Number(!a.endsAt) - Number(!b.endsAt)
    return Date.parse(a.endsAt) - Date.parse(b.endsAt)
  }
  return Date.parse(a.startsAt) - Date.parse(b.startsAt)
}
