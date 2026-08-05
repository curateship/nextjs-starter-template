import * as React from "react"
import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router"
import { format } from "date-fns"
import {
  EyeOffIcon,
  Loader2Icon,
  MegaphoneIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { useShellRuntime } from "@/components/shell/shell-layout"
import {
  ANNOUNCEMENT_LEVELS,
  announcementLevelLabels,
  DEFAULT_ANNOUNCEMENT_LEVEL,
  type AnnouncementLevel,
} from "@/lib/announcement"
import {
  createAdminAnnouncement,
  deleteAdminAnnouncements,
  getAnnouncementErrorMessage,
  retireAdminAnnouncements,
  updateAdminAnnouncement,
  type Announcement,
} from "@/lib/api/announcements"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { formatUtcDate } from "@/lib/format-time"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/list-search"
import { quoteOneLine } from "@/lib/quote-text"
import { useClearSelectionOnListChange } from "@/lib/use-clear-selection"
import { useOpenFromLink } from "@/lib/use-open-from-link"
import { useSelection } from "@/lib/use-selection"

const announcementsRoute = getRouteApi("/_authenticated/admin/announcements")

type AnnouncementSortColumn = "title" | "where" | "status" | "shows"

const ANNOUNCEMENT_COLUMNS: SortableColumn<AnnouncementSortColumn>[] = [
  { key: "title", label: "Announcement", column: "main" },
  { key: "where", label: "Where", column: "meta" },
  { key: "status", label: "Status", column: "meta" },
  { key: "shows", label: "Shows", column: "meta" },
]

/** Showing first, then what is still coming, then what is over. */
type AnnouncementStatus = "showing" | "scheduled" | "ended"

const statusRank: Record<AnnouncementStatus, number> = {
  showing: 0,
  scheduled: 1,
  ended: 2,
}

const statusLabels: Record<AnnouncementStatus, string> = {
  showing: "Showing",
  scheduled: "Scheduled",
  ended: "Ended",
}

function announcementStatus(
  announcement: Announcement,
  nowMs: number
): AnnouncementStatus {
  const endsAt = announcement.endsAt ? Date.parse(announcement.endsAt) : null
  if (endsAt !== null && endsAt <= nowMs) return "ended"
  if (Date.parse(announcement.startsAt) > nowMs) return "scheduled"
  return "showing"
}

/** "Banner", "Tray", or both — where this one actually reaches people. */
function channelLabels(announcement: Announcement) {
  return [
    ...(announcement.showBanner ? ["Banner"] : []),
    ...(announcement.notify ? ["Tray"] : []),
  ]
}

/** The window in words: dates are whole days, kept in UTC so they never shift. */
function windowText(announcement: Announcement) {
  const from = formatUtcDate(announcement.startsAt)
  return announcement.endsAt
    ? `${from} – ${formatUtcDate(announcement.endsAt)}`
    : `${from} – until retired`
}

/** The ISO timestamp back as the whole day it belongs to, for the date picker. */
function toDateField(value: string | null) {
  return value ? value.slice(0, 10) : ""
}

function compareAnnouncements(
  a: Announcement,
  b: Announcement,
  column: AnnouncementSortColumn,
  nowMs: number
) {
  switch (column) {
    case "where":
      return channelLabels(a).join().localeCompare(channelLabels(b).join())
    case "status":
      return (
        statusRank[announcementStatus(a, nowMs)] -
        statusRank[announcementStatus(b, nowMs)]
      )
    case "shows":
      return Date.parse(a.startsAt) - Date.parse(b.startsAt)
    default:
      return a.title.localeCompare(b.title)
  }
}

/**
 * Where an app-wide broadcast is written. What people actually see is the
 * banner across the top of the shell (`components/shell/announcement-banner`)
 * and the notice in their tray — an admin reading either sees exactly what
 * everybody else does.
 */
export function AdminAnnouncementsDashboard({
  announcements,
  openId,
}: {
  announcements: Announcement[]
  /** One announcement named by the link that brought us here. */
  openId?: string
}) {
  const { config } = useShellRuntime()
  const router = useRouter()
  const navigate = useNavigate()
  // Search, sort and page live in the address, so Back returns this exact
  // list — see `lib/list-search.ts`.
  const listSearch = announcementsRoute.useSearch()
  const setListSearch = useListSearchNavigate()
  const searchQuery = listSearch.q ?? ""
  const currentPage = listSearch.page ?? 1
  const setCurrentPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const [searchText, setSearchText] = useSearchBoxText(searchQuery, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )

  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const sort: AnnouncementSortColumn = listSearch.sort ?? "shows"
  const direction = listSearch.direction ?? "desc"
  const toggleSort = useListSort<AnnouncementSortColumn>({ sort, direction })
  const [editing, setEditing] = React.useState<Announcement | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [retireTargets, setRetireTargets] = React.useState<Announcement[]>([])
  const [retiring, setRetiring] = React.useState(false)
  const [deleteTargets, setDeleteTargets] = React.useState<Announcement[]>([])
  const [deleting, setDeleting] = React.useState(false)
  const selection = useSelection()
  const selectedIds = selection.selected
  const [error, setError] = React.useState<string | null>(null)
  const setOpenAnnouncement = React.useCallback(
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
  const openAnnouncement = React.useCallback(
    (announcement: Announcement) => {
      setEditing(announcement)
      setOpenAnnouncement(announcement.id)
    },
    [setOpenAnnouncement]
  )

  useOpenFromLink({ openId, records: announcements, onOpen: setEditing })
  React.useEffect(() => {
    if (!openId && !creating) setEditing(null)
  }, [creating, openId])

  // One reading of the clock, taken once. Every row's status and the sort then
  // agree with each other, and — because a fresh number on every render would
  // be a fresh dependency on every render — the memos below actually hold.
  // Statuses are whole days, so a value fixed when the page opens is honest.
  const [nowMs] = React.useState(() => Date.now())

  const sortedAnnouncements = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    const query = searchQuery.trim().toLowerCase()
    return announcements
      .filter(
        (announcement) =>
          !query ||
          announcement.title.toLowerCase().includes(query) ||
          announcement.body.toLowerCase().includes(query)
      )
      .sort((a, b) => factor * compareAnnouncements(a, b, sort, nowMs))
  }, [announcements, direction, nowMs, searchQuery, sort])

  const totalPages = Math.ceil(sortedAnnouncements.length / pageSize)
  const paginatedAnnouncements = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return sortedAnnouncements.slice(startIndex, startIndex + pageSize)
  }, [currentPage, pageSize, sortedAnnouncements])

  // Changing how many rows fit can leave you past the end; the address already
  // drops the page when the search or sort changes.
  React.useEffect(() => {
    setCurrentPage(1)
  }, [pageSize, setCurrentPage])

  useClearSelectionOnListChange(
    selection.setSelected,
    `${searchQuery}|${sort}|${direction}|${currentPage}|${pageSize}`
  )

  const visibleIds = React.useMemo(
    () => paginatedAnnouncements.map((announcement) => announcement.id),
    [paginatedAnnouncements]
  )

  // Re-running the route loader is the refresh, not a fetch of our own. The
  // shell loads its banner and its unread count in the same trip, so this is
  // what makes a new announcement appear at the top of the page and put a dot
  // on the bell straight away — fetching only this table would leave both
  // showing the state from before the save until the next reload.
  const refresh = React.useCallback(async () => {
    try {
      await router.invalidate()
      setError(null)
    } catch (loadError) {
      setError(getAnnouncementErrorMessage(loadError))
    }
  }, [router])

  const selectedAnnouncements = React.useMemo(
    () =>
      announcements.filter((announcement) => selectedIds.has(announcement.id)),
    [announcements, selectedIds]
  )

  return (
    <>
      <DashboardTable
        title="Announcements"
        icon={<MegaphoneIcon />}
        count={sortedAnnouncements.length}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        selectedCount={selectedIds.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selectedIds.size ? (
              <>
                <DashboardToolbarButton
                  type="button"
                  variant="outline"
                  onClick={() => setRetireTargets(selectedAnnouncements)}
                  disabled={retiring}
                >
                  <EyeOffIcon className="size-4" />
                  Retire ({selectedIds.size})
                </DashboardToolbarButton>
                <DashboardToolbarButton
                  type="button"
                  variant="destructive"
                  onClick={() => setDeleteTargets(selectedAnnouncements)}
                  disabled={deleting}
                >
                  <Trash2Icon className="size-4" />
                  Delete ({selectedIds.size})
                </DashboardToolbarButton>
              </>
            ) : null}
            <DashboardToolbarSearch
              name="announcement-search"
              aria-label="Search announcements"
              placeholder="Search announcements…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <DashboardToolbarButton
              type="button"
              onClick={() => setCreating(true)}
            >
              <PlusIcon className="size-4" />
              New announcement
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={ANNOUNCEMENT_COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select announcements on this page"
                />
              </TableHead>
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={sortedAnnouncements.length === 0}
        emptyText={
          announcements.length === 0
            ? "No announcements yet. Write the first one."
            : "No announcements found matching your search."
        }
        emptyColSpan={6}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: sortedAnnouncements.length,
          totalPages,
          onPageChange: (page) =>
            setCurrentPage(Math.max(1, Math.min(page, totalPages || 1))),
          onPageSizeChange: (nextSize) => {
            setCurrentPage(1)
            setPageSize(nextSize)
          },
        }}
      >
        {paginatedAnnouncements.map((announcement) => {
          const status = announcementStatus(announcement, nowMs)

          return (
            <TableRow
              key={announcement.id}
              className="group"
              rowAction={() => openAnnouncement(announcement)}
            >
              <TableCell column="select">
                <Checkbox
                  checked={selectedIds.has(announcement.id)}
                  onCheckedChange={() => selection.toggle(announcement.id)}
                  aria-label={`Select ${announcement.title}`}
                />
              </TableCell>
              <TableCell column="main">
                <button
                  type="button"
                  className="block text-left text-sm font-medium group-hover:underline"
                  onClick={() => openAnnouncement(announcement)}
                >
                  {announcement.title}
                </button>
                <span
                  className="line-clamp-2 whitespace-normal text-xs text-muted-foreground"
                  title={announcement.body}
                >
                  {announcement.body}
                </span>
              </TableCell>
              <TableCell column="meta">
                <div className="flex flex-wrap items-center gap-1">
                  {channelLabels(announcement).map((label) => (
                    <Badge key={label} variant="outline">
                      {label}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell column="meta">
                <Badge
                  variant={status === "showing" ? "secondary" : "outline"}
                >
                  {statusLabels[status]}
                </Badge>
              </TableCell>
              <TableCell column="meta">
                <span className="block truncate" title={windowText(announcement)}>
                  {windowText(announcement)}
                </span>
              </TableCell>
              <TableCell column="actions">
                <div className="flex items-center">
                  <DisabledReason
                    disabled={status === "ended"}
                    reason="This announcement has already ended, so there is nothing to take down."
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      // Nothing to take down once it is over.
                      disabled={status === "ended"}
                      onClick={() => setRetireTargets([announcement])}
                      title="Retire now"
                      aria-label={`Retire ${announcement.title}`}
                    >
                      <EyeOffIcon className="size-4" />
                    </Button>
                  </DisabledReason>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => openAnnouncement(announcement)}
                    title="Announcement settings"
                    aria-label={`Edit ${announcement.title}`}
                  >
                    <SettingsIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTargets([announcement])}
                    title="Delete announcement"
                    aria-label={`Delete ${announcement.title}`}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>

      <AnnouncementDialog
        key={editing?.id ?? (creating ? "new-announcement" : "closed")}
        open={creating || Boolean(editing)}
        announcement={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
          setOpenAnnouncement(undefined)
        }}
        onSaved={async () => {
          setCreating(false)
          setEditing(null)
          setOpenAnnouncement(undefined)
          await refresh()
        }}
      />

      <ConfirmDialog
        open={retireTargets.length > 0}
        onOpenChange={(open) => {
          if (!open) setRetireTargets([])
        }}
        title={
          retireTargets.length === 1
            ? "Take this announcement down?"
            : `Take ${retireTargets.length} announcements down?`
        }
        description={
          retireTargets.length === 1 && retireTargets[0]
            ? `${quoteOneLine(retireTargets[0].title)} disappears from everyone's banner straight away. Notices already in people's trays stay there, and you can put it back up by giving it a new end date.`
            : "The banners disappear for everyone straight away. Notices already in people's trays stay there, and you can put them back up by giving them a new end date."
        }
        confirmLabel="Retire"
        // Nothing is lost — the announcement stays and can go back up — so this
        // is not one of the red buttons.
        destructive={false}
        loading={retiring}
        onConfirm={async () => {
          setRetiring(true)
          try {
            await retireAdminAnnouncements(
              retireTargets.map((announcement) => announcement.id)
            )
            toast.success(
              retireTargets.length === 1
                ? "Announcement retired."
                : "Announcements retired."
            )
            selection.clear()
            setRetireTargets([])
            await refresh()
          } catch (retireError) {
            showErrorToast(getAnnouncementErrorMessage(retireError))
          } finally {
            setRetiring(false)
          }
        }}
      />

      <ConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(open) => {
          if (!open) setDeleteTargets([])
        }}
        title={
          deleteTargets.length === 1
            ? "Delete this announcement?"
            : `Delete ${deleteTargets.length} announcements?`
        }
        description={
          deleteTargets.length === 1 && deleteTargets[0]
            ? `${quoteOneLine(deleteTargets[0].title)} disappears from everyone's banner and from their notification tray. This cannot be undone.`
            : "They disappear from everyone's banner and from their notification tray. This cannot be undone."
        }
        confirmLabel={
          deleteTargets.length === 1
            ? "Delete announcement"
            : "Delete announcements"
        }
        loading={deleting}
        onConfirm={async () => {
          setDeleting(true)
          try {
            await deleteAdminAnnouncements(
              deleteTargets.map((announcement) => announcement.id)
            )
            toast.success(
              deleteTargets.length === 1
                ? "Announcement deleted."
                : "Announcements deleted."
            )
            selection.clear()
            setDeleteTargets([])
            await refresh()
          } catch (deleteError) {
            showErrorToast(getAnnouncementErrorMessage(deleteError))
          } finally {
            setDeleting(false)
          }
        }}
      />
    </>
  )
}

function AnnouncementDialog({
  open,
  announcement,
  onClose,
  onSaved,
}: {
  open: boolean
  announcement: Announcement | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  // Mounted fresh per announcement by its key in the parent, so the draft starts
  // from the right one without an effect resetting it after the first render.
  const [title, setTitle] = React.useState(announcement?.title ?? "")
  const [body, setBody] = React.useState(announcement?.body ?? "")
  const [level, setLevel] = React.useState<AnnouncementLevel>(
    announcement?.level ?? DEFAULT_ANNOUNCEMENT_LEVEL
  )
  const [showBanner, setShowBanner] = React.useState(
    announcement?.showBanner ?? true
  )
  const [notify, setNotify] = React.useState(announcement?.notify ?? false)
  const [startsOn, setStartsOn] = React.useState(
    toDateField(announcement?.startsAt ?? null)
  )
  const [endsOn, setEndsOn] = React.useState(
    toDateField(announcement?.endsAt ?? null)
  )
  const [saving, setSaving] = React.useState(false)
  const titleInputRef = React.useRef<HTMLInputElement>(null)
  // Flagged per field and only when Create/Save is pressed. A new announcement
  // opens empty, so complaining as focus passes through a field would tell the
  // writer off before they have had a chance to type in it.
  const [titleInvalid, setTitleInvalid] = React.useState(false)
  const [bodyInvalid, setBodyInvalid] = React.useState(false)

  const handleSave = React.useCallback(async () => {
    dismissErrorToast()

    // The server rejects all three too; catching them here keeps the message
    // instant and the entered text untouched.
    const titleMissing = !title.trim()
    const bodyMissing = !body.trim()
    setTitleInvalid(titleMissing)
    setBodyInvalid(bodyMissing)

    const failedCode = titleMissing
      ? "ANNOUNCEMENT_TITLE_REQUIRED"
      : bodyMissing
        ? "ANNOUNCEMENT_BODY_REQUIRED"
        : !showBanner && !notify
          ? "ANNOUNCEMENT_CHANNEL_REQUIRED"
          : startsOn && endsOn && endsOn < startsOn
            ? "ANNOUNCEMENT_WINDOW_INVALID"
            : null

    if (failedCode) {
      showErrorToast(getAnnouncementErrorMessage(new Error(failedCode)))
      return
    }

    const input = { title, body, level, showBanner, notify, startsOn, endsOn }

    setSaving(true)
    try {
      if (announcement) {
        await updateAdminAnnouncement(announcement.id, input)
        toast.success("Announcement saved.")
      } else {
        await createAdminAnnouncement(input)
        toast.success("Announcement created.")
      }
      await onSaved()
    } catch (saveError) {
      showErrorToast(getAnnouncementErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }, [
    announcement,
    body,
    endsOn,
    level,
    notify,
    onSaved,
    showBanner,
    startsOn,
    title,
  ])

  // What the window opened holding. Anything different from this is work a
  // stray click outside would throw away, so the window asks first.
  const dirty =
    title !== (announcement?.title ?? "") ||
    body !== (announcement?.body ?? "") ||
    level !== (announcement?.level ?? DEFAULT_ANNOUNCEMENT_LEVEL) ||
    showBanner !== (announcement?.showBanner ?? true) ||
    notify !== (announcement?.notify ?? false) ||
    startsOn !== toDateField(announcement?.startsAt ?? null) ||
    endsOn !== toDateField(announcement?.endsAt ?? null)

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
      <DialogContent
        variant="admin"
        className="sm:max-w-lg"
        // A new announcement opens with the cursor in Title so you can just
        // type. Editing an existing one keeps the window's normal focus, since
        // landing in a filled field invites a stray edit.
        onOpenAutoFocus={(event) => {
          if (announcement) return
          event.preventDefault()
          titleInputRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {announcement ? "Edit announcement" : "New announcement"}
          </DialogTitle>
          <DialogDescription>
            Everyone signed in sees this, whichever plan they are on.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSave()
          }}
        >
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>What you want to say</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor="announcement-level"
                    hint="Only changes how loud the banner looks. News is blue, a heads-up is amber, a problem is red."
                  >
                    Kind
                  </FieldLabel>
                  <Select
                    value={level}
                    onValueChange={(value) =>
                      setLevel(value as AnnouncementLevel)
                    }
                  >
                    <SelectTrigger
                      id="announcement-level"
                      className="w-full sm:w-fit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ANNOUNCEMENT_LEVELS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {announcementLevelLabels[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:flex-1">
                  <FieldLabel
                    htmlFor="announcement-title"
                    hint="One line, the way you would say it out loud — for example, Uploads are slow this morning."
                  >
                    Title
                  </FieldLabel>
                  <Input
                    id="announcement-title"
                    ref={titleInputRef}
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value)
                      // Clear the mark as soon as it is answered, rather than
                      // leaving a red ring on a field that now has a title.
                      if (event.target.value.trim()) setTitleInvalid(false)
                    }}
                    aria-invalid={titleInvalid || undefined}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <FieldLabel
                  htmlFor="announcement-body"
                  hint="Line breaks are kept, so a couple of short sentences read fine here."
                >
                  Message
                </FieldLabel>
                <Textarea
                  id="announcement-body"
                  rows={1}
                  value={body}
                  onChange={(event) => {
                    setBody(event.target.value)
                    if (event.target.value.trim()) setBodyInvalid(false)
                  }}
                  aria-invalid={bodyInvalid || undefined}
                />
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Where it shows</CardTitle>
              <CardDescription>
                Pick at least one. The banner is hard to miss and each person can
                close it; the tray notice keeps the message readable afterwards.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="announcement-banner"
                  checked={showBanner}
                  onCheckedChange={(value) => setShowBanner(value === true)}
                />
                <Label htmlFor="announcement-banner" className="font-normal">
                  Banner across the top of the app
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="announcement-notify"
                  checked={notify}
                  onCheckedChange={(value) => setNotify(value === true)}
                />
                <Label htmlFor="announcement-notify" className="font-normal">
                  Notice in the notification tray
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>When it shows</CardTitle>
              <CardDescription>
                Whole days, read the same way everywhere in the world.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="grid gap-2 sm:flex-1">
                  <FieldLabel
                    htmlFor="announcement-starts-on"
                    hint="Leave empty to start the moment you save it."
                  >
                    Starts on
                  </FieldLabel>
                  <DatePicker
                    id="announcement-starts-on"
                    placeholder="Right away"
                    value={startsOn ? new Date(`${startsOn}T00:00:00`) : undefined}
                    onChange={(date) =>
                      setStartsOn(date ? format(date, "yyyy-MM-dd") : "")
                    }
                  />
                </div>
                <div className="grid gap-2 sm:flex-1">
                  <FieldLabel
                    htmlFor="announcement-ends-on"
                    hint="Runs to the end of this day. Leave empty to keep it up until you retire it."
                  >
                    Ends on
                  </FieldLabel>
                  <DatePicker
                    id="announcement-ends-on"
                    placeholder="Until retired"
                    value={endsOn ? new Date(`${endsOn}T00:00:00`) : undefined}
                    onChange={(date) =>
                      setEndsOn(date ? format(date, "yyyy-MM-dd") : "")
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={requestClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2Icon className="animate-spin" /> : null}
            {announcement ? "Save changes" : "Create announcement"}
          </Button>
        </DialogFooter>
        </form>
      </DialogContent>
      )}
    </FormDialog>
  )
}
