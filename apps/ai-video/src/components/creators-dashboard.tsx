import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardTable } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/dashboard-toolbar"
import {
  Dialog,
  DialogBody,
  DialogContent,
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
} from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import {
  bulkDeleteCreators,
  createCreator,
  CREATOR_PROFILE_URL_ERRORS,
  getCreatorErrorMessage,
  listCreators,
  setCreatorWatch,
  syncCreatorWatch,
  type CreatorItem,
  type WatchSyncResult,
} from "@/lib/api/creators"
import {
  PLATFORM_LABELS,
  creatorInitials,
  dateFormatter,
  formatCount,
  pageSizeOptions,
} from "@/lib/dashboard-format"
import { useSelection } from "@/lib/use-selection"
import { useBulkDelete } from "@/lib/use-bulk-delete"

function formatWatchSyncNotice(result: WatchSyncResult) {
  const checkedLabel = result.checked === 1 ? "creator" : "creators"
  const addedLabel = result.added === 1 ? "reel" : "reels"
  const base = `Checked ${result.checked} watched ${checkedLabel}, added ${result.added} new ${addedLabel}.`

  if (!result.failed) return base

  const failedLabel = result.failed === 1 ? "creator failed" : "creators failed"
  const failedCreators = result.errors
    .map((entry) => `@${entry.creator}`)
    .join(", ")

  return `${base} ${result.failed} ${failedLabel}: ${failedCreators}.`
}

function upsertCreatorItem(items: CreatorItem[], creator: CreatorItem) {
  const existingIndex = items.findIndex((item) => item.id === creator.id)
  if (existingIndex === -1) return [creator, ...items]

  const updated = [...items]
  updated[existingIndex] = creator
  return updated
}

// Parent level of the Creators drill-down: rows are auto-created by the viral
// pipeline; clicking a creator opens their reel grid.
export function CreatorsDashboard() {
  const [creators, setCreators] = React.useState<CreatorItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(pageSizeOptions[1])
  const [syncing, setSyncing] = React.useState(false)
  const [addCreatorOpen, setAddCreatorOpen] = React.useState(false)
  const [profileUrl, setProfileUrl] = React.useState("")
  const [creatingCreator, setCreatingCreator] = React.useState(false)
  const [addCreatorError, setAddCreatorError] = React.useState<string | null>(
    null
  )

  React.useEffect(() => {
    let active = true
    listCreators()
      .then((data) => { if (!active) return; setCreators(data.creators) })
      .catch((loadError) => { if (!active) return; setError(getCreatorErrorMessage(loadError)) })
      .finally(() => { if (!active) return; setLoading(false) })
    return () => { active = false }
  }, [])

  const filteredCreators = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return creators
    return creators.filter((c) =>
      `${c.display_name ?? ""} ${c.username}`.toLowerCase().includes(query)
    )
  }, [creators, searchQuery])

  const totalPages = Math.ceil(filteredCreators.length / pageSize)
  const paginatedCreators = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredCreators.slice(start, start + pageSize)
  }, [currentPage, filteredCreators, pageSize])

  function updateSearch(value: string) { setSearchQuery(value); setCurrentPage(1) }
  function changePageSize(size: number) { setPageSize(size); setCurrentPage(1) }
  function goToPage(page: number) { setCurrentPage(Math.max(1, Math.min(page, totalPages || 1))) }
  function handleAddCreatorOpenChange(open: boolean) {
    if (creatingCreator) return
    setAddCreatorOpen(open)
    if (!open) {
      setProfileUrl("")
      setAddCreatorError(null)
    }
  }

  const visibleIds = paginatedCreators.map((creator) => creator.id)
  const {
    selectedIds,
    toggleSelected,
    allVisibleSelected,
    toggleVisibleSelected,
    clearSelection,
  } = useSelection(visibleIds)

  // Optimistic watch toggle; reverts on failure.
  async function handleToggleWatch(creatorId: string, watch: boolean) {
    setCreators((current) =>
      current.map((c) => (c.id === creatorId ? { ...c, watch } : c))
    )
    try {
      await setCreatorWatch(creatorId, watch)
    } catch (toggleError) {
      setCreators((current) =>
        current.map((c) => (c.id === creatorId ? { ...c, watch: !watch } : c))
      )
      setError(getCreatorErrorMessage(toggleError))
    }
  }

  async function handleAddCreatorSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    const trimmedProfileUrl = profileUrl.trim()
    if (!trimmedProfileUrl) {
      setAddCreatorError(CREATOR_PROFILE_URL_ERRORS.invalid)
      return
    }

    setCreatingCreator(true)
    setAddCreatorError(null)
    setError(null)
    setNotice(null)
    try {
      const creator = await createCreator(trimmedProfileUrl)
      setCreators((current) => upsertCreatorItem(current, creator))
      setCurrentPage(1)
      setNotice(`Watch is on for @${creator.username}.`)
      setAddCreatorOpen(false)
      setProfileUrl("")
    } catch (createError) {
      setAddCreatorError(getCreatorErrorMessage(createError))
    } finally {
      setCreatingCreator(false)
    }
  }

  // Manual run of both watcher passes (new reels + stats re-sync).
  async function handleSyncNow() {
    setSyncing(true)
    setError(null)
    setNotice(null)
    try {
      const result = await syncCreatorWatch()
      setNotice(formatWatchSyncNotice(result))
      const data = await listCreators()
      setCreators(data.creators)
    } catch (syncError) {
      setError(getCreatorErrorMessage(syncError))
    } finally {
      setSyncing(false)
    }
  }

  const { deleteIds, setDeleteIds, deleting, confirmDelete } = useBulkDelete({
    noun: "creator",
    deleteMany: bulkDeleteCreators,
    setItems: setCreators,
    clearSelection,
    setNotice,
    setError,
    formatError: getCreatorErrorMessage,
    // Deleting a creator cascades to their archived reels — warn the user.
    noticeSuffix: "and their reels",
  })

  const deleteCount = deleteIds?.length ?? 0
  // Reel total for the confirm dialog — deleting creators removes reels too.
  const deleteReelCount = (deleteIds ?? []).reduce((sum, id) => {
    const creator = creators.find((c) => c.id === id)
    return sum + (creator?.reel_count ?? 0)
  }, 0)

  const controls = (
    <>
      {selectedIds.size > 0 ? (
        <DashboardToolbarButton
          type="button"
          variant="destructive"
          onClick={() => setDeleteIds(Array.from(selectedIds))}
        >
          <Trash2Icon className="size-4" />
          Delete {selectedIds.size}
        </DashboardToolbarButton>
      ) : null}
      <DashboardToolbarSearch
        name="creator-search"
        aria-label="Search creators"
        placeholder="Search creators..."
        value={searchQuery}
        onChange={(event) => updateSearch(event.target.value)}
      />
      <DashboardToolbarButton
        type="button"
        variant="outline"
        disabled={syncing}
        onClick={handleSyncNow}
      >
        <RefreshCwIcon className={syncing ? "size-4 animate-spin" : "size-4"} />
        {syncing ? "Syncing…" : "Sync now"}
      </DashboardToolbarButton>
      <DashboardToolbarButton
        type="button"
        onClick={() => handleAddCreatorOpenChange(true)}
      >
        <PlusIcon className="size-4" />
        Add Creator
      </DashboardToolbarButton>
    </>
  )

  return (
    <div className="w-full pb-8">
      {notice ? (
        <div className="mb-4 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{notice}</div>
      ) : null}
      {error ? (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <DashboardTable
        title="Creators"
        icon={<UsersIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={filteredCreators.length}
        controls={controls}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="select">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleVisibleSelected}
                  aria-label="Select visible creators"
                />
              </TableHead>
              <TableHead column="main">Creator</TableHead>
              <TableHead column="meta">Platform</TableHead>
              <TableHead column="meta">Followers</TableHead>
              <TableHead column="meta">Reels</TableHead>
              <TableHead column="meta">Watch</TableHead>
              <TableHead column="meta" className="hidden lg:table-cell">Last Added</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={loading || paginatedCreators.length === 0}
        emptyText={
          loading
            ? "Loading creators..."
            : "No creators yet. Add a creator profile or add videos to the Viral Archive."
        }
        emptyColSpan={8}
        footer={{
          type: "pagination",
          page: currentPage,
          pageSize,
          total: filteredCreators.length,
          totalPages,
          pageSizeOptions,
          onPageChange: goToPage,
          onPageSizeChange: changePageSize,
        }}
      >
        {paginatedCreators.map((creator) => (
          <CreatorTableRow
            key={creator.id}
            creator={creator}
            selected={selectedIds.has(creator.id)}
            onToggle={() => toggleSelected(creator.id)}
            onToggleWatch={(watch) => handleToggleWatch(creator.id, watch)}
            onDelete={() => setDeleteIds([creator.id])}
          />
        ))}
      </DashboardTable>

      <Dialog open={addCreatorOpen} onOpenChange={handleAddCreatorOpenChange}>
        <DialogContent
          variant="admin"
          className="sm:max-w-md"
          showCloseButton={!creatingCreator}
        >
          <DialogHeader>
            <DialogTitle>Add Creator</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form
              id="add-creator-form"
              className="grid gap-2"
              onSubmit={handleAddCreatorSubmit}
            >
              <Label htmlFor="creator-profile-url">
                TikTok or Instagram profile URL
              </Label>
              <Input
                id="creator-profile-url"
                value={profileUrl}
                onChange={(event) => {
                  setProfileUrl(event.target.value)
                  if (addCreatorError) setAddCreatorError(null)
                }}
                placeholder="https://www.tiktok.com/@creator"
                aria-invalid={addCreatorError ? true : undefined}
                aria-describedby={
                  addCreatorError ? "creator-profile-url-error" : undefined
                }
                disabled={creatingCreator}
                autoFocus
              />
              {addCreatorError ? (
                <p
                  id="creator-profile-url-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {addCreatorError}
                </p>
              ) : null}
            </form>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              disabled={creatingCreator}
              onClick={() => handleAddCreatorOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="add-creator-form"
              disabled={creatingCreator}
            >
              {creatingCreator ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              {creatingCreator ? "Adding" : "Add Creator"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteIds} onOpenChange={(open) => !open && setDeleteIds(null)}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              Delete {deleteCount === 1 ? "Creator" : `${deleteCount} Creators`}?
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              This removes {deleteCount === 1 ? "the creator" : "these creators"} and their{" "}
              {deleteReelCount} archived {deleteReelCount === 1 ? "reel" : "reels"} — including the
              downloaded footage and analyses. Templates and projects built from those reels will lose
              that footage. This action cannot be undone.
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button type="button" variant="outline" onClick={() => setDeleteIds(null)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={deleting} onClick={confirmDelete}>
              {deleting ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {deleting ? "Deleting" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreatorTableRow({
  creator,
  selected,
  onToggle,
  onToggleWatch,
  onDelete,
}: {
  creator: CreatorItem
  selected: boolean
  onToggle: () => void
  onToggleWatch: (watch: boolean) => void
  onDelete: () => void
}) {
  return (
    <TableRow className="group" data-state={selected ? "selected" : undefined}>
      <TableCell column="select">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${creator.display_name ?? creator.username}`}
        />
      </TableCell>
      <TableCell column="main">
        {/* Avatar and name both drill into the creator's reels. */}
        <Link
          to="/admin/creators/$creatorId"
          params={{ creatorId: creator.id }}
          className="flex min-w-0 items-center gap-3"
        >
          <Avatar className="size-9">
            {creator.avatar_url ? <AvatarImage src={creator.avatar_url} alt="" /> : null}
            <AvatarFallback>{creatorInitials(creator)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <span className="block max-w-full truncate font-medium group-hover:underline">
              {creator.display_name ?? creator.username}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              @{creator.username}
            </span>
          </div>
        </Link>
      </TableCell>
      <TableCell column="meta">
        <Badge variant="outline">{PLATFORM_LABELS[creator.platform]}</Badge>
      </TableCell>
      <TableCell column="mutedMeta">
        {formatCount(creator.follower_count)}
      </TableCell>
      <TableCell column="meta">
        {creator.reel_count} {creator.reel_count === 1 ? "reel" : "reels"}
      </TableCell>
      <TableCell column="meta">
        {/* Auto-ingest new reels from this creator on sync runs. */}
        <Switch
          checked={creator.watch}
          onCheckedChange={onToggleWatch}
          aria-label={`Watch ${creator.display_name ?? creator.username}`}
          title={
            creator.last_checked_at
              ? `Last checked ${dateFormatter.format(new Date(creator.last_checked_at))}`
              : undefined
          }
        />
      </TableCell>
      <TableCell column="mutedMeta" className="hidden lg:table-cell">
        {creator.last_reel_at ? dateFormatter.format(new Date(creator.last_reel_at)) : "—"}
      </TableCell>
      <TableCell column="meta">
        <div className="flex justify-start gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete creator">
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
