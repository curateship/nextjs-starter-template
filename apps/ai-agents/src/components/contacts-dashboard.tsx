import * as React from "react"
import {
  ListIcon,
  ListPlusIcon,
  ListXIcon,
  Loader2Icon,
  PhoneOffIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
  UsersIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorAlert } from "@/components/error-alert"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { ContactDetailModal } from "@/components/contact-detail-modal"
import { NewContactDialog } from "@/components/new-contact-dialog"
import {
  AddToListDialog,
  ManageListsDialog,
} from "@/components/contact-list-dialogs"
import { CsvImportDialog } from "@/components/csv-import-dialog"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getContactListErrorMessage,
  listContactLists,
  removeContactsFromList,
  type ContactListItem,
} from "@/lib/api/contact-lists"
import {
  bulkDeleteContacts,
  getContactErrorMessage,
  listContacts,
  type ContactItem,
} from "@/lib/api/contacts"
import { dateFormatter } from "@/lib/format"

const pageSizeOptions = [10, 20, 50]

function contactDisplayName(contact: ContactItem) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ")
}

function contactInitials(contact: ContactItem) {
  const first = contact.first_name[0] ?? ""
  const last = contact.last_name?.[0] ?? ""
  return `${first}${last}`.toUpperCase() || "?"
}

// Contacts CRM table: search, list filter, CSV import, create/edit,
// add-to-list, mass delete, detail drawer.
export function ContactsDashboard() {
  const [contacts, setContacts] = React.useState<ContactItem[]>([])
  const [lists, setLists] = React.useState<ContactListItem[]>([])
  const [activeListId, setActiveListId] = React.useState<string>("all")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[1])
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [deleteIds, setDeleteIds] = React.useState<string[] | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [removingFromList, setRemovingFromList] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [manageListsOpen, setManageListsOpen] = React.useState(false)
  const [addToListOpen, setAddToListOpen] = React.useState(false)
  const [detailContactId, setDetailContactId] = React.useState<string | null>(null)

  const fetchContacts = React.useCallback(async (listId: string) => {
    try {
      const data = await listContacts(listId === "all" ? null : listId)
      setContacts(data.contacts)
    } catch (loadError) {
      setError(getContactErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchLists = React.useCallback(async () => {
    try {
      const data = await listContactLists()
      setLists(data.lists)
    } catch (loadError) {
      setError(getContactListErrorMessage(loadError))
    }
  }, [])

  React.useEffect(() => {
    let active = true
    Promise.all([
      listContacts(null).then((data) => {
        if (active) setContacts(data.contacts)
      }),
      listContactLists().then((data) => {
        if (active) setLists(data.lists)
      }),
    ])
      .catch((loadError) => {
        if (active) setError(getContactErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Switching the list filter re-fetches scoped contacts and resets the view.
  function changeListFilter(value: string) {
    setActiveListId(value)
    setLoading(true)
    setCurrentPage(1)
    setSelectedIds(new Set())
    fetchContacts(value)
  }

  const filteredContacts = React.useMemo(() => {
    const query = searchQuery.toLowerCase()
    if (!query) return contacts
    return contacts.filter((contact) =>
      `${contactDisplayName(contact)} ${contact.phone} ${contact.email ?? ""}`
        .toLowerCase()
        .includes(query)
    )
  }, [contacts, searchQuery])

  const totalPages = Math.ceil(filteredContacts.length / pageSize)
  const paginatedContacts = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredContacts.slice(start, start + pageSize)
  }, [currentPage, filteredContacts, pageSize])

  function updateSearch(value: string) {
    setSearchQuery(value)
    setCurrentPage(1)
  }

  function toggleSelected(contactId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(contactId)) {
        next.delete(contactId)
      } else {
        next.add(contactId)
      }
      return next
    })
  }

  const visibleIds = paginatedContacts.map((contact) => contact.id)
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  function toggleVisibleSelected() {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  // Create + edit both land here: replace-or-insert keeps the table fresh.
  function upsertContact(contact: ContactItem) {
    setContacts((current) => {
      const exists = current.some((item) => item.id === contact.id)
      if (exists) {
        return current.map((item) => (item.id === contact.id ? contact : item))
      }
      return [contact, ...current]
    })
  }

  async function handleConfirmDelete() {
    if (!deleteIds?.length) return
    const ids = deleteIds
    setDeleting(true)
    setError(null)
    setNotice(null)
    try {
      const result = await bulkDeleteContacts(ids)
      setNotice(
        `Deleted ${result.deletedCount} ${result.deletedCount === 1 ? "contact" : "contacts"}.`
      )
      const removed = new Set(ids)
      setContacts((current) => current.filter((contact) => !removed.has(contact.id)))
      setSelectedIds((current) => {
        const next = new Set(current)
        ids.forEach((id) => next.delete(id))
        return next
      })
      setDeleteIds(null)
      fetchLists()
    } catch (deleteError) {
      setError(getContactErrorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  async function handleRemoveFromList() {
    if (activeListId === "all" || selectedIds.size === 0 || removingFromList) return
    setRemovingFromList(true)
    setError(null)
    setNotice(null)
    try {
      const ids = Array.from(selectedIds)
      const { removedCount } = await removeContactsFromList(activeListId, ids)
      setNotice(
        `Removed ${removedCount} ${removedCount === 1 ? "contact" : "contacts"} from the list.`
      )
      setSelectedIds(new Set())
      setLoading(true)
      fetchContacts(activeListId)
      fetchLists()
    } catch (removeError) {
      setError(getContactListErrorMessage(removeError))
    } finally {
      setRemovingFromList(false)
    }
  }

  const deleteCount = deleteIds?.length ?? 0
  const activeList = lists.find((list) => list.id === activeListId)

  const controls = (
    <>
      {selectedIds.size > 0 ? (
        <>
          <DashboardToolbarButton
            type="button"
            variant="destructive"
            onClick={() => setDeleteIds(Array.from(selectedIds))}
          >
            <Trash2Icon className="size-4" />
            Delete {selectedIds.size}
          </DashboardToolbarButton>
          <DashboardToolbarButton
            type="button"
            variant="outline"
            onClick={() => setAddToListOpen(true)}
          >
            <ListPlusIcon className="size-4" />
            Add to List
          </DashboardToolbarButton>
          {activeListId !== "all" ? (
            <DashboardToolbarButton
              type="button"
              variant="outline"
              disabled={removingFromList}
              onClick={handleRemoveFromList}
            >
              {removingFromList ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <ListXIcon className="size-4" />
              )}
              Remove from List
            </DashboardToolbarButton>
          ) : null}
        </>
      ) : null}
      <DashboardToolbarSearch
        name="contact-search"
        aria-label="Search contacts"
        placeholder="Search contacts..."
        value={searchQuery}
        onChange={(event) => updateSearch(event.target.value)}
      />
      <Select value={activeListId} onValueChange={changeListFilter}>
        <DashboardToolbarSelectTrigger aria-label="Filter by list">
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value="all">All contacts</SelectItem>
          {lists.map((list) => (
            <SelectItem key={list.id} value={list.id}>
              {list.name} ({list.member_count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DashboardToolbarButton
        type="button"
        variant="outline"
        onClick={() => setManageListsOpen(true)}
      >
        <ListIcon className="size-4" />
        Lists
      </DashboardToolbarButton>
      <DashboardToolbarButton
        type="button"
        variant="outline"
        onClick={() => setImportOpen(true)}
      >
        <UploadIcon className="size-4" />
        Import CSV
      </DashboardToolbarButton>
      <DashboardToolbarButton type="button" onClick={() => setCreateOpen(true)}>
        <PlusIcon className="size-4" />
        New Contact
      </DashboardToolbarButton>
    </>
  )

  return (
    <div className="w-full pb-8">
      {notice ? (
        <div className="mb-4 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </div>
      ) : null}
      {error ? (
        <ErrorAlert className="mb-4" message={error} />
      ) : null}

      <DashboardTable
        title={activeList ? `Contacts · ${activeList.name}` : "Contacts"}
        icon={<UsersIcon className="text-muted-foreground" />}
        count={filteredContacts.length}
        controls={controls}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleVisibleSelected}
                  aria-label="Select visible contacts"
                />
              </TableHead>
              <TableHead column="main">Contact</TableHead>
              <TableHead column="meta">Phone</TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                Tags
              </TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                Added
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={!loading && paginatedContacts.length === 0}
        emptyText={
          activeListId !== "all"
            ? "This list is empty. Select contacts and use Add to List, or import a CSV straight into it."
            : "No contacts yet. Add one manually or import a CSV."
        }
        emptyColSpan={6}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: filteredContacts.length,
          totalPages,
          pageSizeOptions,
          onPageChange: (page: number) =>
            setCurrentPage(Math.max(1, Math.min(page, totalPages || 1))),
          onPageSizeChange: (size: number) => {
            setPageSize(size)
            setCurrentPage(1)
          },
        }}
      >
        {paginatedContacts.map((contact) => (
          <ContactTableRow
            key={contact.id}
            contact={contact}
            selected={selectedIds.has(contact.id)}
            onToggle={() => toggleSelected(contact.id)}
            onOpen={() => setDetailContactId(contact.id)}
            onDelete={() => setDeleteIds([contact.id])}
          />
        ))}
      </DashboardTable>

      <NewContactDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(contact) => {
          upsertContact(contact)
          setNotice("Contact created.")
        }}
      />

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        lists={lists}
        onImported={() => {
          setLoading(true)
          fetchContacts(activeListId)
          fetchLists()
        }}
      />

      <ManageListsDialog
        open={manageListsOpen}
        onOpenChange={(open) => {
          setManageListsOpen(open)
          // The active list may have been renamed or deleted.
          if (!open && activeListId !== "all" && !lists.some((l) => l.id === activeListId)) {
            changeListFilter("all")
          }
        }}
        lists={lists}
        onListsChanged={fetchLists}
      />

      <AddToListDialog
        open={addToListOpen}
        onOpenChange={setAddToListOpen}
        lists={lists}
        contactIds={Array.from(selectedIds)}
        onAdded={(listName, addedCount) => {
          setNotice(
            `Added ${addedCount} ${addedCount === 1 ? "contact" : "contacts"} to "${listName}".`
          )
          setSelectedIds(new Set())
          fetchLists()
        }}
      />

      <ContactDetailModal
        contact={contacts.find((contact) => contact.id === detailContactId) ?? null}
        onOpenChange={(open) => !open && setDetailContactId(null)}
        onContactChanged={upsertContact}
      />

      <ConfirmDeleteDialog
        open={!!deleteIds}
        title={`Delete ${deleteCount === 1 ? "Contact" : `${deleteCount} Contacts`}?`}
        description={`This removes ${deleteCount === 1 ? "the contact" : "these contacts"} and their notes and list memberships. Past calls keep their history.`}
        deleting={deleting}
        onOpenChange={(open) => !open && setDeleteIds(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function ContactTableRow({
  contact,
  selected,
  onToggle,
  onOpen,
  onDelete,
}: {
  contact: ContactItem
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <TableRow className="group" data-state={selected ? "selected" : undefined}>
      <TableCell column="select">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${contactDisplayName(contact)}`}
        />
      </TableCell>
      <TableCell column="main">
        <button
          type="button"
          className="flex min-w-0 items-center gap-3 text-left"
          onClick={onOpen}
        >
          <Avatar className="size-9">
            <AvatarFallback>{contactInitials(contact)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <span className="block max-w-full truncate font-medium group-hover:underline">
              {contactDisplayName(contact)}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {contact.email ?? "No email"}
            </span>
          </div>
          {contact.do_not_call ? (
            <Badge variant="destructive" className="ml-1 shrink-0 gap-1">
              <PhoneOffIcon className="size-3" />
              DNC
            </Badge>
          ) : null}
        </button>
      </TableCell>
      <TableCell column="meta">{contact.phone}</TableCell>
      <TableCell column="meta" className="hidden lg:table-cell">
        {contact.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {contact.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
            {contact.tags.length > 3 ? (
              <Badge variant="outline">+{contact.tags.length - 3}</Badge>
            ) : null}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {dateFormatter.format(new Date(contact.created_at))}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label={`Delete ${contactDisplayName(contact)}`}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
