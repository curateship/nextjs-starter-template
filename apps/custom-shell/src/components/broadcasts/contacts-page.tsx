import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import {
  ListFilterIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  UsersIcon,
  UsersRoundIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"
import { plural } from "@/lib/format/plural"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { SegmentDialog } from "@/components/broadcasts/segment-dialog"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
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
  getContactLoadErrorMessage,
  loadContactsPage,
  saveContact,
  setContactsStatus,
  type ContactItem,
  type ContactSortColumn,
  type ContactsPage as ContactsPageData,
} from "@/lib/api/people/contacts"
import {
  addContactsToWorkspaceSegment,
  getSegmentErrorMessage,
} from "@/lib/api/people/contact-segments"
import { contactFilterOptions } from "@/lib/api/people/contacts"
import {
  contactSearchAffectsDisplayedTotal,
  segmentConditionsFromContactFilters,
} from "@/lib/contacts/contact-filter-segment"
import {
  describeSegmentCondition,
  segmentConditionIsComplete,
  type SegmentCondition,
  type SegmentRuleOptions,
} from "@/lib/contacts/contact-segments"
import { SegmentRuleBuilder } from "@/components/broadcasts/segment-rule-builder"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/format/format-time"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import { quoteOneLine } from "@/lib/format/quote-text"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"

const contactsRoute = getRouteApi("/_authenticated/admin/contacts")

/** One shared empty list, so "no filters" is the same object every render. */
const EMPTY_CONDITIONS: SegmentCondition[] = []

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

/**
 * Everyone a newsletter can go to, and the filters that narrow them down.
 *
 * The filters are written in exactly the rules a segment is — one builder for
 * both, so "the list I filtered down to" and "the segment I saved" describe
 * people in the same words rather than two languages that drift.
 *
 * Search, sort, page and the filters all live in the address, so a reload keeps
 * them and a filtered list is a link you can hand to somebody.
 */
export function ContactsPage({ data }: { data: ContactsPageData }) {
  const router = useRouter()
  const listSearch = contactsRoute.useSearch()
  const setListSearch = useListSearchNavigate()
  const searchQuery = listSearch.q ?? ""
  const conditions = listSearch.filter?.conditions ?? EMPTY_CONDITIONS
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
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const [filtersOpen, setFiltersOpen] = React.useState(false)
  const [segmentOpen, setSegmentOpen] = React.useState(false)
  const [segmentTotal, setSegmentTotal] = React.useState(data.total)
  const [runPrepareSegment, preparingSegment] = useAsyncAction(
    getContactLoadErrorMessage
  )
  const pageSize = data.pageSize

  /** Writing filters back to the address always returns to the first page. */
  const setConditions = React.useCallback(
    (next: SegmentCondition[]) =>
      setListSearch({
        filter: next.length ? { conditions: next } : undefined,
        page: undefined,
      }),
    [setListSearch]
  )

  /** Names for the "not in…" chips, so a rule reads as a name not an id. */
  const segmentNames = React.useMemo(
    () =>
      Object.fromEntries(
        data.segments.map((segment) => [segment.id, segment.name])
      ),
    [data.segments]
  )

  /** Every tag a rule is currently filtering on, so a row chip can light up. */
  const filteredTags = React.useMemo(() => {
    const tags = new Set<string>()
    for (const condition of conditions) {
      if (condition.type === "tag" && condition.operator === "includes") {
        condition.tags.forEach((tag) => tags.add(tag))
      }
    }
    return tags
  }, [conditions])

  /**
   * Clicking a tag on a row adds or removes it from the one "tagged any of"
   * rule, rather than starting a second filter of its own.
   */
  const toggleTagRule = React.useCallback(
    (tag: string) => {
      const at = conditions.findIndex(
        (condition) =>
          condition.type === "tag" && condition.operator === "includes"
      )
      if (at < 0) {
        setConditions([
          ...conditions,
          { type: "tag", operator: "includes", tags: [tag] },
        ])
        return
      }
      const existing = conditions[at]
      if (existing.type !== "tag") return
      const tags = existing.tags.includes(tag)
        ? existing.tags.filter((entry) => entry !== tag)
        : [...existing.tags, tag]
      setConditions(
        tags.length
          ? conditions.map((condition, index) =>
              index === at ? { ...existing, tags } : condition
            )
          : // The rule held only that tag, so taking it off takes the rule with
            // it — an empty tag rule would match nobody, which is not what
            // clicking a lit chip off means.
            conditions.filter((_, index) => index !== at)
      )
    },
    [conditions, setConditions]
  )
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
  /** Which hand-picked segment the ticked people would go into. */
  const [segmentTarget, setSegmentTarget] = React.useState("")
  const [runAdd, adding] = useAsyncAction(getSegmentErrorMessage)

  // Every value that changes which rows are on screen. Without this, ticking
  // five people and then changing a filter leaves "Delete (5)" meaning five
  // rows you can no longer see.
  useClearSelectionOnListChange(
    selection.setSelected,
    `${searchQuery}|${sort}|${direction}|${page}|${pageSize}|${JSON.stringify(conditions)}`
  )

  // Re-running the route loader is the refresh: it is what fetched these rows
  // in the first place, so asking it again is the one way to get fresh ones.
  const refresh = React.useCallback(async () => {
    try {
      await router.invalidate()
      dismissErrorToast()
    } catch (error) {
      showErrorToast(getContactErrorMessage(error))
    }
  }, [router])

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize))

  const handleAdd = async () => {
    if (saving) return
    if (!form.email.trim()) {
      showErrorToast("Email address is required.")
      return
    }
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

  /**
   * Puts the ticked people into a hand-picked segment.
   *
   * The sentence afterwards counts honestly: somebody who was already in the
   * segment is said so rather than being reported as added, because a number
   * that quietly includes them is one nobody can check.
   */
  const handleAddToSegment = async () => {
    if (adding || !selectedCount) return
    if (!segmentTarget) {
      showErrorToast("Pick the segment these people should go into.")
      return
    }
    const name =
      data.segments.find((segment) => segment.id === segmentTarget)?.name ??
      "that segment"

    await runAdd(async () => {
      const { added, alreadyThere } = await addContactsToWorkspaceSegment(
        segmentTarget,
        [...selection.selected]
      )
      selection.clear()
      setSegmentTarget("")
      toast.success(
        added === 0
          ? `Everybody picked was already in ${quoteOneLine(name)}.`
          : alreadyThere
            ? `${added} ${plural(added, "person", "people")} added to ${quoteOneLine(name)}. ${alreadyThere} ${alreadyThere === 1 ? "was" : "were"} already in it.`
            : `${added} ${plural(added, "person", "people")} added to ${quoteOneLine(name)}.`
      )
    })
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

  /**
   * Search is not a segment rule. When it is present, ask the existing list
   * endpoint for the filters-only count before opening so the window never
   * claims the narrower searched total belongs to the segment draft.
   */
  const openSegmentDraft = async () => {
    if (preparingSegment || conditions.length === 0) return
    if (!contactSearchAffectsDisplayedTotal(searchText, searchQuery)) {
      setSegmentTotal(data.total)
      setSegmentOpen(true)
      return
    }

    await runPrepareSegment(async () => {
      const result = await loadContactsPage({
        rules: { conditions },
        limit: 1,
      })
      setSegmentTotal(result.total)
      setSegmentOpen(true)
    })
  }

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
            {/* Only with people ticked, and only when there is a hand-picked
                segment to put them in — a dropdown with nothing in it is worse
                than no dropdown. */}
            {selectedCount && data.segments.length ? (
              <>
                <Select
                  value={segmentTarget}
                  onValueChange={setSegmentTarget}
                >
                  <DashboardToolbarSelectTrigger
                    aria-label="Segment to add these people to"
                    // Fixed rather than content-width: the toolbar would
                    // otherwise jump every time a different segment is picked,
                    // moving the button you are about to press.
                    className="w-44"
                  >
                    <SelectValue placeholder="Pick a segment…" />
                  </DashboardToolbarSelectTrigger>
                  <SelectContent>
                    {data.segments.map((segment) => (
                      <SelectItem key={segment.id} value={segment.id}>
                        {segment.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  disabled={adding}
                  onClick={() => void handleAddToSegment()}
                >
                  {adding ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <UsersRoundIcon className="size-4" />
                  )}
                  Add to segment ({selectedCount})
                </DashboardToolbarButton>
              </>
            ) : null}
            <DashboardToolbarSearch
              name="contact-search"
              aria-label="Search contacts"
              placeholder="Search contacts…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <DashboardToolbarButton
              type="button"
              variant="outline"
              onClick={() => setFiltersOpen(true)}
            >
              <ListFilterIcon className="size-4" />
              Filters{conditions.length ? ` (${conditions.length})` : ""}
            </DashboardToolbarButton>
            {conditions.length ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                disabled={preparingSegment}
                onClick={() => void openSegmentDraft()}
              >
                {preparingSegment ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <UsersRoundIcon className="size-4" />
                )}
                Save as segment
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarButton onClick={() => setAddOpen(true)}>
              <PlusIcon className="size-4" />
              Add someone
            </DashboardToolbarButton>
          </>
        }
        filters={
          conditions.length ? (
            <>
              {conditions.map((condition, index) => (
                <Badge key={index} variant="secondary" className="gap-1 pr-1">
                  {describeSegmentCondition(condition, segmentNames)}
                  <button
                    type="button"
                    className={cn("rounded-sm p-0.5 hover:bg-muted", focusRing)}
                    aria-label={`Take off the rule: ${describeSegmentCondition(condition, segmentNames)}`}
                    onClick={() => setConditions(conditions.filter((_, at) => at !== index))}
                  >
                    <XIcon className="size-3" />
                  </button>
                </Badge>
              ))}
              <button
                type="button"
                className={cn(
                  "rounded-sm text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground",
                  focusRing
                )}
                onClick={() => setConditions([])}
              >
                Clear all
              </button>
              {searchText.trim() ? (
                <span className="text-xs text-muted-foreground">
                  Search words will not be saved, only the filters.
                </span>
              ) : null}
            </>
          ) : null
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
          searchQuery.trim() || conditions.length
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
          onPageChange: (next) =>
            setPage(Math.max(1, Math.min(next, totalPages))),
          onPageSizeChange: (next) =>
            setListSearch({ size: next, page: undefined }),
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
                  {contact.tags.map((entry) => {
                    const on = filteredTags.has(entry)
                    return (
                      <button
                        key={entry}
                        type="button"
                        // Clicking a tag is the quick way to the same rule the
                        // Filters window writes — not a second kind of filter.
                        onClick={() => toggleTagRule(entry)}
                        title={
                          on
                            ? `Stop filtering by ${entry}`
                            : `Show only people tagged ${entry}`
                        }
                      >
                        <Badge variant={on ? "default" : "outline"}>
                          {entry}
                        </Badge>
                      </button>
                    )
                  })}
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
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void handleAdd()
            }}
          >
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
                    aria-invalid={!form.email.trim() || undefined}
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
              type="submit"
              disabled={saving}
            >
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Add contact
            </Button>
          </DialogFooter>
          </form>
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
        confirmLabel="Delete contact"
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
        confirmLabel={`Delete ${selectedCount} ${plural(selectedCount, "contact", "contacts")}`}
        loading={deleting}
        onConfirm={() =>
          void removeMany([...selection.selected], () =>
            setMassDeleteOpen(false)
          )
        }
      />

      <ContactFiltersDialog
        // Fresh per opening, so Cancel really does leave the list as it was.
        key={filtersOpen ? "open" : "closed"}
        open={filtersOpen}
        conditions={conditions}
        options={contactFilterOptions(data)}
        total={data.total}
        onClose={() => setFiltersOpen(false)}
        onApply={(next) => {
          setConditions(next)
          setFiltersOpen(false)
        }}
      />

      <SegmentDialog
        key={segmentOpen ? JSON.stringify(conditions) : "closed-segment"}
        open={segmentOpen}
        segment={null}
        options={contactFilterOptions(data)}
        prefill={{
          conditions: segmentConditionsFromContactFilters(conditions),
          total: segmentTotal,
          searchExcluded: Boolean(searchText.trim()),
        }}
        onClose={() => setSegmentOpen(false)}
        onSaved={async () => {
          setSegmentOpen(false)
          await refresh()
        }}
      />
    </>
  )
}

/**
 * The list's filters, written with the very same builder the segment window
 * uses. Nothing is applied until Apply — a list that reordered itself on every
 * half-typed rule would be unusable.
 */
function ContactFiltersDialog({
  open,
  conditions,
  options,
  total,
  onClose,
  onApply,
}: {
  open: boolean
  conditions: SegmentCondition[]
  options: SegmentRuleOptions
  /** How many people the list is showing behind this window. */
  total: number
  onClose: () => void
  onApply: (conditions: SegmentCondition[]) => void
}) {
  const [draft, setDraft] = React.useState(conditions)
  const dirty = JSON.stringify(draft) !== JSON.stringify(conditions)
  const unfinished = draft.some(
    (condition) => !segmentConditionIsComplete(condition)
  )

  const apply = () => {
    if (unfinished) {
      showErrorToast(
        "One of the rules is not finished. Fill it in or take it out."
      )
      return
    }
    onApply(draft)
  }

  return (
    <FormDialog open={open} dirty={dirty} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Filter contacts</DialogTitle>
            <DialogDescription>
              Every rule has to be true. These are the same rules a segment is
              written in, so a list you filter down to can be saved as one.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              apply()
            }}
          >
            <DialogBody>
              <SegmentRuleBuilder
                conditions={draft}
                onChange={setDraft}
                options={options}
                idPrefix="contact-filter"
                title="Rules"
                description={
                  conditions.length
                    ? `${total.toLocaleString()} ${plural(total, "person", "people")} match the filters on the list now.`
                    : "Nothing is filtered, so the list is showing everybody."
                }
                emptyText="No rules yet, so the list shows every contact you have."
              />
            </DialogBody>
            <DialogFooter>
              {draft.length ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mr-auto"
                  onClick={() => setDraft([])}
                >
                  Clear all
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit">Apply</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
