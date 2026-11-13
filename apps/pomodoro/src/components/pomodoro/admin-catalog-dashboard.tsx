import * as React from "react"
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
  Trash2Icon,
  UploadIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TableCell } from "@/components/ui/table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { SelectedMenuRow, SelectedMenuSeparator } from "@/components/shared/mass-select"
import { PanelCard } from "@/components/shared/panel-card"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Chip, MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList, useMassSelectOn } from "@/components/pomodoro/admin-list"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { DetailRecord, NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { FilterPick } from "@/components/pomodoro/flowfly/filter-pick"
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
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import {
  CATALOG_BULK_ACCEPT,
  CATALOG_LICENCES,
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
 * Library → Backgrounds and Library → Sounds on the Flowfly dashboard, one
 * component for both (Tyler, 13 Nov 2026: "the backgrounds, sound, ai
 * generations and members upload can be in one dashboard. We just need
 * filtering and tabs to seperate them"). See `workspace/docs/catalog-admin.md`.
 *
 * A row is one item, Draft or Live, with its picture, whether it is free or
 * Pro, and how many personal rooms and open rooms have it. It opens on the
 * right with its picture or sound, its details, files and credits, and Make
 * live or Back to draft at the foot; Change opens the window that edits
 * them. Ticked rows can be made Free, Pro, Draft or Live in one press. With
 * Select on and the list in members' order on one page, rows drag into the
 * order members see. New, Upload several and the imports are the New
 * button's dropdown.
 */

const COLUMNS: TableHeaderColumn<CatalogSortColumn>[] = [
  { key: "name", label: "Name", column: "main" },
  { key: "status", label: "Status", column: "meta" },
  { key: "chosen", label: "Chosen by", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
  { key: "added", label: "Added", column: "meta", className: "hidden md:hidden @4xl:table-cell" },
]

const WORDS: Record<CatalogKind, { title: string; one: string; many: string; create: string }> = {
  theme: { title: "Backgrounds", one: "background", many: "backgrounds", create: "New background" },
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
  // The item window: an item's id, "new", or shut.
  const [windowFor, setWindowFor] = React.useState<string | undefined>(undefined)

  const selection = useSelection()

  const load = React.useCallback(
    (pageSize: number) => listCatalogItems({ kind, search: query, status, access, tag, sort, direction, page, pageSize }),
    [access, direction, kind, page, query, sort, status, tag]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
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
  // One running action holds every other button on the list until it ends.
  const busy = bulkBusy !== null || del.deleting
  const runBulk = async (ids: string[], action: BulkAction) => {
    setBulkBusy(action)
    try {
      const result: CatalogBulkResult =
        action === "free" || action === "pro" ? await setCatalogLocked(ids, action === "pro") : await setCatalogStatus(ids, action)
      const line = describeBulkResult({
        done: result.changed.length,
        same: result.same.length,
        kept: result.skipped.length,
        one: words.one,
        many: words.many,
        verb: BULK_VERB[action],
        keptReason: action === "live" ? "missing a picture or a file" : "already gone",
      })
      if (!result.changed.length && !result.same.length) showErrorToast(line)
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
      if (!stored.length || failed) showErrorToast(parts.join(" "))
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
    const next = arrayMove(rowIds, rowIds.indexOf(String(active.id)), rowIds.indexOf(String(over.id)))
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
  const filterCount = (status !== "all" ? 1 : 0) + (access !== "all" ? 1 : 0) + (tag ? 1 : 0)

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
        noun={words.many}
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        selection={{ noun: words.many, rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        search={{
          name: `${kind}-search`,
          label: `Search ${words.many}`,
          placeholder: "Search name",
          value: query,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
        }}
        filter={{
          count: filterCount,
          onClear: () => setListSearch({ status: undefined, access: undefined, tag: undefined, page: undefined }),
          children: (
            <>
              <FilterPick
                id={`${kind}-status`}
                label="Status"
                value={status === "all" ? undefined : status}
                any="Draft and Live"
                options={[
                  ["live", "Live"],
                  ["draft", "Draft"],
                ]}
                onChange={(next) => setListSearch({ status: next, page: undefined })}
              />
              <FilterPick
                id={`${kind}-access`}
                label="Free or Pro"
                value={access === "all" ? undefined : access}
                any="Free and Pro"
                options={[
                  ["free", "Free"],
                  ["pro", "Pro"],
                ]}
                onChange={(next) => setListSearch({ access: next, page: undefined })}
              />
              {tags.length ? (
                <FilterPick
                  id={`${kind}-tag`}
                  label="Tag"
                  value={tag ?? undefined}
                  any="Any tag"
                  options={tags.map((value) => [value, value])}
                  onChange={(next) => setListSearch({ tag: next, page: undefined })}
                />
              ) : null}
            </>
          ),
        }}
        footnote={
          canDrag ? undefined : (
            <>
              Rows drag into the order members see while the list is in that order, unfiltered and on one page.{" "}
              {sort !== "position" || direction !== "asc" ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => setListSearch({ sort: undefined, direction: undefined, page: undefined })}
                >
                  Show members' order
                </Button>
              ) : null}
            </>
          )
        }
        primary={
          <>
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
            {/* The one New button; the other ways in are its dropdown (Tyler's
                pick: "New, Upload several, Import and Pixabay go in the New
                button's dropdown"). */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <DashboardToolbarButton type="button" disabled={busy}>
                  {bulkBusy === "upload" ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
                  <span className="@max-3xl:sr-only">{words.create}</span>
                </DashboardToolbarButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuItem onSelect={() => setWindowFor("new")}>
                  <PlusIcon />
                  {words.create}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => bulkInputRef.current?.click()}>
                  <UploadIcon />
                  Upload several
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setImporting(true)}>
                  <ImportIcon />
                  Import Pixabay links
                </DropdownMenuItem>
                {kind === "theme" ? (
                  <DropdownMenuItem onSelect={() => setClipping(true)}>
                    <FilmIcon />
                    Import a YouTube clip
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        bulk={(ids, menu) => {
          const run = (work: () => void) => () => {
            menu.close()
            work()
          }
          return (
            <>
              <SelectedMenuRow onClick={run(() => void runBulk(ids, "live"))}>
                <EyeIcon className="size-4" />
                Make live
              </SelectedMenuRow>
              <SelectedMenuRow onClick={run(() => void runBulk(ids, "draft"))}>
                <EyeOffIcon className="size-4" />
                Back to draft
              </SelectedMenuRow>
              <SelectedMenuRow onClick={run(() => void runBulk(ids, "free"))}>
                <LockOpenIcon className="size-4" />
                Free
              </SelectedMenuRow>
              <SelectedMenuRow onClick={run(() => void runBulk(ids, "pro"))}>
                <LockIcon className="size-4" />
                Pro
              </SelectedMenuRow>
              <SelectedMenuSeparator />
              <SelectedMenuRow className="text-destructive" onClick={run(() => del.ask(ids))}>
                <Trash2Icon className="size-4" />
                Delete
              </SelectedMenuRow>
            </>
          )
        }}
        bulkBusy={busy}
        rowIds={rowIds}
        record={{
          label: kind === "sound" ? "Sound" : "Background",
          content: (openId) => {
            const row = rows.find((each) => each.id === openId)
            if (!row)
              return (
                <NoRecord
                  title={kind === "sound" ? "Sound" : "Background"}
                  icon={kind === "sound" ? <MusicIcon aria-hidden /> : <ImageIcon aria-hidden />}
                  line={`No ${words.many} yet. ${words.create} makes one.`}
                />
              )
            return (
              <CatalogRecord
                key={row.id}
                kind={kind}
                row={row}
                busy={busy}
                preview={preview}
                onChange={() => setWindowFor(row.id)}
                onStatus={(next) => void runBulk([row.id], next)}
                onDelete={() => del.ask([row.id])}
              />
            )
          },
        }}
        windows={
          <>
            <AdminCatalogDialog
              kind={kind}
              openId={windowFor}
              onClose={() => setWindowFor(undefined)}
              onSaved={async () => {
                await list.refresh()
                setTags(await loadCatalogTags(kind).catch(() => tags))
              }}
              knownTags={tags}
              onDelete={(id) => {
                setWindowFor(undefined)
                del.ask([id])
              }}
            />
            <AdminCatalogImportDialog kind={kind} open={importing} onClose={() => setImporting(false)} onImported={list.refresh} />
            {kind === "theme" ? (
              <AdminCatalogYoutubeDialog open={clipping} onClose={() => setClipping(false)} onImported={list.refresh} />
            ) : null}
            <AdminDeleteConfirm
              del={del}
              title={
                asked.length === 1
                  ? `Delete ${asked[0].label}?`
                  : `Delete ${del.ids.length} ${plural(del.ids.length, words.one, words.many)}?`
              }
              description={describeDeletion(asked, words.one)}
              confirmLabel={plural(del.ids.length, `Delete ${words.one}`, `Delete ${words.many}`)}
            />
          </>
        }
      >
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
          {rows.map((row) => (
            <CatalogRow key={row.id} kind={kind} row={row} canDrag={canDrag} onDelete={() => del.ask([row.id])} preview={preview} />
          ))}
        </SortableContext>
      </AdminListTable>
    </DndContext>
  )
}

function describeDeletion(rows: AdminCatalogRow[], one: string) {
  const people = rows.reduce((sum, row) => sum + row.personalCount, 0)
  const openRooms = rows.reduce((sum, row) => sum + row.roomCount, 0)
  const fallback = one === "sound" ? "silence" : "the default background, Lofi girl"
  const using =
    people || openRooms
      ? `${people} ${plural(people, "person has", "people have")} it in their personal room and ${openRooms} open ${plural(openRooms, "room uses", "rooms use")} it. They get ${fallback} instead.`
      : "Nobody has it in a room right now."
  return `${using} Its uploaded files are removed. This cannot be undone.`
}

/** The line under an item's name: what it is, its length, Free or Pro, its tags and any file trouble. */
function rowLine(row: AdminCatalogRow) {
  return [
    DESCRIPTOR_LABELS[row.descriptor] ?? row.descriptor,
    row.durationSeconds ? formatClock(row.durationSeconds) : null,
    row.locked ? "Pro" : "Free",
    row.tags.length ? row.tags.join(", ") : null,
    fileLine(row),
    row.status === "live" && !row.licence ? "No licence set" : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

/** The small picture at the front of a row, or a sound's drawn wave. */
function CatalogThumb({ row }: { row: AdminCatalogRow }) {
  if (row.kind === "sound")
    return (
      <span className="h-7 w-11 shrink-0 overflow-hidden rounded-md">
        <SoundWave seed={row.key} />
      </span>
    )
  return row.pictureUrl ? (
    <img src={row.pictureUrl} alt="" className="h-7 w-11 shrink-0 rounded-md object-cover" />
  ) : (
    <span className="h-7 w-11 shrink-0 rounded-md bg-muted" />
  )
}

/**
 * One item's row. While Select is on and the list can be reordered, a grip
 * leads it and the row drags into the order members see. The drag library
 * holds the table row itself, found from the grip, since the shell's row
 * takes no ref of its own.
 */
function CatalogRow({
  kind,
  row,
  canDrag,
  onDelete,
  preview,
}: {
  kind: CatalogKind
  row: AdminCatalogRow
  canDrag: boolean
  onDelete: () => void
  preview: ReturnType<typeof usePreviewAudio>
}) {
  const selecting = useMassSelectOn()
  const draggable = canDrag && selecting
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: row.id, disabled: !draggable })
  const gripRef = React.useRef<HTMLButtonElement | null>(null)
  React.useLayoutEffect(() => {
    const tr = gripRef.current?.closest("tr")
    if (!tr) return
    tr.style.transform = CSS.Transform.toString(transform) ?? ""
    tr.style.transition = transition ?? ""
  }, [transform, transition])
  const reference: SoundReference | null =
    kind === "sound" && row.fileUrl ? { type: "curated", key: row.key, url: row.fileUrl } : null
  const playing = reference !== null && preview.playing && preview.previewing?.type === "curated" && preview.previewing.key === row.key

  return (
    <AdminRow
      id={row.id}
      label={row.label}
      onDelete={onDelete}
      buttons={
        reference
          ? [{ label: playing ? `Stop ${row.label}` : `Play ${row.label}`, icon: playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />, onPress: () => preview.toggle(reference) }]
          : []
      }
    >
      <MainCell
        name={row.label}
        lead={
          <>
            {draggable ? (
              <button
                ref={(element) => {
                  gripRef.current = element
                  setNodeRef(element?.closest("tr") ?? null)
                }}
                type="button"
                className="cursor-grab text-muted-foreground active:cursor-grabbing"
                aria-label={`Drag ${row.label} to a new place`}
                {...attributes}
                {...listeners}
              >
                <GripVerticalIcon className="size-4" />
              </button>
            ) : null}
            <CatalogThumb row={row} />
          </>
        }
      >
        <span className="min-w-0 truncate text-xs text-muted-foreground">{rowLine(row)}</span>
      </MainCell>
      <TableCell column="meta">
        <Chip muted={row.status !== "live"}>{row.status === "live" ? "Live" : "Draft"}</Chip>
      </TableCell>
      <TableCell column="meta" className="hidden md:hidden @2xl:table-cell">
        {row.personalCount} {plural(row.personalCount, "person", "people")}
        {row.roomCount ? (
          <span className="text-muted-foreground">
            , {row.roomCount} {plural(row.roomCount, "room", "rooms")}
          </span>
        ) : null}
      </TableCell>
      <TableCell column="mutedMeta" className="hidden md:hidden @4xl:table-cell">
        {formatDate(row.createdAt)}
      </TableCell>
    </AdminRow>
  )
}

/**
 * One item on the right: its picture or its sound to play, its details,
 * its files and its credits, with Make live or Back to draft at the foot.
 * Change opens the item's window, which edits all of it (Tyler, 10 Oct
 * 2026: "click title and settings cog to open modal to add/edit").
 */
function CatalogRecord({
  kind,
  row,
  busy,
  preview,
  onChange,
  onStatus,
  onDelete,
}: {
  kind: CatalogKind
  row: AdminCatalogRow
  busy: boolean
  preview: ReturnType<typeof usePreviewAudio>
  onChange: () => void
  onStatus: (next: BulkAction) => void
  onDelete: () => void
}) {
  const reference: SoundReference | null =
    kind === "sound" && row.fileUrl ? { type: "curated", key: row.key, url: row.fileUrl } : null
  const playing = reference !== null && preview.playing && preview.previewing?.type === "curated" && preview.previewing.key === row.key
  const live = row.status === "live"
  return (
    <DetailRecord
      icon={kind === "sound" ? <MusicIcon aria-hidden /> : <ImageIcon aria-hidden />}
      title={row.label}
      line={rowLine(row)}
      hideLabel={`Hide the ${kind === "sound" ? "sound" : "background"}`}
      actions={
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label={`${row.label} menu`}>
              <SettingsIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onSelect={onChange}>
              <SettingsIcon />
              Change
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onStatus(row.locked ? "free" : "pro")}>
              {row.locked ? <LockOpenIcon /> : <LockIcon />}
              {row.locked ? "Make it free" : "Make it Pro"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
      facts={[
        ["Status", live ? "Live" : "Draft"],
        ["Free or Pro", row.locked ? "Pro" : "Free"],
        ["What it is", DESCRIPTOR_LABELS[row.descriptor] ?? row.descriptor],
        ...(row.durationSeconds ? ([["Length", formatClock(row.durationSeconds)]] as [string, string][]) : []),
        ["Tags", row.tags.length ? row.tags.join(", ") : "None"],
        ["Chosen by", `${row.personalCount} ${plural(row.personalCount, "person", "people")}, ${row.roomCount} open ${plural(row.roomCount, "room", "rooms")}`],
        ["Added", formatDate(row.createdAt)],
      ]}
      state={live ? "Live" : "Draft"}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onChange}>
            <SettingsIcon />
            Change
          </Button>
          <Button type="button" variant={live ? "outline" : "default"} disabled={busy} onClick={() => onStatus(live ? "draft" : "live")}>
            {live ? <EyeOffIcon /> : <EyeIcon />}
            {live ? "Back to draft" : "Make live"}
          </Button>
        </>
      }
    >
      <PanelCard storageId="pomodoro-flowfly-catalog-preview" icon={<EyeIcon />} title="Preview">
        {kind === "sound" ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            <span className="block h-20 overflow-hidden rounded-lg">
              <SoundWave seed={row.key} />
            </span>
            {reference ? (
              <Button type="button" variant="outline" className="justify-self-start" onClick={() => preview.toggle(reference)}>
                {playing ? <PauseIcon /> : <PlayIcon />}
                {playing ? "Stop" : "Play"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">No file yet.</p>
            )}
          </div>
        ) : row.pictureUrl ? (
          <img src={row.pictureUrl} alt="" className="aspect-video w-full rounded-lg bg-muted object-cover" />
        ) : (
          <p className="text-sm text-muted-foreground">No picture yet.</p>
        )}
      </PanelCard>
      <PanelCard storageId="pomodoro-flowfly-catalog-files" icon={<UploadIcon />} title="Files">
        <p className="text-sm text-muted-foreground">{fileLine(row) ?? (row.fileUrl || row.pictureUrl ? "Ready." : "No file yet.")}</p>
        {waitsForPixabayFile(row) && row.sourceUrl ? (
          <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline underline-offset-2">
            Open on Pixabay
          </a>
        ) : null}
      </PanelCard>
      <PanelCard storageId="pomodoro-flowfly-catalog-credits" icon={<ImportIcon />} title="Credits">
        <p className="text-sm text-muted-foreground">
          {row.licence ? (CATALOG_LICENCES.find((licence) => licence.value === row.licence)?.label ?? row.licence) : "No licence set."}
        </p>
      </PanelCard>
    </DetailRecord>
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
