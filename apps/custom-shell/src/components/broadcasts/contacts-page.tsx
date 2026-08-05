import * as React from "react"
import { Loader2Icon, PlusIcon, Trash2Icon, UsersIcon } from "lucide-react"
import { toast } from "sonner"
import { plural } from "@/lib/plural"

import { useShellRuntime } from "@/components/shell/shell-layout"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import {
  deleteContacts,
  getContactErrorMessage,
  loadContactsPage,
  saveContact,
  setContactsStatus,
  type ContactItem,
  type ContactSortColumn,
  type ContactsPage as ContactsPageData,
} from "@/lib/api/contacts"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { formatDate } from "@/lib/format-time"
import { quoteOneLine } from "@/lib/quote-text"
import { useLastValue } from "@/lib/use-last-value"
import { useAsyncAction } from "@/lib/use-async-action"
import { useSelection } from "@/lib/use-selection"
import { useTableSort } from "@/lib/use-table-sort"

function fullName(contact: ContactItem) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ")
}

/**
 * Why this contact gets mail or not, each reason in its own words: opting out
 * was their choice, bouncing and spam reports arrive from Resend by webhook.
 * "Put back" works on all three — an admin can always override.
 */
function contactStatusLabel(status: ContactItem["status"]) {
  switch (status) {
    case "subscribed":
      return "On the list"
    case "unsubscribed":
      return "Opted out"
    case "bounced":
      return "Bouncing"
    case "complained":
      return "Marked it spam"
  }
}

/** Everyone a newsletter can go to, and the tags that split them into groups. */
export function ContactsPage({ initial }: { initial: ContactsPageData }) {
  const { config } = useShellRuntime()
  const [data, setData] = React.useState(initial)
  const [search, setSearch] = React.useState("")
  const [tag, setTag] = React.useState<string | null>(null)
  const { sort, direction, toggleSort } = useTableSort<ContactSortColumn>("created", "desc", (column) => column === "created" ? "desc" : "asc")
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const [loading, setLoading] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)
  const [runSave, saving] = useAsyncAction(getContactErrorMessage)
  const [form, setForm] = React.useState({
    email: "",
    firstName: "",
    lastName: "",
    tags: "",
  })
  /** Anything typed into the add form, which closing would throw away. */
  const formDirty = Object.values(form).some((value) => value.trim())
  const [deleteTarget, setDeleteTarget] = React.useState<ContactItem | null>(
    null
  )
  const [runDelete, deleting] = useAsyncAction(getContactErrorMessage)
  const closingDeleteTarget = useLastValue(deleteTarget)
  const selection = useSelection()
  const [massDeleteOpen, setMassDeleteOpen] = React.useState(false)

  const refresh = React.useCallback(
    async (next: { search?: string; tag?: string | null; page?: number } = {}) => {
      const nextPage = next.page ?? page
      const nextSearch = next.search ?? search
      const nextTag = next.tag === undefined ? tag : next.tag
      setLoading(true)
      try {
        const fresh = await loadContactsPage({
          search: nextSearch || undefined,
          tag: nextTag ?? undefined,
          sort,
          direction,
          limit: pageSize,
          offset: (nextPage - 1) * pageSize,
        })
        setData(fresh)
        dismissErrorToast()
      } catch (error) {
        showErrorToast(getContactErrorMessage(error))
      } finally {
        setLoading(false)
      }
    },
    [direction, page, pageSize, search, sort, tag]
  )

  // The list is paged on the server, so every change to what is being asked
  // for goes back for a fresh page rather than filtering what is already here.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
      void refresh({ page: 1 })
    }, 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tag, pageSize, sort, direction])

  /** Same column flips the arrow; a new column starts ascending. */
  const totalPages = Math.max(1, Math.ceil(data.total / pageSize))

  const handleAdd = async () => {
    if (saving || !form.email.trim()) return
    await runSave(async () => {
      await saveContact({
        email: form.email.trim(),
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        tags: form.tags
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      })
      setAddOpen(false)
      setForm({ email: "", firstName: "", lastName: "", tags: "" })
      await refresh()
    }, `Added ${form.email.trim()}.`)
  }

  const handleToggleStatus = async (contact: ContactItem) => {
    const next = contact.status === "subscribed" ? "unsubscribed" : "subscribed"
    try {
      await setContactsStatus([contact.id], next)
      dismissErrorToast()
      toast.success(
        next === "unsubscribed"
          ? `${contact.email} will not get any more.`
          : `${contact.email} is back on the list.`
      )
      await refresh()
    } catch (error) {
      showErrorToast(getContactErrorMessage(error))
    }
  }

  /** Both the single row and the selection go through here. */
  const removeMany = async (ids: string[], done: () => void) => {
    if (deleting || ids.length === 0) return
    await runDelete(async () => {
      const { deleted } = await deleteContacts(ids)
      selection.clear()
      toast.success(
        `Deleted ${deleted} ${plural(deleted, "contact", "contacts")}.`
      )
      done()
      await refresh()
    })
  }

  const visibleIds = data.contacts.map((contact) => contact.id)
  const selectedCount = selection.selected.size

  return (
    <>
      <DashboardTable
        title="Contacts"
        icon={<UsersIcon />}
        count={data.total}
        selectedCount={selectedCount}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedCount ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => setMassDeleteOpen(true)}
              >
                <Trash2Icon className="size-4" />
                Delete ({selectedCount})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="contact-search"
              aria-label="Search contacts"
              placeholder="Search contacts…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <DashboardToolbarButton onClick={() => setAddOpen(true)}>
              <PlusIcon className="size-4" />
              Add someone
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select the contacts on this page"
                />
              </TableHead>
              <TableHead column="main">
                <TableSortButton
                  active={sort === "email"}
                  direction={direction}
                  onClick={() => toggleSort("email")}
                >
                  Email
                </TableSortButton>
              </TableHead>
              <TableHead column="meta" className="hidden sm:table-cell">
                <TableSortButton
                  active={sort === "name"}
                  direction={direction}
                  onClick={() => toggleSort("name")}
                >
                  Name
                </TableSortButton>
              </TableHead>
              {/* Tags are a list, so there is no single value to order by. */}
              <TableHead column="meta" className="hidden md:table-cell">Tags</TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">
                <TableSortButton
                  active={sort === "status"}
                  direction={direction}
                  onClick={() => toggleSort("status")}
                >
                  Status
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton
                  active={sort === "created"}
                  direction={direction}
                  onClick={() => toggleSort("created")}
                >
                  Added
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={data.contacts.length === 0}
        emptyText={
          search.trim() || tag
            ? "Nobody matches that."
            : "Nobody on the list yet. Everyone who signs up lands here."
        }
        emptyColSpan={7}
        footer={{
          type: "pagination",
          page,
          pageSize,
          total: data.total,
          totalPages,
          onPageChange: (next) => {
            const clamped = Math.max(1, Math.min(next, totalPages))
            setPage(clamped)
            void refresh({ page: clamped })
          },
          onPageSizeChange: (next) => {
            setPage(1)
            setPageSize(next)
          },
        }}
      >
        {data.contacts.map((contact) => (
          <TableRow key={contact.id} className="group">
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(contact.id)}
                onCheckedChange={() => selection.toggle(contact.id)}
                aria-label={`Select ${contact.email}`}
              />
            </TableCell>
            <TableCell column="main">
              <span className="block max-w-96 truncate font-medium" title={contact.email}>
                {contact.email}
              </span>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden sm:table-cell">
              <span className="flex items-center gap-2">
                <span className="truncate">{fullName(contact) || "—"}</span>
                {contact.isAccount ? (
                  <Badge variant="outline" className="shrink-0">
                    Account
                  </Badge>
                ) : null}
              </span>
            </TableCell>
            <TableCell column="meta" className="hidden md:table-cell">
              {contact.tags.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {contact.tags.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      onClick={() => setTag(tag === entry ? null : entry)}
                      title={
                        tag === entry
                          ? "Show everyone again"
                          : `Show only people tagged ${entry}`
                      }
                    >
                      <Badge variant={tag === entry ? "default" : "outline"}>
                        {entry}
                      </Badge>
                    </button>
                  ))}
                </span>
              )}
            </TableCell>
            <TableCell column="meta">
              <Badge
                variant={
                  contact.status === "subscribed" ? "secondary" : "destructive"
                }
              >
                {contactStatusLabel(contact.status)}
              </Badge>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {formatDate(contact.created_at)}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleToggleStatus(contact)}
                >
                  {contact.status === "subscribed" ? "Take off" : "Put back"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${contact.email}`}
                  onClick={() => setDeleteTarget(contact)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      {tag ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Showing only people tagged “{tag}”.{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => setTag(null)}
          >
            Show everyone
          </button>
        </p>
      ) : null}

      {/* FormDialog, not Dialog: this holds typed work, so Escape, the X and
          the backdrop all ask before throwing it away. */}
      <FormDialog
        open={addOpen}
        dirty={formDirty}
        busy={saving}
        onClose={() => setAddOpen(false)}
      >
        {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add someone</DialogTitle>
            <DialogDescription>
              Everyone with an account is already here. This is for somebody who
              has none. An address already on the list is updated rather than
              added twice.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="contact-email">Email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    autoFocus
                    value={form.email}
                    placeholder="ada@example.com"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-2">
                    <Label htmlFor="contact-first">First name</Label>
                    <Input
                      id="contact-first"
                      value={form.firstName}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          firstName: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="contact-last">Last name</Label>
                    <Input
                      id="contact-last"
                      value={form.lastName}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          lastName: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="contact-tags"
                    hint="Separate them with commas. Tags are how a newsletter goes to some people rather than everyone."
                  >
                    Tags
                  </FieldLabel>
                  <Input
                    id="contact-tags"
                    value={form.tags}
                    placeholder="customers, beta"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        tags: event.target.value,
                      }))
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              // The one close path, so Cancel asks the same question every
              // other way out of this window asks.
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || !form.email.trim()}
              onClick={() => void handleAdd()}
            >
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Add them
            </Button>
          </DialogFooter>
        </DialogContent>
        )}
      </FormDialog>

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
        confirmLabel="Delete them"
        loading={deleting}
        onConfirm={() =>
          void removeMany(deleteTarget ? [deleteTarget.id] : [], () =>
            setDeleteTarget(null)
          )
        }
      />

      <ConfirmDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        title={`Delete ${selectedCount} ${plural(selectedCount, "contact", "contacts")}?`}
        description="They come off the list for good, along with the record of what was already sent to them. To simply stop emailing them, use Take off instead."
        confirmLabel={`Delete ${selectedCount}`}
        loading={deleting}
        onConfirm={() =>
          void removeMany([...selection.selected], () =>
            setMassDeleteOpen(false)
          )
        }
      />

      {loading ? <span className="sr-only">Loading contacts…</span> : null}
    </>
  )
}
