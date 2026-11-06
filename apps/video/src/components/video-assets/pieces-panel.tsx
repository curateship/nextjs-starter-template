import * as React from "react"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CopyIcon,
  FolderInputIcon,
  FunnelIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PinIcon,
  PinOffIcon,
  SearchIcon,
  SquarePenIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { LoadMoreButton } from "@/components/shared/load-more-button"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ChoiceRow, SectionLabel } from "@/components/video-assets/filter-menu-rows"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import {
  VIDEO_SORT_LABELS,
  VIDEO_SORTS,
  VIDEO_STATUS_LABELS,
  VIDEO_STATUSES,
  type VideoSort,
  type VideoStatus,
} from "@/lib/video/project-videos"

/**
 * The first tab on an editor's rail that lists what a project holds: the
 * Videos tab in the video editor and the Carousels tab in the carousel editor
 * (workspace/docs/project-videos.md, carousel-project-carousels.md). Tyler,
 * 1 Nov 2026: "carousels and videos need to have the same pattern".
 *
 * This draws and runs the list: the header's search, filter and + icons, the
 * count line with Select, the rows and their menu, paging, and the move and
 * delete windows. Each editor hands in its own data calls and words.
 */

/** What a row needs from a video or a carousel. */
export type PieceItem = {
  id: string
  name: string
  status: VideoStatus
  pinned: boolean
  archived: boolean
}

export type PieceQuery = {
  search: string
  sort: VideoSort
  status?: VideoStatus
  archived: boolean
  page: number
}

type BatchResult = { done_ids: string[]; skipped_ids: string[] }

export type PiecesAdapter<T extends PieceItem> = {
  /** "video" and "videos", or "carousel" and "carousels". */
  one: string
  many: string
  /** The tab's title: "Videos" or "Carousels", and its rail icon. */
  title: string
  icon: React.ReactNode
  /** The open project and the piece open in the editor. */
  projectId: string
  openId: string
  /** The open piece's name as the editor has it, so a rename shows at once. */
  openName: string
  /** False for a guest sent from Project, who may open but not change pieces. */
  canChange: boolean
  list: (query: PieceQuery) => Promise<{ items: T[]; total: number; page: number; total_pages: number }>
  /** Opens one in the editor; `inProject` when it moved to another project. */
  open: (id: string, inProject?: string) => Promise<void>
  /** The open piece is gone: open the project on the one it falls back to. */
  reopenProject: () => void
  rename: (id: string, name: string) => Promise<unknown>
  duplicate: (id: string) => Promise<unknown>
  setStatus: (id: string, status: VideoStatus) => Promise<unknown>
  pin: (id: string, pinned: boolean) => Promise<unknown>
  archive: (ids: string[], archived: boolean) => Promise<BatchResult>
  /** The person's other projects of this kind, for Move to project. */
  otherProjects: () => Promise<{ id: string; name: string }[]>
  move: (ids: string[], projectId: string) => Promise<BatchResult>
  /** Said under the move window's title. */
  moveNote: string
  deleteSummary: (ids: string[]) => Promise<{ count: number; exports: number }>
  remove: (ids: string[]) => Promise<{ deleted_ids: string[]; failed_ids?: string[] }>
  /** The delete window's sentence, once what goes is counted. */
  describeDelete: (summary: { count: number; exports: number }) => string
  errorMessage: (error: unknown) => string
  /** A row's picture and two lines of detail. */
  row: (item: T) => {
    thumbnail: string | null
    lines: [string, string]
    Icon: LucideIcon
    /** A third line, cut short, with its whole words on hover, such as a brief from Promo. */
    note?: { line: string; full: string }
  }
  /** True while a picture is being made, so the list looks again shortly. */
  pending?: (item: T) => boolean
  /** The header's + and what it opens; left out for a guest. */
  newButton?: React.ReactNode
  /** More rows for a piece's menu, under Archive. */
  extraMenu?: (item: T, reload: () => void) => React.ReactNode
}

// How long the search waits after the last key before it asks the server.
const SEARCH_DEBOUNCE_MS = 250
// How often the list looks again while a picture is being made.
const PICTURE_RECHECK_MS = 5000

type Filters = { sort: VideoSort; status: VideoStatus | "all"; archived: boolean }
const DEFAULT_FILTERS: Filters = { sort: "edited", status: "all", archived: false }

/**
 * What a panel last showed, per project. The editor is drawn afresh for every
 * video or carousel opened, so without this the list would vanish and load
 * again on each switch. A new panel starts from it, at the same scroll, and
 * then reads the list again quietly.
 */
type Remembered = {
  search: string
  filters: Filters
  items: unknown[]
  total: number
  page: number
  pages: number
  scrollTop: number
}
const remembered = new Map<string, Remembered>()

export function PiecesPanel<T extends PieceItem>({ adapter }: { adapter: PiecesAdapter<T> }) {
  const { projectId, openId, one, many, title, canChange } = adapter
  const memoryKey = `${many}:${projectId}`
  const [kept] = React.useState(() => remembered.get(memoryKey))
  const [search, setSearch] = React.useState(kept?.search ?? "")
  const [asked, setAsked] = React.useState(kept?.search.trim() ?? "")
  const [filters, setFilters] = React.useState<Filters>(kept?.filters ?? DEFAULT_FILTERS)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [items, setItems] = React.useState<T[] | null>((kept?.items as T[] | undefined) ?? null)
  const [total, setTotal] = React.useState(kept?.total ?? 0)
  const [page, setPage] = React.useState(kept?.page ?? 1)
  const [pages, setPages] = React.useState(kept?.pages ?? 1)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [reads, setReads] = React.useState(0)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const [moving, setMoving] = React.useState<string[] | null>(null)
  const [deleting, setDeleting] = React.useState<string[] | null>(null)
  const [selecting, setSelecting] = React.useState(false)
  const selection = useSelection()
  const reload = React.useCallback(() => setReads((count) => count + 1), [])
  // The calls change identity with every render of the editor; the list
  // reads them through a ref so it only reloads when what it asks changes.
  const adapterRef = React.useRef(adapter)
  React.useEffect(() => {
    adapterRef.current = adapter
  })

  const listRef = React.useRef<HTMLDivElement>(null)
  const scrollTop = React.useRef(kept?.scrollTop ?? 0)
  React.useLayoutEffect(() => {
    const viewport = listRef.current?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')
    if (!viewport) return
    viewport.scrollTop = scrollTop.current
    const onScroll = () => {
      scrollTop.current = viewport.scrollTop
      const entry = remembered.get(memoryKey)
      if (entry) entry.scrollTop = viewport.scrollTop
    }
    viewport.addEventListener("scroll", onScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", onScroll)
  }, [memoryKey])
  React.useEffect(() => {
    if (items === null) return
    remembered.set(memoryKey, {
      search,
      filters,
      items,
      total,
      page,
      pages,
      scrollTop: scrollTop.current,
    })
  }, [memoryKey, search, filters, items, total, page, pages])

  React.useEffect(() => {
    const timer = setTimeout(() => setAsked(search.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const query = React.useMemo(
    () => ({
      search: asked,
      sort: filters.sort,
      status: filters.status === "all" ? undefined : filters.status,
      archived: filters.archived,
    }),
    [asked, filters]
  )

  React.useEffect(() => {
    let active = true
    adapterRef.current
      .list({ ...query, page: 1 })
      .then((loaded) => {
        if (!active) return
        setItems(loaded.items)
        setTotal(loaded.total)
        setPage(1)
        setPages(loaded.total_pages)
        setLoadError(null)
      })
      .catch((error) => {
        if (!active) return
        setLoadError(adapterRef.current.errorMessage(error))
      })
    return () => {
      active = false
    }
  }, [query, reads, projectId])

  // A picture still being made is asked for again until it arrives.
  const waiting = (adapter.pending && items?.some(adapter.pending)) ?? false
  React.useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(reload, PICTURE_RECHECK_MS)
    return () => clearTimeout(timer)
  }, [reload, waiting, items])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const next = await adapter.list({ ...query, page: page + 1 })
      setItems((current) => [...(current ?? []), ...next.items])
      setPage(next.page)
      setPages(next.total_pages)
    } catch (error) {
      showErrorToast(adapter.errorMessage(error))
    } finally {
      setLoadingMore(false)
    }
  }

  async function open(id: string) {
    if (id === openId) return
    await adapter.open(id)
  }

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id)
    try {
      await action()
      reload()
    } catch (error) {
      showErrorToast(adapter.errorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  async function archive(ids: string[], archived: boolean) {
    try {
      const result = await adapter.archive(ids, archived)
      toast.success(
        describeBulkResult({
          done: result.done_ids.length,
          kept: result.skipped_ids.length,
          one,
          many,
          verb: archived ? "archived" : "brought back",
          keptReason: archived ? "already archived" : "not archived",
        })
      )
      selection.clear()
      reload()
    } catch (error) {
      showErrorToast(adapter.errorMessage(error))
    }
  }

  function toggleSelecting() {
    setSelecting((on) => !on)
    selection.clear()
  }

  const filterCount =
    (filters.sort !== DEFAULT_FILTERS.sort ? 1 : 0) +
    (filters.status !== "all" ? 1 : 0) +
    (filters.archived ? 1 : 0)
  const ticked = [...selection.selected]

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search, filter and + sit in the header as icons, as the Media panel
          has. Search and filter open popovers to the right, clear of the
          rail. */}
      <DashboardCardTitleHeader
        icon={adapter.icon}
        title={title}
        action={
          <div className="flex items-center gap-2">
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Search ${many}`}
                      aria-pressed={searchOpen}
                      className="relative"
                    >
                      <SearchIcon />
                      {search ? <SetDot /> : null}
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Search {many}</TooltipContent>
              </Tooltip>
              <PopoverContent side="right" align="start" className="studio-root w-60 p-2">
                <Input
                  autoFocus
                  type="search"
                  value={search}
                  placeholder={`Search ${many}`}
                  aria-label={`Search ${many}`}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </PopoverContent>
            </Popover>
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={filterCount ? `Filter ${many}, ${filterCount} set` : `Filter ${many}`}
                      aria-pressed={filterOpen}
                      className="relative"
                    >
                      <FunnelIcon />
                      {filterCount ? <SetDot /> : null}
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Filter {many}</TooltipContent>
              </Tooltip>
              {/* Drawn as the Media tab's filter menu: a heading per list,
                  a tick on the one picked, Clear filters under a line. */}
              <PopoverContent side="right" align="start" className="studio-root w-64 gap-0 p-0">
                <SectionLabel>Sort</SectionLabel>
                <div className="grid px-2">
                  {VIDEO_SORTS.map((sort) => (
                    <ChoiceRow
                      key={sort}
                      label={VIDEO_SORT_LABELS[sort]}
                      on={filters.sort === sort}
                      onSelect={() => setFilters({ ...filters, sort })}
                    />
                  ))}
                </div>
                <SectionLabel>Status</SectionLabel>
                <div className="grid px-2">
                  {(["all", ...VIDEO_STATUSES] as const).map((status) => (
                    <ChoiceRow
                      key={status}
                      label={status === "all" ? "Any status" : VIDEO_STATUS_LABELS[status]}
                      on={filters.status === status}
                      onSelect={() => setFilters({ ...filters, status })}
                    />
                  ))}
                </div>
                <SectionLabel>Show</SectionLabel>
                <div className="grid px-2">
                  {([false, true] as const).map((archived) => (
                    <ChoiceRow
                      key={String(archived)}
                      label={archived ? "Archived" : title}
                      on={filters.archived === archived}
                      onSelect={() => {
                        setFilters({ ...filters, archived })
                        selection.clear()
                      }}
                    />
                  ))}
                </div>
                {filterCount ? (
                  <div className="mt-3 grid border-t p-2">
                    <button
                      type="button"
                      onClick={() => setFilters(DEFAULT_FILTERS)}
                      className="flex h-9 items-center rounded-md px-3 text-left text-sm hover:bg-accent"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <div className="h-2" />
                )}
              </PopoverContent>
            </Popover>
            {canChange ? adapter.newButton : null}
          </div>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div ref={listRef} className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
          {loadError ? (
            <ErrorRow
              message={loadError}
              onRetry={reload}
            />
          ) : items === null ? null : !items?.length ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              {asked || filterCount
                ? `No ${one} matches. Clear the search or the filter to see them all.`
                : filters.archived
                  ? `No archived ${many} in this project.`
                  : `No ${many} in this project yet. Press + to make one.`}
            </p>
          ) : (
            <>
              {/* The Media tab's count line: a small-caps count, then Select. */}
              <div className="flex items-center justify-between gap-2">
                <span className="st-lbl min-w-0 tabular-nums">
                  {title} · {total.toLocaleString()}
                </span>
                {canChange ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-pressed={selecting}
                    className="shrink-0"
                    onClick={toggleSelecting}
                  >
                    {selecting ? "Done" : "Select"}
                  </Button>
                ) : null}
              </div>
              {ticked.length ? (
                <SelectedMenu
                  count={ticked.length}
                  onClear={selection.clear}
                  main={(menu) => (
                    <>
                      <SelectedMenuRow
                        onClick={() => {
                          menu.close()
                          void archive(ticked, !filters.archived)
                        }}
                      >
                        {filters.archived ? "Bring back" : "Archive"}
                      </SelectedMenuRow>
                      <SelectedMenuRow
                        onClick={() => {
                          menu.close()
                          setMoving(ticked)
                        }}
                      >
                        Move to project
                      </SelectedMenuRow>
                      <SelectedMenuRow
                        onClick={() => {
                          menu.close()
                          setDeleting(ticked)
                        }}
                        className="text-destructive"
                      >
                        Delete
                      </SelectedMenuRow>
                    </>
                  )}
                  pages={{}}
                />
              ) : null}

              <ul className="grid gap-1">
                {items.map((item) => (
                  <PieceRow
                    key={item.id}
                    item={item}
                    one={one}
                    details={adapter.row(item)}
                    name={item.id === openId ? adapter.openName : item.name}
                    current={item.id === openId}
                    canChange={canChange}
                    busy={busyId === item.id}
                    selecting={selecting}
                    ticked={selection.selected.has(item.id)}
                    renaming={renamingId === item.id}
                    extraMenu={adapter.extraMenu?.(item, reload)}
                    onTick={() => selection.toggle(item.id)}
                    onOpen={() => void open(item.id)}
                    onRename={() => setRenamingId(item.id)}
                    onRenamed={(name) => {
                      setRenamingId(null)
                      if (!name || name === item.name) return
                      void run(item.id, () => adapter.rename(item.id, name))
                    }}
                    onDuplicate={() => void run(item.id, () => adapter.duplicate(item.id))}
                    onStatus={(status) => void run(item.id, () => adapter.setStatus(item.id, status))}
                    onPin={() => void run(item.id, () => adapter.pin(item.id, !item.pinned))}
                    onArchive={() => void archive([item.id], !item.archived)}
                    onMove={() => setMoving([item.id])}
                    onDelete={() => setDeleting([item.id])}
                  />
                ))}
              </ul>
              {page < pages ? (
                <LoadMoreButton
                  loading={loadingMore}
                  className="justify-self-center"
                  onClick={() => void loadMore()}
                />
              ) : null}
            </>
          )}
        </div>
      </ScrollArea>
      <MoveDialog
        adapter={adapter}
        ids={moving}
        onClose={() => setMoving(null)}
        onMoved={(ids, toProjectId) => {
          setMoving(null)
          selection.clear()
          // The open one went too, so it is opened where it went.
          if (ids.includes(openId)) void adapter.open(openId, toProjectId)
          else reload()
        }}
      />
      <DeleteDialog
        adapter={adapter}
        ids={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(ids) => {
          setDeleting(null)
          selection.clear()
          // With the open one gone, the project opens on the one it falls back to.
          if (ids.includes(openId)) adapter.reopenProject()
          else reload()
        }}
      />
    </div>
  )
}

/** The small dot on a header icon that says a search or filter is set. */
function SetDot() {
  return (
    <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-(--acc) ring-2 ring-background" />
  )
}

function PieceRow<T extends PieceItem>({
  item,
  one,
  details,
  name,
  current,
  canChange,
  busy,
  selecting,
  ticked,
  renaming,
  extraMenu,
  onTick,
  onOpen,
  onRename,
  onRenamed,
  onDuplicate,
  onStatus,
  onPin,
  onArchive,
  onMove,
  onDelete,
}: {
  item: T
  one: string
  details: ReturnType<PiecesAdapter<T>["row"]>
  name: string
  current: boolean
  canChange: boolean
  busy: boolean
  selecting: boolean
  ticked: boolean
  renaming: boolean
  extraMenu?: React.ReactNode
  onTick: () => void
  onOpen: () => void
  onRename: () => void
  onRenamed: (name: string) => void
  onDuplicate: () => void
  onStatus: (status: VideoStatus) => void
  onPin: () => void
  onArchive: () => void
  onMove: () => void
  onDelete: () => void
}) {
  const [draft, setDraft] = React.useState(name)
  const { Icon } = details

  return (
    <li
      className={cn(
        "group/row relative grid min-w-0 gap-1 rounded-lg p-1.5",
        current ? "bg-accent text-accent-foreground" : "hover:bg-muted"
      )}
    >
      {renaming ? (
        <Input
          autoFocus
          value={draft}
          aria-label={`${one[0].toUpperCase()}${one.slice(1)} name`}
          className="min-w-0"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => onRenamed(draft.trim())}
          onKeyDown={(event) => {
            if (event.key === "Enter") onRenamed(draft.trim())
            if (event.key === "Escape") {
              setDraft(name)
              onRenamed("")
            }
          }}
        />
      ) : (
        <>
          {/* The picture on the left and the name beside it, with the
              details under the name (Tyler, 4 Nov 2026: "the title should be
              beside the thumbnail ... and make the thumbnail bigger"). */}
          <button
            type="button"
            aria-current={current ? "true" : undefined}
            onClick={onOpen}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              selecting && "pl-6"
            )}
          >
            <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
              {details.thumbnail ? (
                <img src={details.thumbnail} alt="" className="size-full object-cover" />
              ) : (
                <Icon className="size-5 text-muted-foreground" />
              )}
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="line-clamp-2 min-w-0 pr-6 text-xs font-medium [overflow-wrap:anywhere]">
                {item.pinned ? (
                  <PinIcon className="mr-0.5 inline size-3 text-muted-foreground" aria-label="Pinned" />
                ) : null}
                {name}
              </span>
              <span className="grid min-w-0 text-xs leading-tight text-muted-foreground tabular-nums">
                <span className="truncate">{details.lines[0]}</span>
                <span className="truncate">{details.lines[1]}</span>
                {details.note ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="truncate">{details.note.line}</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-80 whitespace-pre-wrap">{details.note.full}</TooltipContent>
                  </Tooltip>
                ) : null}
              </span>
            </span>
          </button>
          {selecting ? (
            <Checkbox
              checked={ticked}
              onCheckedChange={onTick}
              aria-label={`Select ${name}`}
              className="absolute top-1/2 left-1.5 -translate-y-1/2"
            />
          ) : null}
        </>
      )}
      {!canChange || renaming ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              aria-label={`More for ${name}`}
              className="absolute top-1 right-1 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
            >
              {busy ? <Loader2Icon className="animate-spin" /> : <MoreHorizontalIcon />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onSelect={() => {
                setDraft(name)
                onRename()
              }}
            >
              <SquarePenIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <CopyIcon />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onMove}>
              <FolderInputIcon />
              Move to project
            </DropdownMenuItem>
            {item.archived ? null : (
              <DropdownMenuItem onSelect={onPin}>
                {item.pinned ? <PinOffIcon /> : <PinIcon />}
                {item.pinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onArchive}>
              {item.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              {item.archived ? "Bring back" : "Archive"}
            </DropdownMenuItem>
            {extraMenu}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {VIDEO_STATUSES.map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={item.status === status}
                onSelect={() => {
                  if (item.status !== status) onStatus(status)
                }}
              >
                {VIDEO_STATUS_LABELS[status]}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  )
}

/** Picks another of the person's projects and moves the pieces into it. */
function MoveDialog<T extends PieceItem>({
  adapter,
  ids,
  onClose,
  onMoved,
}: {
  adapter: PiecesAdapter<T>
  ids: string[] | null
  onClose: () => void
  onMoved: (ids: string[], toProjectId: string) => void
}) {
  const open = ids !== null
  const [projects, setProjects] = React.useState<{ id: string; name: string }[] | null>(null)
  const [target, setTarget] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const adapterRef = React.useRef(adapter)
  React.useEffect(() => {
    adapterRef.current = adapter
  })

  React.useEffect(() => {
    if (!open) return
    let active = true
    adapterRef.current
      .otherProjects()
      .then((loaded) => {
        if (active) setProjects(loaded)
      })
      .catch((error) => showErrorToast(adapterRef.current.errorMessage(error)))
    return () => {
      active = false
    }
  }, [open])

  async function move() {
    if (!ids) return
    if (!target) {
      showErrorToast("Pick the project to move to.")
      return
    }
    setBusy(true)
    try {
      const result = await adapter.move(ids, target)
      toast.success(
        describeBulkResult({
          done: result.done_ids.length,
          kept: result.skipped_ids.length,
          one: adapter.one,
          many: adapter.many,
          verb: "moved",
          keptReason: "already there or not yours",
        })
      )
      setTarget("")
      onMoved(result.done_ids, target)
    } catch (error) {
      showErrorToast(adapter.errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const count = ids?.length ?? 0
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Move {count === 1 ? adapter.one : `${count} ${adapter.many}`} to a project
          </DialogTitle>
          <DialogDescription>{adapter.moveNote}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-2">
            <Label htmlFor="move-piece-project">Project</Label>
            {projects === null ? (
              <LoadingRow label="Loading your projects" />
            ) : projects.length ? (
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger id="move-piece-project">
                  <SelectValue placeholder="Pick a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                You have no other project to move to. Make one from the projects list first.
              </p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="lg" disabled={busy} onClick={() => void move()}>
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Says what goes with the pieces, then deletes them. */
function DeleteDialog<T extends PieceItem>({
  adapter,
  ids,
  onClose,
  onDeleted,
}: {
  adapter: PiecesAdapter<T>
  ids: string[] | null
  onClose: () => void
  onDeleted: (ids: string[]) => void
}) {
  const open = ids !== null
  // The count belongs to the ids it was read for, so a window opened for
  // others never shows the last window's count.
  const askedFor = ids?.join(",") ?? ""
  const [counted, setCounted] = React.useState<{
    for: string
    count: number
    exports: number
  } | null>(null)
  const summary = counted?.for === askedFor ? counted : null
  const [busy, setBusy] = React.useState(false)
  const adapterRef = React.useRef(adapter)
  React.useEffect(() => {
    adapterRef.current = adapter
  })

  React.useEffect(() => {
    if (!ids) return
    let active = true
    adapterRef.current
      .deleteSummary(ids)
      .then((loaded) => {
        if (active) setCounted({ for: ids.join(","), ...loaded })
      })
      .catch((error) => showErrorToast(adapterRef.current.errorMessage(error)))
    return () => {
      active = false
    }
  }, [ids])

  async function remove() {
    if (!ids) return
    setBusy(true)
    try {
      const result = await adapter.remove(ids)
      const failed = result.failed_ids?.length ?? 0
      if (failed) {
        showErrorToast(
          `${failed} ${plural(failed, adapter.one, adapter.many)} could not be deleted, because a file would not come out of storage. Try again.`
        )
      } else {
        toast.success(
          `${result.deleted_ids.length} ${plural(result.deleted_ids.length, adapter.one, adapter.many)} deleted.`
        )
      }
      onDeleted(result.deleted_ids)
    } catch (error) {
      showErrorToast(adapter.errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const count = ids?.length ?? 0
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={count === 1 ? `Delete this ${adapter.one}?` : `Delete ${count} ${adapter.many}?`}
      description={
        summary ? adapter.describeDelete(summary) : "Counting what goes with them."
      }
      confirmLabel="Delete"
      loading={busy}
      onConfirm={() => void remove()}
    />
  )
}
