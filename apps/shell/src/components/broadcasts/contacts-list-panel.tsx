import * as React from "react"
import { getRouteApi, useRouterState } from "@tanstack/react-router"
import { Loader2Icon, Trash2Icon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { ContactBulkMenu } from "@/components/broadcasts/contact-bulk-menu"
import { ContactFilterMenu } from "@/components/broadcasts/contact-filter-menu"
import { NewContactDropdown } from "@/components/broadcasts/new-contact-dropdown"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTablePagination } from "@/components/shared/dashboard-table"
import { MassSelectChip } from "@/components/shared/mass-select"
import { SearchToggle } from "@/components/shared/search-toggle"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import {
  contactFilterOptions,
  deleteContacts,
  getContactErrorMessage,
  setContactsStatus,
  type ContactItem,
  type ContactSortColumn,
  type ContactsPage,
} from "@/lib/api/people/contacts"
import type { SegmentItem } from "@/lib/api/people/contact-segments"
import {
  segmentStatusBadgeVariant,
  segmentStatusLabels,
  type SegmentCondition,
  type SegmentRules,
} from "@/lib/contacts/contact-segments"
import { CONTACT_SHORTCUTS, shortcutIsOn } from "@/lib/contacts/contact-shortcuts"
import { formatDate } from "@/lib/format/format-time"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useSearchBoxText } from "@/lib/nav/list-search"
import { cn } from "@/lib/utils"

const contactsRoute = getRouteApi("/_authenticated/admin/contacts")

/**
 * How many of somebody's tags a row draws before it stops counting.
 *
 * A cap, not a scrolling cell, because a table row is as tall as its tallest
 * cell. An imported contact carrying 74 tags made one row 74 lines high and
 * turned a list of twenty-five thousand people into a view of one. The rest
 * are one click away in the contact's own panel, where they can be edited.
 */
const TAGS_SHOWN_IN_A_ROW = 3

/**
 * The list's columns after Email. They hide by the panel's own width, not the
 * window's, because the panel is about half the window.
 */
const OTHER_COLUMNS: TableHeaderColumn<ContactSortColumn>[] = [
  { key: "name", label: "Name", column: "meta", className: "hidden @2xl/list:table-cell" },
  // Tags are a list, so there is no single value to order by.
  { key: "tags", label: "Tags", sortable: false, column: "meta", className: "hidden @4xl/list:table-cell" },
  // Off on a phone, where the open contact's header shows it.
  { key: "status", label: "Status", column: "meta", className: "hidden @md/list:table-cell" },
  { key: "emailed", label: "Last emailed", column: "meta", className: "hidden @5xl/list:table-cell" },
  { key: "created", label: "Added", column: "meta", className: "hidden @6xl/list:table-cell" },
]

function fullName(contact: ContactItem) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ")
}

/**
 * The middle panel: who the list is showing and how many, then the toolbar
 * (the "N selected" button while rows are ticked, search, Filter, New
 * contact), then the contacts, a page at a time.
 *
 * The tick boxes stay hidden until Mass select, beside the Email heading, is
 * pressed. Pressing a row opens that person in the right panel.
 */
export function ContactsListPanel({
  data,
  rules,
  openSegment,
  segmentChanged,
  openContactId,
  onRules,
  onOpenContact,
  onSaveAsSegment,
  onRefresh,
}: {
  data: ContactsPage
  rules: SegmentRules
  openSegment: SegmentItem | null
  segmentChanged: boolean
  openContactId: string | undefined
  onRules: (rules: SegmentRules) => void
  onOpenContact: (contactId: string | undefined) => void
  /** Opens the segment window holding these rules. */
  onSaveAsSegment: (rules: SegmentRules, searchExcluded: boolean) => void
  onRefresh: () => Promise<void>
}) {
  const routeLoading = useRouterState({ select: (state) => state.isLoading })
  const listSearch = contactsRoute.useSearch()
  const setListSearch = useListSearchNavigate()
  const searchQuery = listSearch.q ?? ""
  const [searchText, setSearchText] = useSearchBoxText(searchQuery, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )
  const sort: ContactSortColumn = listSearch.sort ?? "created"
  const direction = listSearch.direction ?? "desc"
  const toggleSort = useListSort<ContactSortColumn>(
    { sort, direction },
    (column) => (column === "created" ? "desc" : "asc")
  )
  const page = listSearch.page ?? 1
  const pageSize = data.pageSize
  const totalPages = Math.max(1, Math.ceil(data.total / pageSize))
  const conditions = rules.conditions

  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  // Every value that changes which rows are on screen, so ticks never point
  // at rows nobody can see any more.
  const listKey = `${searchQuery}|${sort}|${direction}|${page}|${pageSize}|${JSON.stringify(rules)}`
  useClearSelectionOnListChange(selection.setSelected, listKey)
  /**
   * Which list "everybody who matches" was picked for, or null. It stops
   * being true the moment the list changes, and is dropped while rendering so
   * no frame draws the old number over a new list.
   */
  const [matchingList, setMatchingList] = React.useState<string | null>(null)
  if (matchingList !== null && matchingList !== listKey) setMatchingList(null)
  const allMatching = matchingList === listKey

  const clearSelection = () => {
    setMatchingList(null)
    selection.clear()
  }
  const toggleMassSelect = () => {
    if (massSelect) clearSelection()
    setMassSelect(!massSelect)
  }

  /** Clicking a tag on a row adds it to, or takes it off, the one "tagged any of" rule. */
  const toggleTagRule = (tag: string) => {
    const at = conditions.findIndex(
      (condition) => condition.type === "tag" && condition.operator === "includes"
    )
    const next: SegmentCondition[] = [...conditions]
    if (at < 0) {
      next.push({ type: "tag", operator: "includes", tags: [tag] })
    } else {
      const existing = conditions[at]
      if (existing?.type !== "tag") return
      const tags = existing.tags.includes(tag)
        ? existing.tags.filter((entry) => entry !== tag)
        : [...existing.tags, tag]
      // A rule that held only that tag goes with it: an empty tag rule would
      // match nobody, which is not what clicking a lit chip off means.
      if (tags.length) next[at] = { ...existing, tags }
      else next.splice(at, 1)
    }
    onRules({ ...rules, conditions: next })
  }
  const filteredTags = new Set(
    conditions.flatMap((condition) =>
      condition.type === "tag" && condition.operator === "includes" ? condition.tags : []
    )
  )

  const [deleteTarget, setDeleteTarget] = React.useState<ContactItem | null>(null)
  const closingDeleteTarget = useLastValue(deleteTarget)
  const [runDelete, deleting] = useAsyncAction(getContactErrorMessage)

  const visibleIds = data.contacts.map((contact) => contact.id)
  const selectedIds = visibleIds.filter((id) => selection.selected.has(id))
  const pageFullyTicked = selection.selectAllState(visibleIds) === true

  const shortcut = CONTACT_SHORTCUTS.find((entry) => shortcutIsOn(entry, rules))
  const title = openSegment
    ? openSegment.name
    : conditions.length
      ? (shortcut?.label ?? "Filtered contacts")
      : "All contacts"

  const columns: TableHeaderColumn<ContactSortColumn>[] = [
    {
      key: "email",
      sortable: false,
      column: "main",
      // The preset 320px minimum is for a full page; this table sits in a panel.
      className: "group/title min-w-40",
      label: (
        <span className="flex items-center gap-2">
          <TableSortButton
            active={sort === "email"}
            direction={direction}
            onClick={() => toggleSort("email")}
          >
            Email
          </TableSortButton>
          <MassSelectChip on={massSelect} onToggle={toggleMassSelect} />
        </span>
      ),
    },
    ...OTHER_COLUMNS,
  ]

  return (
    <div className="@container/list flex min-h-0 flex-1 flex-col">
      <DashboardCardTitleHeader
        className="@container"
        icon={
          routeLoading ? (
            <Loader2Icon className="size-4 animate-spin" aria-label="Loading" />
          ) : (
            <UsersIcon className="size-4" />
          )
        }
        title={title}
        meta={`${data.total.toLocaleString()}${openSegment && segmentChanged ? " · rules changed" : ""}`}
        action={
          <div className="flex items-center gap-1">
            {massSelect && (selectedIds.length || allMatching) ? (
              <ContactBulkMenu
                selectedIds={selectedIds}
                allMatching={allMatching}
                total={data.total}
                offerAll={pageFullyTicked && data.total > visibleIds.length}
                filter={{
                  search: searchQuery.trim() || undefined,
                  rules: conditions.length ? rules : undefined,
                }}
                segments={data.segments}
                onSelectAllMatching={() => setMatchingList(listKey)}
                onDeleted={() => {
                  if (allMatching || (openContactId && selectedIds.includes(openContactId))) {
                    onOpenContact(undefined)
                  }
                }}
                onDone={clearSelection}
                onRefresh={onRefresh}
              />
            ) : null}
            <SearchToggle
              name="contact-search"
              label="Search contacts"
              placeholder="Search contacts"
              value={searchText}
              onChange={setSearchText}
            />
            <ContactFilterMenu
              rules={rules}
              options={contactFilterOptions(data)}
              total={data.total}
              searching={Boolean(searchQuery.trim())}
              openSegment={openSegment}
              segmentChanged={segmentChanged}
              onRules={onRules}
              onSaveAsSegment={(saved) => onSaveAsSegment(saved, Boolean(searchQuery.trim()))}
              onUpdated={onRefresh}
            />
            <NewContactDropdown
              knownTags={data.tags}
              onCreated={async (contactId) => {
                await onRefresh()
                onOpenContact(contactId)
              }}
            />
          </div>
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <Table
          containerClassName="overflow-visible"
          // Rows sit closer than a full-page table's (Tyler, 19 Oct 2026: "Reduce
          // the gap between the contact rows"), with buttons to match.
          className="[&_td]:py-1 [&_td:first-child]:pl-4 [&_td:last-child]:pr-3 [&_th:first-child]:pl-4 [&_th:last-child]:pr-3"
        >
          <SortableTableHeader
            columns={columns}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              massSelect ? (
                <SelectAllTableHead
                  noun="contacts"
                  disabled={visibleIds.length === 0}
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => {
                    setMatchingList(null)
                    selection.toggleVisible(visibleIds)
                  }}
                />
              ) : null
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
          <TableBody>
            {data.contacts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 2}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {searchQuery.trim() || conditions.length
                    ? "Nobody matches that."
                    : "Nobody on the list yet. Everyone who signs up lands here."}
                </TableCell>
              </TableRow>
            ) : (
              data.contacts.map((contact) => (
                <TableRow
                  key={contact.id}
                  className={cn("group", contact.id === openContactId && "bg-muted/60")}
                  rowAction={() => onOpenContact(contact.id)}
                >
                  {massSelect ? (
                    <TableCell column="select">
                      <Checkbox
                        checked={allMatching || selection.selected.has(contact.id)}
                        onCheckedChange={() => {
                          setMatchingList(null)
                          selection.toggle(contact.id)
                        }}
                        aria-label={`Select ${contact.email}`}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell column="main" className="min-w-40">
                    {/* The same action the row carries, so it is reachable by keyboard. */}
                    <button
                      type="button"
                      className="block max-w-80 truncate text-left font-medium group-hover:underline"
                      onClick={() => onOpenContact(contact.id)}
                    >
                      {contact.email}
                    </button>
                  </TableCell>
                  <TableCell column="mutedMeta" className="hidden @2xl/list:table-cell">
                    <span className="flex items-center gap-2">
                      <span className="truncate">{fullName(contact) || "None"}</span>
                      {contact.userId ? (
                        <Badge variant="outline" className="shrink-0">
                          Account
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell column="meta" className="hidden @4xl/list:table-cell">
                    {contact.tags.length === 0 ? (
                      <span className="text-muted-foreground">None</span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-1">
                        {contact.tags.slice(0, TAGS_SHOWN_IN_A_ROW).map((entry) => (
                          <button
                            key={entry}
                            type="button"
                            aria-pressed={filteredTags.has(entry)}
                            aria-label={
                              filteredTags.has(entry)
                                ? `Stop filtering by ${entry}`
                                : `Show only people tagged ${entry}`
                            }
                            onClick={() => toggleTagRule(entry)}
                          >
                            <Badge variant={filteredTags.has(entry) ? "default" : "outline"}>
                              {entry}
                            </Badge>
                          </button>
                        ))}
                        {contact.tags.length > TAGS_SHOWN_IN_A_ROW ? (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                            onClick={() => onOpenContact(contact.id)}
                          >
                            +{contact.tags.length - TAGS_SHOWN_IN_A_ROW} more
                          </button>
                        ) : null}
                      </span>
                    )}
                  </TableCell>
                  <TableCell column="meta" className="hidden @md/list:table-cell">
                    <Badge variant={segmentStatusBadgeVariant[contact.status]}>
                      {segmentStatusLabels[contact.status]}
                    </Badge>
                  </TableCell>
                  <TableCell column="mutedMeta" className="hidden @5xl/list:table-cell">
                    {/* "Never", not a dash: nothing sent to them is a real answer. */}
                    {contact.lastEmailedAt ? formatDate(contact.lastEmailedAt) : "Never"}
                  </TableCell>
                  <TableCell column="mutedMeta" className="hidden @6xl/list:table-cell">
                    {formatDate(contact.created_at)}
                  </TableCell>
                  <TableCell column="actions">
                    <ContactStatusButton contact={contact} onChanged={onRefresh} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${contact.email}`}
                      onClick={() => setDeleteTarget(contact)}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <div className="border-t">
        <DashboardTablePagination
          page={page}
          pageSize={pageSize}
          total={data.total}
          totalPages={totalPages}
          onPageChange={(next) => {
            const clamped = Math.max(1, Math.min(next, totalPages))
            setListSearch({ page: clamped > 1 ? clamped : undefined })
          }}
          onPageSizeChange={(next) => setListSearch({ size: next, page: undefined })}
        />
      </div>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={
          closingDeleteTarget
            ? `Delete ${quoteOneLine(closingDeleteTarget.email)}?`
            : "Delete this contact?"
        }
        description="They come off the list for good, along with the record of what was already sent to them. To simply stop emailing them, use Take off instead."
        confirmLabel="Delete contact"
        loading={deleting}
        onConfirm={() => {
          if (!deleteTarget) return
          const { id, email } = deleteTarget
          void runDelete(async () => {
            const { deleted } = await deleteContacts([id])
            setDeleteTarget(null)
            if (deleted) toast.success(`Deleted ${email}.`)
            if (id === openContactId) onOpenContact(undefined)
            await onRefresh()
          })
        }}
      />
    </div>
  )
}

/**
 * Take off or Put back, the row's quick status change. Gone quiet counts as
 * still being sent things, because they are: a quiet contact is in every
 * send's audience, which is the only way they can open something and come
 * back. So the button offers to take them off, not to put them back.
 */
function ContactStatusButton({
  contact,
  onChanged,
}: {
  contact: ContactItem
  onChanged: () => Promise<void>
}) {
  const [run, changing] = useAsyncAction(getContactErrorMessage)
  const mailable = contact.status === "subscribed" || contact.status === "cold"

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      // A narrow panel keeps the bin; the status is in the open contact's header.
      className="hidden @xl/list:inline-flex"
      disabled={changing}
      onClick={() =>
        void run(async () => {
          const next = mailable ? "unsubscribed" : "subscribed"
          await setContactsStatus([contact.id], next)
          toast.success(
            next === "unsubscribed"
              ? `${contact.email} will not get any more.`
              : `${contact.email} is back on the list.`
          )
          await onChanged()
        })
      }
    >
      {changing ? <Loader2Icon className="size-4 animate-spin" /> : null}
      {mailable ? "Take off" : "Put back"}
    </Button>
  )
}
