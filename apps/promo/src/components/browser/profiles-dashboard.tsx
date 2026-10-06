import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  CopyIcon,
  FolderCogIcon,
  Loader2Icon,
  MonitorIcon,
  PlusIcon,
  SettingsIcon,
  SquareIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { BrowserWindowDialog } from "@/components/browser/browser-window-dialog"
import { ProfileDialog } from "@/components/browser/profile-dialog"
import { ProfileGroupsDialog } from "@/components/browser/profile-groups-dialog"
import { ProxyTestBadge } from "@/components/browser/proxy-test-badge"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  changeProfiles,
  copyProfile,
  getProfileErrorMessage,
  profileJob,
  removeProfiles,
  type BulkProfileAction,
  type ProfileRow,
  type ProfilesPage,
} from "@/lib/api/browser/profiles"
import { deleteSignOutWords, signedInWords } from "@/lib/browser/wording"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatTimeAgo } from "@/lib/format/format-time"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { showErrorToast } from "@/lib/toast/error-toast"

type SortColumn = "name" | "proxy" | "browser" | "accounts" | "lastRan"

const COLUMNS: SortableColumn<SortColumn>[] = [
  { key: "name", label: "Profile", column: "main" },
  { key: "proxy", label: "Proxy", column: "meta" },
  { key: "browser", label: "Browser", column: "meta" },
  { key: "accounts", label: "Signed in", column: "meta" },
  { key: "lastRan", label: "Last ran", column: "meta" },
]

const BROWSER_ORDER = { open: 0, opening: 1, stopped: 2 } as const

function compare(a: ProfileRow, b: ProfileRow, column: SortColumn): number {
  switch (column) {
    case "proxy":
      return (a.proxy?.label ?? "").localeCompare(b.proxy?.label ?? "")
    case "browser":
      return BROWSER_ORDER[a.browser] - BROWSER_ORDER[b.browser]
    case "accounts":
      return a.accounts.length - b.accounts.length
    case "lastRan":
      return (a.lastRanAt ? new Date(a.lastRanAt).getTime() : 0) - (b.lastRanAt ? new Date(b.lastRanAt).getTime() : 0)
    default:
      return a.name.localeCompare(b.name)
  }
}

/** A label's colour as a dot. Label colours are the person's own choice of data. */
const LABEL_DOT: Record<string, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  slate: "bg-slate-500",
}

/** How often the list is read again while a browser is opening or closing. */
const POLL_MS = 2_000

const ALL = "all"
const NONE = "none"

/**
 * Every isolated browser: its proxy, whether it is open, who is signed in
 * inside it, and when it last ran.
 *
 * Copied in behaviour from anti-detect's profiles dashboard and built from the
 * shell's table and windows. Open and Stop write a job for the browser program
 * and the row follows what it saves. The dashboard never calls a browser.
 *
 * Two windows open over the list. Settings, with the profile's history, keeps
 * the open profile in `?open=<id>`, which is where the Reddit dashboard's
 * links lead. Open shows the browser itself, inside the app.
 */
export function ProfilesDashboard({
  initial,
  openId,
}: {
  initial: ProfilesPage
  openId?: string
}) {
  const { config } = useShellRuntime()
  const router = useRouter()
  const navigate = useNavigate()
  const page = initial
  const profiles = page.profiles

  const [search, setSearch] = React.useState("")
  const [folderFilter, setFolderFilter] = React.useState(ALL)
  const [labelFilter, setLabelFilter] = React.useState(ALL)
  const [tagFilter, setTagFilter] = React.useState(ALL)
  const { sort, direction, toggleSort } = useTableSort<SortColumn>("name")
  const [pageNumber, setPageNumber] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(config.dashboardRowsPerPage)
  const selection = useSelection()

  const [creating, setCreating] = React.useState(false)
  const [groupsOpen, setGroupsOpen] = React.useState(false)
  const [windowFor, setWindowFor] = React.useState<string | null>(null)
  const [deleteTargets, setDeleteTargets] = React.useState<ProfileRow[]>([])
  const [tagging, setTagging] = React.useState(false)
  const [tagText, setTagText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const setOpen = React.useCallback(
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
  const editing = profiles.find((profile) => profile.id === openId) ?? null
  const windowProfile = profiles.find((profile) => profile.id === windowFor) ?? null

  const refresh = React.useCallback(async () => {
    try {
      await router.invalidate()
      setError(null)
    } catch (loadError) {
      setError(getProfileErrorMessage(loadError))
    }
  }, [router])

  // A browser takes a minute to open and a close waits its turn in the queue,
  // so the list is read again every two seconds until nothing is changing.
  const changing = profiles.some(
    (profile) =>
      profile.browser === "opening" ||
      profile.closing ||
      profile.checking ||
      profile.siteChecking ||
      profile.backingUp
  )
  React.useEffect(() => {
    if (!changing) return
    const timer = setInterval(() => void router.invalidate().catch(() => {}), POLL_MS)
    return () => clearInterval(timer)
  }, [changing, router])

  const tags = React.useMemo(
    () => Array.from(new Set(profiles.flatMap((profile) => profile.tags))).sort((a, b) => a.localeCompare(b)),
    [profiles]
  )
  const folderName = (id: string | null) => page.folders.find((folder) => folder.id === id)?.name
  const label = (id: string | null) => page.labels.find((one) => one.id === id)

  const shown = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    const factor = direction === "asc" ? 1 : -1
    return profiles
      .filter((profile) => {
        if (folderFilter === NONE ? profile.folderId : folderFilter !== ALL && profile.folderId !== folderFilter) return false
        if (labelFilter === NONE ? profile.labelId : labelFilter !== ALL && profile.labelId !== labelFilter) return false
        if (tagFilter !== ALL && !profile.tags.includes(tagFilter)) return false
        if (!query) return true
        return (
          profile.name.toLowerCase().includes(query) ||
          profile.notes.toLowerCase().includes(query) ||
          profile.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          profile.accounts.some((account) => account.handle.toLowerCase().includes(query))
        )
      })
      .sort((a, b) => factor * compare(a, b, sort))
  }, [direction, folderFilter, labelFilter, profiles, search, sort, tagFilter])

  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize))
  const currentPage = Math.min(pageNumber, totalPages)
  const visible = shown.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const visibleIds = visible.map((profile) => profile.id)
  const selectedIds = Array.from(selection.selected)

  async function openBrowser(profile: ProfileRow) {
    // The job is written before the window opens, so the window's first read
    // already says "opening" rather than "not running".
    try {
      if (profile.browser === "stopped") await profileJob(profile.id, "open")
      setWindowFor(profile.id)
      await refresh()
    } catch (jobError) {
      showErrorToast(getProfileErrorMessage(jobError))
    }
  }

  async function stopBrowser(profile: ProfileRow) {
    try {
      await profileJob(profile.id, "close")
      await refresh()
    } catch (jobError) {
      showErrorToast(getProfileErrorMessage(jobError))
    }
  }

  async function bulk(action: BulkProfileAction, verb: string) {
    setBusy(true)
    try {
      const { done, skipped } = await changeProfiles(action)
      toast.success(describeBulkResult({ done: done.length, kept: skipped.length, one: "profile", many: "profiles", verb }))
      await refresh()
      return true
    } catch (bulkError) {
      showErrorToast(getProfileErrorMessage(bulkError))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function remove(targets: ProfileRow[]) {
    setBusy(true)
    try {
      const { deleted, kept } = await removeProfiles(targets.map((profile) => profile.id))
      if (deleted.length) {
        toast.success(describeBulkResult({ done: deleted.length, kept: 0, one: "profile", many: "profiles", verb: "deleted" }))
      }
      if (kept.length) {
        showErrorToast(
          kept.map((one) => `${one.name} was kept: ${one.reason.replace(/\.$/, "")}.`).join(" ") +
            (kept.some((one) => one.reason === "its browser is open") ? " Stop its browser first." : "")
        )
      }
      selection.setSelected(new Set(kept.map((one) => one.id)))
      setDeleteTargets([])
      await refresh()
    } catch (deleteError) {
      showErrorToast(getProfileErrorMessage(deleteError))
    } finally {
      setBusy(false)
    }
  }

  async function duplicate(profile: ProfileRow) {
    try {
      const { id } = await copyProfile(profile.id)
      toast.success(`${profile.name} copied, with its own cookies and identity.`)
      await refresh()
      setOpen(id)
    } catch (copyError) {
      showErrorToast(getProfileErrorMessage(copyError))
    }
  }

  const signedOut = deleteSignOutWords(deleteTargets.flatMap((profile) => profile.accounts))

  return (
    <>
      <DashboardTable
        title="Browser profiles"
        icon={<MonitorIcon />}
        count={shown.length}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selection.selected.size ? (
              <>
                <Select
                  value=""
                  onValueChange={(value) =>
                    void bulk({ action: "folder", ids: selectedIds, folderId: value === NONE ? null : value }, "moved")
                  }
                  disabled={busy}
                >
                  <DashboardToolbarSelectTrigger aria-label="Move the ticked profiles to a folder">
                    <SelectValue placeholder="Move to folder" />
                  </DashboardToolbarSelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No folder</SelectItem>
                    {page.folders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value=""
                  onValueChange={(value) =>
                    void bulk({ action: "label", ids: selectedIds, labelId: value === NONE ? null : value }, "labelled")
                  }
                  disabled={busy}
                >
                  <DashboardToolbarSelectTrigger aria-label="Label the ticked profiles">
                    <SelectValue placeholder="Set label" />
                  </DashboardToolbarSelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No label</SelectItem>
                    {page.labels.map((one) => (
                      <SelectItem key={one.id} value={one.id}>
                        {one.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DashboardToolbarButton type="button" variant="outline" disabled={busy} onClick={() => setTagging(true)}>
                  <TagIcon className="size-4" />
                  Add tag
                </DashboardToolbarButton>
                <DashboardToolbarButton
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setDeleteTargets(profiles.filter((profile) => selection.selected.has(profile.id)))}
                >
                  <Trash2Icon className="size-4" />
                  Delete ({selection.selected.size})
                </DashboardToolbarButton>
              </>
            ) : null}
            <DashboardToolbarSearch
              name="profile-search"
              aria-label="Search profiles"
              placeholder="Search profiles…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPageNumber(1)
              }}
            />
            <FilterSelect
              label="Folder"
              value={folderFilter}
              onChange={setFolderFilter}
              allLabel="All folders"
              noneLabel="No folder"
              options={page.folders}
            />
            <FilterSelect
              label="Label"
              value={labelFilter}
              onChange={setLabelFilter}
              allLabel="All labels"
              noneLabel="No label"
              options={page.labels}
            />
            {tags.length ? (
              <FilterSelect
                label="Tag"
                value={tagFilter}
                onChange={setTagFilter}
                allLabel="All tags"
                options={tags.map((tag) => ({ id: tag, name: tag }))}
              />
            ) : null}
            <DashboardToolbarButton
              type="button"
              variant="outline"
              aria-label="Folders and labels"
              title="Folders and labels"
              onClick={() => setGroupsOpen(true)}
            >
              <FolderCogIcon className="size-4" />
              {/* Words from the small breakpoint up; a phone gets the icon so
                  the search box keeps its room. */}
              <span className="hidden sm:inline">Folders and labels</span>
            </DashboardToolbarButton>
            <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
              <PlusIcon className="size-4" />
              New profile
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <SelectAllTableHead
                noun="profiles"
                checked={selection.selectAllState(visibleIds)}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={shown.length === 0}
        emptyText={
          profiles.length
            ? "No profiles match that."
            : "No browser profiles yet. Make one, give it a proxy, and pick it for the Reddit account in Settings."
        }
        emptyColSpan={COLUMNS.length + 2}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: shown.length,
          totalPages,
          onPageChange: (next) => setPageNumber(Math.max(1, Math.min(next, totalPages))),
          onPageSizeChange: (next) => {
            setPageNumber(1)
            setPageSize(next)
          },
        }}
      >
        {visible.map((profile) => {
          const profileLabel = label(profile.labelId)
          const folder = folderName(profile.folderId)
          return (
            <TableRow key={profile.id} className="group" rowAction={() => setOpen(profile.id)}>
              <TableCell column="select">
                <Checkbox
                  checked={selection.selected.has(profile.id)}
                  onCheckedChange={() => selection.toggle(profile.id)}
                  aria-label={`Select ${profile.name}`}
                />
              </TableCell>
              <TableCell column="main">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    className="truncate text-left text-sm font-medium group-hover:underline"
                    onClick={() => setOpen(profile.id)}
                  >
                    {profile.name}
                  </button>
                  {profileLabel ? (
                    <Badge variant="outline" className="gap-1.5">
                      <span className={`size-1.5 rounded-full ${LABEL_DOT[profileLabel.color] ?? LABEL_DOT.slate}`} />
                      {profileLabel.name}
                    </Badge>
                  ) : null}
                </div>
                <span className="line-clamp-1 text-xs text-muted-foreground">
                  {[folder, ...profile.tags.map((tag) => `#${tag}`)].filter(Boolean).join(" · ") || "No folder or tags"}
                </span>
              </TableCell>
              <TableCell column="meta">
                {profile.proxy ? (
                  <div className="grid gap-1">
                    <span className="text-sm">{profile.proxy.label || profile.proxy.host}</span>
                    <ProxyTestBadge result={profile.proxy.lastTestResult} compact />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">This computer</span>
                )}
              </TableCell>
              <TableCell column="meta" className="text-sm">
                {profile.closing ? (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Loader2Icon className="size-3.5 animate-spin" />
                    Stopping
                  </span>
                ) : profile.browser === "opening" ? (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Loader2Icon className="size-3.5 animate-spin" />
                    Opening
                  </span>
                ) : profile.browser === "open" ? (
                  <span className="grid">
                    <span>Open</span>
                    {profile.onOldProxy ? (
                      <span className="text-xs text-muted-foreground">On its old proxy</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Stopped</span>
                )}
              </TableCell>
              <TableCell column="meta" className="text-sm">
                {profile.accounts.length ? (
                  <span className="grid">
                    {profile.accounts.map((account) => (
                      <span key={account.id}>{signedInWords(account)}</span>
                    ))}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Nobody</span>
                )}
              </TableCell>
              <TableCell column="meta" className="text-sm text-muted-foreground">
                {profile.lastRanAt ? formatTimeAgo(profile.lastRanAt) : "Never"}
              </TableCell>
              <TableCell column="actions">
                {profile.browser === "stopped" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void openBrowser(profile)}
                    title="Open the browser"
                    aria-label={`Open the browser of ${profile.name}`}
                  >
                    <MonitorIcon className="size-4" />
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setWindowFor(profile.id)}
                      title="Show the browser"
                      aria-label={`Show the browser of ${profile.name}`}
                    >
                      <MonitorIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={profile.closing}
                      onClick={() => void stopBrowser(profile)}
                      title="Stop the browser"
                      aria-label={`Stop the browser of ${profile.name}`}
                    >
                      <SquareIcon className="size-4" />
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void duplicate(profile)}
                  title="Duplicate"
                  aria-label={`Duplicate ${profile.name}`}
                >
                  <CopyIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpen(profile.id)}
                  title="Profile settings"
                  aria-label={`Edit ${profile.name}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteTargets([profile])}
                  title="Delete profile"
                  aria-label={`Delete ${profile.name}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>

      <ProfileDialog
        key={editing?.id ?? (creating ? "new-profile" : "closed")}
        open={creating || Boolean(editing)}
        profile={editing}
        page={page}
        onRestart={async (profile) => {
          try {
            await profileJob(profile.id, "restart")
            toast.success(`${profile.name} is restarting on its new proxy.`)
            await refresh()
          } catch (jobError) {
            showErrorToast(getProfileErrorMessage(jobError))
          }
        }}
        onDelete={(profile) => {
          // One window at a time: the profile's window gives way to the question.
          setOpen(undefined)
          setDeleteTargets([profile])
        }}
        onClose={() => {
          setCreating(false)
          setOpen(undefined)
        }}
        onSaved={async () => {
          await refresh()
          setCreating(false)
          setOpen(undefined)
        }}
        onChanged={refresh}
      />

      <BrowserWindowDialog
        profile={windowProfile}
        onClose={() => setWindowFor(null)}
        onChanged={refresh}
      />

      <ProfileGroupsDialog
        open={groupsOpen}
        folders={page.folders}
        labels={page.labels}
        onClose={() => setGroupsOpen(false)}
        onChanged={refresh}
      />

      <ConfirmDialog
        open={tagging}
        onOpenChange={(next) => {
          if (!next) {
            setTagging(false)
            setTagText("")
          }
        }}
        title={`Add a tag to ${selection.selected.size} ${selection.selected.size === 1 ? "profile" : "profiles"}?`}
        description="A profile that already has the tag, or already has twenty, is left as it is."
        confirmLabel="Add tag"
        destructive={false}
        loading={busy}
        disabled={!tagText.trim()}
        onConfirm={async () => {
          if (await bulk({ action: "tag", ids: selectedIds, tag: tagText }, "tagged")) {
            setTagging(false)
            setTagText("")
          }
        }}
      >
        <div className="grid gap-2 pt-4">
          <Label htmlFor="bulk-tag">Tag</Label>
          <Input id="bulk-tag" value={tagText} onChange={(event) => setTagText(event.target.value)} />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteTargets.length > 0}
        onOpenChange={(next) => {
          if (!next) setDeleteTargets([])
        }}
        title={deleteTargets.length === 1 ? "Delete this profile?" : `Delete ${deleteTargets.length} profiles?`}
        description={[
          deleteTargets.length === 1
            ? "Its cookies and its backups go with it, so every sign-in inside is lost for good."
            : "Their cookies and their backups go with them, so every sign-in inside is lost for good.",
          signedOut ?? "Nothing is signed in inside.",
          "A profile whose browser is open is kept until it is stopped.",
        ].join(" ")}
        confirmLabel={deleteTargets.length === 1 ? "Delete profile" : "Delete profiles"}
        loading={busy}
        onConfirm={() => void remove(deleteTargets)}
      />
    </>
  )
}

/** One of the list's filters: all, none, or one of the options. */
function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  noneLabel,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  allLabel: string
  noneLabel?: string
  options: Array<{ id: string; name: string }>
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      {/* Off on a phone, where three filters left the search box no room. */}
      <DashboardToolbarSelectTrigger
        aria-label={`Filter by ${label.toLowerCase()}`}
        className="hidden sm:flex"
      >
        <SelectValue />
      </DashboardToolbarSelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {noneLabel ? <SelectItem value={NONE}>{noneLabel}</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
