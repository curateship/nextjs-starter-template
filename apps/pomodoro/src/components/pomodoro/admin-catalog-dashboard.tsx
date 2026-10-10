import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  FilmIcon,
  GripVerticalIcon,
  ImageIcon,
  ImportIcon,
  Loader2Icon,
  LockIcon,
  LockOpenIcon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import {
  AdminListTable,
  AdminSelectCell,
  useAdminList,
} from "@/components/pomodoro/admin-list"
import {
  AdminBulkDeleteButton,
  AdminDeleteConfirm,
  AdminRowDeleteButton,
  useAdminDelete,
} from "@/components/pomodoro/admin-delete"
import { AdminCatalogDialog } from "@/components/pomodoro/admin-catalog-dialog"
import { SoundWave } from "@/components/pomodoro/sound-wave"
import { AdminCatalogImportDialog } from "@/components/pomodoro/admin-catalog-import-dialog"
import { AdminCatalogYoutubeDialog } from "@/components/pomodoro/admin-catalog-youtube-dialog"
import {
  createCatalogDraftsFromFiles,
  deleteCatalogItems,
  getCatalogAdminErrorMessage,
  listCatalogItems,
  loadCatalogTags,
  reorderCatalog,
  setCatalogLocked,
  setCatalogStatus,
  uploadCatalogSource,
  type AdminCatalogRow,
  type CatalogBulkResult,
} from "@/lib/api/pomodoro/admin-catalog"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import {
  CATALOG_BULK_ACCEPT,
  CATALOG_BULK_MAX,
  DESCRIPTOR_LABELS,
  formatClock,
  measureAudioFile,
  soundLengthProblem,
  type CatalogKind,
  type CatalogSearch,
  type CatalogSortColumn,
} from "@/lib/pomodoro/admin-catalog"
import type { SoundReference } from "@/lib/pomodoro/sound-catalog"
import { usePreviewAudio } from "@/lib/pomodoro/use-preview-audio"
import { waitsForPixabayFile } from "@/lib/pomodoro/pixabay-links"
import { isYoutubeClipImport } from "@/lib/pomodoro/youtube-links"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The Themes and Sounds dashboards, one component for both. See
 * `workspace/docs/catalog-admin.md`.
 *
 * A row is one item, Draft or Live, with its picture, whether it is free or
 * Pro, and how many personal rooms and open rooms have it. Its name or its cog
 * opens the window; the bin deletes it. Ticked rows can be made Free, Pro,
 * Draft or Live in one press. Rows drag into the order members see while the
 * list is in that order with every item on one page.
 */

const COLUMNS: TableHeaderColumn<CatalogSortColumn>[] = [
  { key: "name", label: "Name", column: "main" },
  { key: "status", label: "Status", column: "meta" },
  { key: "chosen", label: "Chosen by", column: "meta" },
  {
    key: "added",
    label: "Added",
    column: "meta",
    className: "hidden 2xl:table-cell",
  },
]

const WORDS: Record<
  CatalogKind,
  { title: string; one: string; many: string; create: string }
> = {
  theme: { title: "Themes", one: "theme", many: "themes", create: "New theme" },
  sound: { title: "Sounds", one: "sound", many: "sounds", create: "New sound" },
}

type BulkAction = "free" | "pro" | "draft" | "live"

const BULK_VERB: Record<BulkAction, string> = {
  free: "set to Free",
  pro: "set to Pro",
  draft: "set to Draft",
  live: "set to Live",
}

export function AdminCatalogDashboard({
  kind,
  search,
  initial,
  initialPageSize,
  initialTags,
}: {
  kind: CatalogKind
  search: CatalogSearch
  initial: { rows: AdminCatalogRow[]; total: number }
  initialPageSize: number
  /** Every tag on this kind, for the filter and the window's suggestions. */
  initialTags: string[]
}) {
  const words = WORDS[kind]
  const navigate = useNavigate()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const status = search.status ?? "all"
  const access = search.access ?? "all"
  const tag = search.tag ?? null
  const [tags, setTags] = React.useState(initialTags)
  const sort: CatalogSortColumn = search.sort ?? "position"
  const direction = search.direction ?? "asc"
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const setOpen = React.useCallback(
    (id: string | undefined) => {
      // Not `replace`: Back closes the window, the way every record window does.
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

  const selection = useSelection()
  const [searchText, setSearchText] = useSearchBoxText(query, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )

  const load = React.useCallback(
    (pageSize: number) =>
      listCatalogItems({
        kind,
        search: query,
        status,
        access,
        tag,
        sort,
        direction,
        page,
        pageSize,
      }),
    [access, direction, kind, page, query, sort, status, tag]
  )
  const list = useAdminList({
    initial,
    initialPageSize,
    page,
    onPageChange: setPage,
    load,
  })
  const toggleSort = useListSort<CatalogSortColumn>({ sort, direction }, (column) =>
    column === "chosen" || column === "added" ? "desc" : "asc"
  )

  // Dragged rows are drawn in their new order while the save is out, then the
  // server's answer takes over.
  const [dragOrder, setDragOrder] = React.useState<string[] | null>(null)
  const rows = React.useMemo(() => {
    if (!dragOrder) return list.rows
    const byId = new Map(list.rows.map((row) => [row.id, row]))
    return dragOrder.flatMap((id) => byId.get(id) ?? [])
  }, [dragOrder, list.rows])
  const rowIds = React.useMemo(() => rows.map((row) => row.id), [rows])
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))

  const canDrag =
    sort === "position" &&
    direction === "asc" &&
    !query &&
    status === "all" &&
    access === "all" &&
    !tag &&
    list.total <= list.pageSize

  const del = useAdminDelete({
    one: words.one,
    many: words.many,
    run: deleteCatalogItems,
    keptReason: "already gone",
    selection,
    onDone: list.refresh,
  })
  const asked = list.rows.filter((row) => del.ids.includes(row.id))

  const [bulkBusy, setBulkBusy] = React.useState<BulkAction | "upload" | null>(null)
  const runBulk = async (action: BulkAction) => {
    setBulkBusy(action)
    try {
      const result: CatalogBulkResult =
        action === "free" || action === "pro"
          ? await setCatalogLocked(selectedIds, action === "pro")
          : await setCatalogStatus(selectedIds, action)
      const line = describeBulkResult({
        done: result.changed.length,
        same: result.same.length,
        kept: result.skipped.length,
        one: words.one,
        many: words.many,
        verb: BULK_VERB[action],
        keptReason:
          action === "live" ? "missing a picture or a file" : "already gone",
      })
      if (result.changed.length || result.same.length) toast.success(line)
      else showErrorToast(line)
      selection.clear()
      await list.refresh()
    } catch (error) {
      showErrorToast(getCatalogAdminErrorMessage(error))
    } finally {
      setBulkBusy(null)
    }
  }

  const [importing, setImporting] = React.useState(false)
  const [clipping, setClipping] = React.useState(false)
  const bulkInputRef = React.useRef<HTMLInputElement>(null)
  const uploadSeveral = async (files: File[]) => {
    if (files.length > CATALOG_BULK_MAX) {
      showErrorToast(`Choose up to ${CATALOG_BULK_MAX} files at a time.`)
      return
    }
    setBulkBusy("upload")
    const stored: Parameters<typeof createCatalogDraftsFromFiles>[1] = []
    let wrongLength = 0
    let failed = 0
    try {
      for (const file of files) {
        if (kind === "sound") {
          const seconds = await measureAudioFile(file).catch(() => null)
          if (seconds === null || soundLengthProblem(seconds)) {
            wrongLength += 1
            continue
          }
        }
        try {
          const upload = await uploadCatalogSource(file)
          stored.push({ name: file.name, ...upload })
        } catch {
          failed += 1
        }
      }
      if (stored.length) await createCatalogDraftsFromFiles(kind, stored)
      const parts = [
        `${stored.length} ${plural(stored.length, words.one, words.many)} added as drafts.`,
      ]
      if (wrongLength)
        parts.push(
          `${wrongLength} ${plural(wrongLength, "was", "were")} not 2 to 5 minutes long.`
        )
      if (failed)
        parts.push(`${failed} could not be sent.`)
      if (stored.length) toast.success(parts.join(" "))
      else showErrorToast(parts.join(" "))
      await list.refresh()
    } catch (error) {
      showErrorToast(getCatalogAdminErrorMessage(error))
    } finally {
      setBulkBusy(null)
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const next = arrayMove(
      rowIds,
      rowIds.indexOf(String(active.id)),
      rowIds.indexOf(String(over.id))
    )
    setDragOrder(next)
    try {
      await reorderCatalog(kind, next)
      await list.refresh()
    } catch (error) {
      showErrorToast(getCatalogAdminErrorMessage(error))
    } finally {
      setDragOrder(null)
    }
  }

  const preview = usePreviewAudio()

  return (
    // Outside the table: the drag library adds its own hidden notes for screen
    // readers, which may not sit inside a table body. The id keeps them the
    // same on the server and in the browser.
    <DndContext
      id={`catalog-${kind}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event) => void onDragEnd(event)}
    >
      <AdminListTable
        title={words.title}
        icon={kind === "theme" ? <ImageIcon /> : <MusicIcon />}
        noun={words.many}
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: words.many, rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            {selectedIds.length ? (
              <>
                <AdminBulkDeleteButton del={del} ids={selectedIds} />
                <BulkButton
                  icon={<LockOpenIcon className="size-4" />}
                  label="Free"
                  busy={bulkBusy}
                  action="free"
                  onClick={() => void runBulk("free")}
                />
                <BulkButton
                  icon={<LockIcon className="size-4" />}
                  label="Pro"
                  busy={bulkBusy}
                  action="pro"
                  onClick={() => void runBulk("pro")}
                />
                <BulkButton
                  icon={<EyeOffIcon className="size-4" />}
                  label="Draft"
                  busy={bulkBusy}
                  action="draft"
                  onClick={() => void runBulk("draft")}
                />
                <BulkButton
                  icon={<EyeIcon className="size-4" />}
                  label="Live"
                  busy={bulkBusy}
                  action="live"
                  onClick={() => void runBulk("live")}
                />
              </>
            ) : null}
            <DashboardToolbarSearch
              name={`${kind}-search`}
              aria-label={`Search ${words.many}`}
              placeholder="Search name…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select
              value={status}
              onValueChange={(value) =>
                setListSearch({
                  status: value === "all" ? undefined : value,
                  page: undefined,
                })
              }
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by Draft or Live">
                <SelectValue placeholder="Status" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Draft and Live</SelectItem>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={access}
              onValueChange={(value) =>
                setListSearch({
                  access: value === "all" ? undefined : value,
                  page: undefined,
                })
              }
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by Free or Pro">
                <SelectValue placeholder="Access" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Free and Pro</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
              </SelectContent>
            </Select>
            {tags.length ? (
              <Select
                value={tag ?? "all"}
                onValueChange={(value) =>
                  setListSearch({
                    tag: value === "all" ? undefined : value,
                    page: undefined,
                  })
                }
              >
                <DashboardToolbarSelectTrigger aria-label="Filter by tag">
                  <SelectValue placeholder="Tag" />
                </DashboardToolbarSelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any tag</SelectItem>
                  {tags.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <input
              ref={bulkInputRef}
              type="file"
              multiple
              className="sr-only"
              aria-label={`Upload several ${words.many}`}
              accept={CATALOG_BULK_ACCEPT[kind]}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? [])
                event.target.value = ""
                if (files.length) void uploadSeveral(files)
              }}
            />
            <DashboardToolbarButton
              type="button"
              variant="outline"
              disabled={bulkBusy === "upload"}
              onClick={() => bulkInputRef.current?.click()}
            >
              {bulkBusy === "upload" ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <UploadIcon className="size-4" />
              )}
              Upload several
            </DashboardToolbarButton>
            {kind === "theme" ? (
              // Two ways in share one button so the toolbar still fits on one
              // line at 1440px. A clip is a film, so Sounds has no menu.
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <DashboardToolbarButton type="button" variant="outline">
                    <ImportIcon className="size-4" />
                    Import
                    <ChevronDownIcon className="size-4" />
                  </DashboardToolbarButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setImporting(true)}>
                    <ImportIcon aria-hidden="true" />
                    Pixabay links
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setClipping(true)}>
                    <FilmIcon aria-hidden="true" />
                    YouTube clip
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              // "Pixabay" on its face so the toolbar fits on one line at
              // 1440px; its name for a screen reader says what it does.
              <DashboardToolbarButton
                type="button"
                variant="outline"
                aria-label="Import from Pixabay"
                onClick={() => setImporting(true)}
              >
                <ImportIcon className="size-4" />
                Pixabay
              </DashboardToolbarButton>
            )}
            <DashboardToolbarButton type="button" onClick={() => setOpen("new")}>
              <PlusIcon className="size-4" />
              {words.create}
            </DashboardToolbarButton>
          </>
        }
      >
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
          {rows.map((row) => (
            <CatalogRow
              key={row.id}
              kind={kind}
              row={row}
              canDrag={canDrag}
              selection={selection}
              onOpen={() => setOpen(row.id)}
              del={del}
              preview={preview}
            />
          ))}
        </SortableContext>
      </AdminListTable>
      {canDrag ? null : (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Rows drag into the order members see while the list is in that order,
          unfiltered and on one page.
          {sort !== "position" || direction !== "asc" ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() =>
                setListSearch({ sort: undefined, direction: undefined, page: undefined })
              }
            >
              Show members' order
            </Button>
          ) : null}
        </p>
      )}
      <AdminCatalogDialog
        kind={kind}
        openId={search.open}
        onClose={() => setOpen(undefined)}
        onSaved={async () => {
          await list.refresh()
          setTags(await loadCatalogTags(kind).catch(() => tags))
        }}
        knownTags={tags}
        onDelete={(id) => del.ask([id])}
      />
      <AdminCatalogImportDialog
        kind={kind}
        open={importing}
        onClose={() => setImporting(false)}
        onImported={list.refresh}
      />
      {kind === "theme" ? (
        <AdminCatalogYoutubeDialog
          open={clipping}
          onClose={() => setClipping(false)}
          onImported={list.refresh}
        />
      ) : null}
      <AdminDeleteConfirm
        del={del}
        title={
          asked.length === 1
            ? `Delete ${asked[0].label}?`
            : `Delete ${del.ids.length} ${plural(del.ids.length, words.one, words.many)}?`
        }
        description={describeDeletion(asked, words.one)}
        confirmLabel={plural(
          del.ids.length,
          `Delete ${words.one}`,
          `Delete ${words.many}`
        )}
      />
    </DndContext>
  )
}

function describeDeletion(rows: AdminCatalogRow[], one: string) {
  const people = rows.reduce((sum, row) => sum + row.personalCount, 0)
  const openRooms = rows.reduce((sum, row) => sum + row.roomCount, 0)
  const fallback = one === "sound" ? "silence" : "the default scene, Lofi girl"
  const using =
    people || openRooms
      ? `${people} ${plural(people, "person has", "people have")} it in their personal room and ${openRooms} open ${plural(openRooms, "room uses", "rooms use")} it. They get ${fallback} instead.`
      : "Nobody has it in a room right now."
  return `${using} Its uploaded files are removed. This cannot be undone.`
}

function CatalogRow({
  kind,
  row,
  canDrag,
  selection,
  onOpen,
  del,
  preview,
}: {
  kind: CatalogKind
  row: AdminCatalogRow
  canDrag: boolean
  selection: ReturnType<typeof useSelection>
  onOpen: () => void
  del: ReturnType<typeof useAdminDelete>
  preview: ReturnType<typeof usePreviewAudio>
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: row.id, disabled: !canDrag })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const reference: SoundReference | null =
    kind === "sound" && row.fileUrl
      ? { type: "curated", key: row.key, url: row.fileUrl }
      : null
  const previewing =
    reference !== null &&
    preview.previewing?.type === "curated" &&
    preview.previewing.key === row.key
  const playing = previewing && preview.playing

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className="group"
      rowAction={onOpen}
    >
      <AdminSelectCell selection={selection} id={row.id} label={`Select ${row.label}`} />
      <TableCell column="main">
        <div className="flex min-w-0 items-center gap-3">
          {canDrag ? (
            <button
              type="button"
              className="cursor-grab text-muted-foreground active:cursor-grabbing"
              aria-label={`Drag ${row.label} to a new place`}
              {...attributes}
              {...listeners}
            >
              <GripVerticalIcon className="size-4" />
            </button>
          ) : null}
          {row.kind === "sound" ? (
            <span className="h-9 w-14 shrink-0 overflow-hidden rounded-md">
              <SoundWave seed={row.key} />
            </span>
          ) : row.pictureUrl ? (
            <img
              src={row.pictureUrl}
              alt=""
              className="h-9 w-14 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span className="h-9 w-14 shrink-0 rounded-md bg-muted" />
          )}
          <div className="min-w-0">
            <button
              type="button"
              className="block max-w-80 truncate text-left text-sm font-medium group-hover:underline"
              onClick={onOpen}
              title={row.label}
            >
              {row.label}
            </button>
            <span className="block max-w-80 truncate text-xs text-muted-foreground">
              {[
                DESCRIPTOR_LABELS[row.descriptor] ?? row.descriptor,
                row.durationSeconds ? formatClock(row.durationSeconds) : null,
                row.locked ? "Pro" : "Free",
                row.tags.length ? row.tags.join(", ") : null,
                fileLine(row),
                row.status === "live" && !row.licence ? "No licence set" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {waitsForPixabayFile(row) && row.sourceUrl ? (
              <a
                href={row.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium underline underline-offset-2"
              >
                Open on Pixabay
              </a>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell column="meta">
        <Badge variant={row.status === "live" ? "default" : "outline"}>
          {row.status === "live" ? "Live" : "Draft"}
        </Badge>
      </TableCell>
      <TableCell column="meta">
        {row.personalCount} {plural(row.personalCount, "person", "people")}
        {row.roomCount ? (
          <span className="text-muted-foreground">
            , {row.roomCount} {plural(row.roomCount, "room", "rooms")}
          </span>
        ) : null}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden 2xl:table-cell">
        {formatDate(row.createdAt)}
      </TableCell>
      <TableCell column="actions">
        {reference ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-pressed={playing}
            aria-label={playing ? `Stop ${row.label}` : `Play ${row.label}`}
            onClick={() => preview.toggle(reference)}
          >
            {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Settings for ${row.label}`}
          onClick={onOpen}
        >
          <SettingsIcon className="size-4" />
        </Button>
        <AdminRowDeleteButton del={del} id={row.id} label={`Delete ${row.label}`} />
      </TableCell>
    </TableRow>
  )
}

/** What the worker is doing with a new file, when it is doing anything. */
function fileLine(row: AdminCatalogRow) {
  if (row.fileStatus === "queued" || row.fileStatus === "processing")
    return row.importUrl
      ? isYoutubeClipImport(row.importUrl)
        ? "Fetching from YouTube"
        : "Fetching from Pixabay"
      : "Preparing the file"
  if (row.fileStatus === "failed")
    return row.fileError ? `File refused: ${row.fileError}` : "File refused"
  if (waitsForPixabayFile(row)) return "Needs the file from Pixabay"
  return null
}

function BulkButton({
  icon,
  label,
  action,
  busy,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  action: BulkAction
  busy: BulkAction | "upload" | null
  onClick: () => void
}) {
  return (
    <DashboardToolbarButton
      type="button"
      variant="outline"
      disabled={busy !== null}
      onClick={onClick}
    >
      {busy === action ? <Loader2Icon className="size-4 animate-spin" /> : icon}
      {label}
    </DashboardToolbarButton>
  )
}
