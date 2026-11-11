import * as React from "react"
import {
  HandshakeIcon,
  Trash2Icon,
  UserMinusIcon,
  UserPlusIcon,
} from "lucide-react"
import { toast } from "sonner"

import { ContactBulkMenu } from "@/components/broadcasts/contact-bulk-menu"
import { ContactFilterMenu } from "@/components/broadcasts/contact-filter-menu"
import { ContactImportDialog } from "@/components/broadcasts/contact-import"
import { NewContactDropdown } from "@/components/broadcasts/new-contact-dropdown"
import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, Dot, MainCell } from "@/components/crm/crm-table"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { TableCell, TableSortButton } from "@/components/ui/table"
import { DashboardTablePagination } from "@/components/shared/dashboard-table"
import { ViewMenu, type ViewChoice } from "@/components/shared/view-menu"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  contactFilterOptions,
  deleteContacts,
  getContactErrorMessage,
  setContactsStatus,
  type ContactItem,
  type ContactSortColumn,
  type ContactsPage,
} from "@/lib/api/people/contacts"
import { addSubscriberToLeads } from "@/lib/api/crm/leads"
import type { SegmentItem } from "@/lib/api/people/contact-segments"
import {
  segmentStatusDotClassName,
  segmentStatusLabels,
  type SegmentRules,
} from "@/lib/contacts/contact-segments"
import type { CrmPeopleSearch } from "@/lib/crm/crm-search"
import { formatInboxTime } from "@/lib/crm/inbox-time"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"

/** Tags a row shows before it stops; the rest are in the person's ⋮. */
const TAGS_SHOWN = 2

function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="text-muted-foreground">None</span>
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      {tags.slice(0, TAGS_SHOWN).map((tag) => (
        <Chip key={tag} muted>
          {tag}
        </Chip>
      ))}
      {tags.length > TAGS_SHOWN ? <span className="text-xs text-muted-foreground">+{tags.length - TAGS_SHOWN}</span> : null}
    </span>
  )
}

function fullName(contact: ContactItem) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ")
}

/**
 * The People tab's middle panel: everybody as rows of the CRM's one shape
 * (`CrmTable`), laid out the way Project lays out its tasks (Tyler, 7 Nov 2026).
 *
 * - **Header:** the CRM's one header. "N selected" while contacts are ticked,
 *   then the search box, Select, Filter (the segment rules), and New contact,
 *   which offers Add a contact and Upload a CSV file. No ⋮: the sample file
 *   was taken off (Tyler, 9 Nov 2026: "Remove the download sample file
 *   feature").
 * - **Pills:** All, Leads, Subscribers, Opted out, then each segment.
 * - **Rows:** the name and when they were added; the address; then which
 *   kind they are ("Lead", "Lead + Subscriber", or their list status), a
 *   lead's stage, and their first tags.
 * - **Right-click:** Mass select, then Take off or Put back on the list and
 *   Delete.
 *
 * Only contacts are ticked: every bulk change is a change to the mailing list,
 * and a lead is not on it.
 */
export function CrmPeopleList({
  data,
  listSearch,
  heading,
  headingEnd,
  pills,
  pill,
  onPill,
  rules,
  openSegment,
  segmentChanged,
  openId,
  onRules,
  onOpen,
  onSaveAsSegment,
  onRefresh,
  onOpenLead,
}: {
  data: ContactsPage
  listSearch: CrmPeopleSearch
  /** The start of the header: the section's icon and name. */
  heading: React.ReactNode
  /** The end of the header: the button that reopens a shut right panel. */
  headingEnd: React.ReactNode
  pills: ViewChoice[]
  /** Which pill is lit, or "" when Filter's rules match none of them. */
  pill: string
  onPill: (value: string) => void
  rules: SegmentRules
  openSegment: SegmentItem | null
  segmentChanged: boolean
  /** The contact or lead open on the right. */
  openId: string | undefined
  onRules: (rules: SegmentRules) => void
  onOpen: (id: string | undefined) => void
  onSaveAsSegment: (rules: SegmentRules, searchExcluded: boolean) => void
  onRefresh: () => Promise<void>
  /** Opens a lead in the Leads section. */
  onOpenLead: (leadId: string) => void
}) {
  const setListSearch = useListSearchNavigate()
  const searchQuery = listSearch.q ?? ""
  const page = listSearch.page ?? 1
  const pageSize = data.pageSize
  const totalPages = Math.max(1, Math.ceil(data.total / pageSize))
  const conditions = rules.conditions

  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const listKey = `${searchQuery}|${listSearch.sort}|${listSearch.direction}|${page}|${pageSize}|${JSON.stringify(rules)}`
  useClearSelectionOnListChange(selection.setSelected, listKey)
  // "Everybody who matches" was picked for this list, or null. It stops being
  // true the moment the list changes.
  const [matchingList, setMatchingList] = React.useState<string | null>(null)
  if (matchingList !== null && matchingList !== listKey) setMatchingList(null)
  const allMatching = matchingList === listKey
  const clearSelection = () => {
    setMatchingList(null)
    selection.clear()
  }
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      clearSelection()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }

  const sort: ContactSortColumn = (listSearch.sort as ContactSortColumn | undefined) ?? "created"
  const direction = listSearch.direction ?? "desc"
  const toggleSort = useListSort<ContactSortColumn>(
    { sort, direction },
    (column) => (column === "created" ? "desc" : "asc")
  )
  // The columns, as Project's list has them: the person, then their facts as
  // chips. They drop out as the panel narrows, the address first back to last.
  const columns: TableHeaderColumn<ContactSortColumn | "kind" | "tags" | "opened">[] = [
    {
      key: "name",
      sortable: false,
      column: "main",
      className: "min-w-40",
      label: (
        <TableSortButton active={sort === "name"} direction={direction} onClick={() => toggleSort("name")}>
          Person
        </TableSortButton>
      ),
    },
    { key: "email", label: "Email", column: "preview", className: "hidden md:hidden @xl:table-cell" },
    { key: "status", label: "Status", column: "preview", className: "hidden md:hidden @4xl:table-cell" },
    // Each column shows only once the middle is wide enough for every one
    // before it as well, so the table never runs past the panel. `md:hidden`
    // takes away a preview column's own `md:table-cell`, which would show it
    // on any laptop otherwise, as on the Admin lists.
    { key: "tags", label: "Tags", sortable: false, column: "preview", className: "hidden md:hidden @5xl:table-cell" },
    { key: "opened", label: "Opened", sortable: false, column: "meta", className: "hidden @6xl:table-cell" },
    { key: "created", label: "Added", column: "meta" },
  ]
  const contactById = new Map(data.contacts.map((contact) => [contact.id, contact]))
  const visibleIds = data.contacts.map((contact) => contact.id)
  const selectedIds = visibleIds.filter((id) => selection.selected.has(id))
  const pageFullyTicked = visibleIds.length > 0 && selectedIds.length === visibleIds.length

  const [importOpen, setImportOpen] = React.useState(false)
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<ContactItem | null>(null)
  const closingDeleteTarget = useLastValue(deleteTarget)
  const [runDelete, deleting] = useAsyncAction(getContactErrorMessage)
  const [runRow] = useAsyncAction(getContactErrorMessage)

  const flipContact = (contact: ContactItem) =>
    void runRow(async () => {
      const mailable = contact.status === "subscribed" || contact.status === "cold"
      await setContactsStatus([contact.id], mailable ? "unsubscribed" : "subscribed")
      toast.success(mailable ? `${contact.email} will not get any more.` : `${contact.email} is back on the list.`)
      await onRefresh()
    })

  const rowMenuItems = (id: string): RowMenuItem[] => {
    const contact = contactById.get(id)
    if (!contact) return []
    const mailable = contact.status === "subscribed" || contact.status === "cold"
    return [
      {
        label: mailable ? "Take off the list" : "Put back on the list",
        icon: mailable ? <UserMinusIcon className="size-4" /> : <UserPlusIcon className="size-4" />,
        onSelect: () => flipContact(contact),
      },
      // A subscriber can be a lead too (Tyler, 9 Nov 2026: "in subscribers, I
      // should be able to right click and add subscriber to lead as well").
      // They stay here; the toast's Open shows the lead.
      {
        label: "Add to leads",
        icon: <HandshakeIcon className="size-4" />,
        onSelect: () =>
          void runRow(async () => {
            const { leadId, existed } = await addSubscriberToLeads(contact.id)
            toast.success(existed ? `${contact.email} is already a lead.` : `${contact.email} is now a lead too.`, {
              action: { label: "Open", onClick: () => onOpenLead(leadId) },
            })
            await onRefresh()
          }),
      },
      { label: "Delete contact", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => setDeleteTarget(contact) },
    ]
  }

  return (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={heading}
        end={headingEnd}
        selected={
          massSelect && (selectedIds.length || allMatching) ? (
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
                if (allMatching || (openId && selectedIds.includes(openId))) onOpen(undefined)
              }}
              onDone={clearSelection}
              onRefresh={onRefresh}
            />
          ) : null
        }
        filter={
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
        }
        view={
          <ViewMenu label="Which people" value={pill} onValueChange={onPill} choices={pills} />
        }
        primary={
          <NewContactDropdown
            knownTags={data.tags}
            onCreated={async (contactId) => {
              await onRefresh()
              onOpen(contactId)
            }}
            onImport={() => setImportOpen(true)}
          />
        }
        menuLabel="More for people"
        search={{
          name: "people-search",
          label: "Search people",
          placeholder: "Search people",
          value: searchQuery,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
      />

      <CrmTable<ContactSortColumn | "kind" | "tags" | "opened">
        columns={columns}
        sort={sort}
        direction={direction}
        // Only the real columns get a sort button; the others are drawn plain.
        onSort={(column) => toggleSort(column as ContactSortColumn)}
        select={
          massSelect
            ? {
                noun: "contacts",
                disabled: visibleIds.length === 0,
                checked: selection.selectAllState(visibleIds),
                onToggle: () => {
                  setMatchingList(null)
                  selection.toggleVisible(visibleIds)
                },
              }
            : null
        }
        empty={
          data.contacts.length > 0 ? null : searchQuery.trim() || conditions.length ? (
            <span className="grid justify-items-center gap-2">
              {searchQuery.trim() ? `Nobody matches "${searchQuery.trim()}".` : "Nobody matches."}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setListSearch({ q: undefined, filter: undefined, segment: undefined, page: undefined })}
              >
                Clear filters
              </Button>
            </span>
          ) : (
            "No subscribers yet. New contact adds one or imports a CSV file; accounts are not on this list."
          )
        }
      >
        {data.contacts.map((contact) => {
          const name = fullName(contact) || contact.email
          return (
            <CrmTableRow
              key={contact.id}
              open={contact.id === openId}
              label={name}
              tick={{
                shown: massSelect,
                ticked: allMatching || selection.selected.has(contact.id),
                onToggle: () => {
                  setMatchingList(null)
                  selection.toggle(contact.id)
                },
              }}
              onOpen={() => onOpen(contact.id)}
              onDelete={() => setDeleteTarget(contact)}
              onRightClick={(x, y) => setRightClick({ id: contact.id, x, y })}
            >
              <MainCell
                name={name}
                avatar={{ name: fullName(contact), email: contact.email }}
                lead={<Dot className={segmentStatusDotClassName[contact.status]} label={segmentStatusLabels[contact.status]} />}
              />
              <TableCell column="preview" className="hidden md:hidden @xl:table-cell">
                <span className="block max-w-64 truncate text-muted-foreground">{contact.email}</span>
              </TableCell>
              <TableCell column="preview" className="hidden md:hidden @4xl:table-cell">
                <Chip muted>{segmentStatusLabels[contact.status]}</Chip>
              </TableCell>
              <TableCell column="preview" className="hidden md:hidden @5xl:table-cell">
                <TagChips tags={contact.tags} />
              </TableCell>
              <TableCell column="mutedMeta" className="hidden @6xl:table-cell">
                {contact.emailsSent ? `Opened ${contact.emailsOpened} of ${contact.emailsSent}` : "Not sent any"}
              </TableCell>
              <TableCell column="mutedMeta">{formatInboxTime(contact.created_at)}</TableCell>
            </CrmTableRow>
          )
        })}
      </CrmTable>

      {totalPages > 1 || page > 1 ? (
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
      ) : null}

      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{
            on: massSelect,
            onToggle: () =>
              toggleMassSelect(
                !massSelect ? rightClick.id : undefined
              ),
          }}
          items={rowMenuItems(rightClick.id)}
          onClose={() => setRightClick(null)}
        />
      ) : null}

      {importOpen ? (
        <ContactImportDialog knownTags={data.tags} onClose={() => setImportOpen(false)} onImported={onRefresh} />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={closingDeleteTarget ? `Delete ${quoteOneLine(closingDeleteTarget.email)}?` : "Delete this contact?"}
        description="They come off the list for good, along with the record of what was already sent to them. To simply stop emailing them, use Take off the list instead."
        confirmLabel="Delete contact"
        loading={deleting}
        onConfirm={() => {
          if (!deleteTarget) return
          const { id, email } = deleteTarget
          void runDelete(async () => {
            const { deleted } = await deleteContacts([id])
            setDeleteTarget(null)
            if (deleted) toast.success(`Deleted ${email}.`)
            if (id === openId) onOpen(undefined)
            await onRefresh()
          })
        }}
      />
    </div>
  )
}
