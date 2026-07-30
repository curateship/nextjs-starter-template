import * as React from "react"
import { AlertCircleIcon, UsersIcon } from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarSearch } from "@/components/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"
import {
  getContactsErrorMessage,
  listWorkspaceContacts,
  type ContactItem,
} from "@/lib/api/contacts"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { useShellRuntime } from "@/components/shell-layout"

const pageSizeOptions = [...DASHBOARD_ROWS_PER_PAGE_OPTIONS]

type ContactSortColumn = "email" | "name" | "source" | "status" | "created"

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

export function ContactsPage() {
  const { config } = useShellRuntime()
  const [contacts, setContacts] = React.useState<ContactItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [sortColumn, setSortColumn] =
    React.useState<ContactSortColumn>("created")
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>("desc")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim())
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  React.useEffect(() => {
    let active = true

    listWorkspaceContacts({
      search: debouncedSearch || undefined,
      page: currentPage - 1,
      pageSize,
    })
      .then((data) => {
        if (!active) return
        setContacts(data.contacts)
        setTotal(data.total)
        setError(null)
      })
      .catch((loadError) => {
        if (!active) return
        setError(getContactsErrorMessage(loadError))
      })

    return () => {
      active = false
    }
  }, [debouncedSearch, currentPage, pageSize])

  const sortedContacts = React.useMemo(() => {
    const rows = [...contacts]
    const direction = sortDirection === "asc" ? 1 : -1
    rows.sort((a, b) => {
      const left = sortValue(a, sortColumn)
      const right = sortValue(b, sortColumn)
      return left.localeCompare(right) * direction
    })
    return rows
  }, [contacts, sortColumn, sortDirection])

  const toggleSort = (column: ContactSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDirection(column === "created" ? "desc" : "asc")
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="w-full pb-8">
      {error ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <DashboardTable
        title="Contacts"
        icon={
          <UsersIcon className="text-muted-foreground" />
        }
        count={total}
        controls={
          <DashboardToolbarSearch
            name="contacts-search"
            aria-label="Search contacts"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">
                <TableSortButton
                  active={sortColumn === "email"}
                  direction={sortDirection}
                  onClick={() => toggleSort("email")}
                >
                  Email
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "name"}
                  direction={sortDirection}
                  onClick={() => toggleSort("name")}
                >
                  Name
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Tags</TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                <TableSortButton
                  active={sortColumn === "source"}
                  direction={sortDirection}
                  onClick={() => toggleSort("source")}
                >
                  Source
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sortColumn === "status"}
                  direction={sortDirection}
                  onClick={() => toggleSort("status")}
                >
                  Status
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                <TableSortButton
                  active={sortColumn === "created"}
                  direction={sortDirection}
                  onClick={() => toggleSort("created")}
                >
                  Created
                </TableSortButton>
              </TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={sortedContacts.length === 0}
        emptyText={
          debouncedSearch
            ? "No contacts match your search."
            : "No contacts yet. Connect an app on the Email settings page and send a signup."
        }
        emptyColSpan={6}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total,
          totalPages,
          onPageChange: setCurrentPage,
          onPageSizeChange: (size) => {
            setPageSize(size)
            setCurrentPage(1)
          },
          pageSizeOptions,
        }}
      >
        {sortedContacts.map((contact) => (
          <TableRow key={contact.id}>
            <TableCell column="main" className="font-medium">
              {contact.email}
            </TableCell>
            <TableCell column="meta" className="text-muted-foreground">
              {[contact.firstName, contact.lastName]
                .filter(Boolean)
                .join(" ") || "—"}
            </TableCell>
            <TableCell column="meta">
              {contact.tags.length ? (
                <div className="flex max-w-56 flex-wrap gap-1">
                  {contact.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell
              column="meta"
              className="hidden text-muted-foreground md:table-cell"
            >
              {contact.source ?? "—"}
            </TableCell>
            <TableCell column="meta">
              <Badge
                variant={
                  contact.status === "subscribed" ? "secondary" : "outline"
                }
              >
                {contact.status === "subscribed" ? "Subscribed" : "Unsubscribed"}
              </Badge>
            </TableCell>
            <TableCell
              column="meta"
              className="hidden text-muted-foreground lg:table-cell"
            >
              {dateFormatter.format(new Date(contact.created_at))}
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
    </div>
  )
}

function sortValue(contact: ContactItem, column: ContactSortColumn) {
  switch (column) {
    case "email":
      return contact.email
    case "name":
      return [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    case "source":
      return contact.source ?? ""
    case "status":
      return contact.status
    case "created":
      return contact.created_at
  }
}
