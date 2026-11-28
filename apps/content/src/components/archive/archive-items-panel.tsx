import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ClapperboardIcon,
  FilmIcon,
  GalleryHorizontalIcon,
  ImageIcon,
  Loader2Icon,
  PinIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"

import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { getPartsErrorMessage, loadProjectParts } from "@/lib/api/content-app/projects"
import { formatRelativeTime } from "@/lib/format/format-time"
import { useLoad } from "@/lib/hooks/use-load"
import { formatClock } from "@/lib/video/timeline-utils"
import { VIDEO_STATUS_LABELS } from "@/lib/video/project-videos"
import { CARD_GRID, ContentLayoutSwitch, DraftCard, useContentLayout, type DraftVideo } from "@/components/content-app/content-layout"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { TableCell } from "@/components/ui/table"
import { FilterPopover } from "@/components/shared/filter-popover"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { NewVideoPopover } from "@/components/video-editor/new-video-popover"
import { MediaPicker } from "@/components/media/media-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  addUploadsToArchive,
  binArchiveItems,
  deleteArchiveItemForGood,
  getArchiveErrorMessage,
  loadArchiveItems,
  restoreArchiveItem,
  type ArchiveCard,
} from "@/lib/api/archive/items"
import { ARCHIVE_KIND_LABELS, BIN_DAYS, type ArchiveItemKind } from "@/lib/archive/items"
import { archiveFilterCount, type ArchiveSearch } from "@/lib/archive/search"
import { formatFileSize } from "@/lib/format/format-bytes"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { ListHeader } from "@/components/content-app/list-header"
import { ProjectMenuButton } from "@/components/content-app/project-top"
import { ContentKindMenu, ContentStatusMenu } from "@/components/content-app/content-kind-menu"
import { ProjectHeaderLead } from "@/components/social/projects/project-header-lead"

/** How often the list asks again while something is still arriving from Video. */
const ARRIVING_POLL_MS = 4_000

const ANY = "any"

/**
 * The Archive on a project's own page (`workspace/docs/archive.md`): one
 * project's videos, carousels and pictures as a grid, newest first, pinned
 * on top, where a guest from Project sees it too, with nothing to manage.
 *
 * One header (`ListHeader`): the search icon, a dropdown of which kind shows,
 * Filter (not posted yet, most viewed, grouped by Video project) and "+ Add", which opens the media library to
 * upload or pick files (part 28). Select is in the project's ⋮, and the Bin is
 * a tab of it. The whole
 * project as one zip went on 27 Nov 2026 (Tyler: "Remove the download zip
 * feature").
 */
export function ArchiveItemsPanel({
  projectId,
  projectName,
  search,
  onSearch,
  openId,
  onOpen,
  onShown,
  canManage,
  showDrafts = false,
}: {
    projectId: string
    projectName: string
    search: ArchiveSearch
    onSearch: (patch: Partial<ArchiveSearch>) => void
    openId: string | undefined
    onOpen: (itemId: string) => void
    /** The list as shown, first card first, so the dashboard can open the first one. */
    onShown?: (ids: string[]) => void
    /** False for a guest from Project: no Bin, no uploads, no select. */
    canManage: boolean
    /** The project's videos still in the editor show too, with Status to pick them; not for a guest. */
    showDrafts?: boolean
}) {
  const [items, setItems] = React.useState<ArchiveCard[] | null>(null)
  const [binCount, setBinCount] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [selecting, setSelecting] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [picking, setPicking] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const navigate = useNavigate()

  // The project's videos still in the editor show first (Tyler, 27 Nov 2026: "All content should show draft
  // too"), on All content and Videos, unless Status is Published. Not for a guest, who has none.
  const withDrafts = showDrafts && search.stage !== "published" && (!search.kind || search.kind === "video")
  // Status Draft leaves the Archive's items out.
  const shownItems = React.useMemo(() => (search.stage === "draft" ? [] : items), [items, search.stage])
  const parts = useLoad(() => (withDrafts ? loadProjectParts(projectId) : Promise.resolve(null)), getPartsErrorMessage, {
    keys: [projectId, withDrafts],
    remember: withDrafts ? `content-project-parts-${projectId}` : undefined,
  })
  const draftWords = (search.q ?? "").trim().toLowerCase()
  const drafts = withDrafts
    ? (parts.data?.videos ?? [])
        .filter((video) => !video.archived && (!draftWords || video.name.toLowerCase().includes(draftWords)))
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    : []
  // Opened under Status Draft, the editor's back button returns there.
  const openDraft = (videoId: string) =>
    void navigate({ to: "/admin/video-editor/$projectId", params: { projectId }, search: { video: videoId, ...(search.stage === "draft" ? { from: "drafts" as const } : {}) } })
  const [layout, setLayout] = useContentLayout()
  const tick = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })


  const queryKey = JSON.stringify([projectId, search.kind, search.q, search.posted, search.sort, reloads])
  React.useEffect(() => {
    let cancelled = false
    loadArchiveItems({
      projectId,
      kind: search.kind,
      q: search.q,
      notPosted: search.posted === "no",
      sort: search.sort === "views" ? "views" : "newest",
      bin: false,
    }).then(
      (answer) => {
        if (cancelled) return
        setItems(answer.items)
        setBinCount(answer.binCount)
        setError(null)
      },
      (failure: unknown) => {
        if (!cancelled) setError(getArchiveErrorMessage(failure))
      }
    )
    return () => {
      cancelled = true
    }
    // The key holds every input the list depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey])

  // Something still copying from Video: ask again until it lands.
  const arriving = items?.some((item) => item.status === "copying") ?? false
  React.useEffect(() => {
    if (!arriving) return
    const timer = setInterval(() => setReloads((count) => count + 1), ARRIVING_POLL_MS)
    return () => clearInterval(timer)
  }, [arriving])

  const groups = React.useMemo(() => groupCards(shownItems ?? [], search.group === "source"), [shownItems, search.group])
  const shownIds = groups.flatMap((group) => group.items.map((item) => item.id))
  const shownKey = shownIds.join(",")
  const loaded = items !== null
  // Told only once the list has loaded: an empty list while it loads would
  // read as "nothing to open", and the first item would never open on arrival.
  React.useEffect(() => {
    if (loaded) onShown?.(shownKey ? shownKey.split(",") : [])
  }, [loaded, onShown, shownKey])

  async function binSelected() {
    const ids = [...selected]
    setBusy(true)
    dismissErrorToast()
    try {
      await binArchiveItems(ids)
      setSelected(new Set())
      setReloads((count) => count + 1)
    } catch (failure) {
      showErrorToast(getArchiveErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  async function addUpload(mediaUrl: string) {
    dismissErrorToast()
    try {
      await addUploadsToArchive(projectId, [mediaUrl])
      setReloads((count) => count + 1)
    } catch (failure) {
      showErrorToast(getArchiveErrorMessage(failure))
    }
  }

  return (
    <>
      {/* The one list header every dashboard in Content has (`ListHeader`): the project's controls, then
          the search icon, what content shows (`ContentKindMenu`), Filter, the Bin, Add, and the project's ⋮ last. Select is in
          that ⋮, at the top of General (Tyler, 27 Nov 2026, `workspace/tasks/Misc/misc.md`). */}
      <ListHeader
        tabs={
          <span className="flex min-w-0 items-center gap-1">
            <ProjectHeaderLead />
          </span>
        }
        choices={
          <>
            <ContentKindMenu value={search.kind ?? "all"} onPick={(next) => onSearch({ kind: next === "all" ? undefined : next, open: undefined })} />
            {showDrafts ? (
              <ContentStatusMenu value={search.stage ?? "all"} onPick={(next) => onSearch({ stage: next === "all" ? undefined : next, open: undefined })} />
            ) : null}
          </>
        }
        selected={
          selected.size && canManage ? (
            <SelectedMenu
              count={selected.size}
              busy={busy}
              onClear={() => setSelected(new Set())}
              main={(menu) => (
                <SelectedMenuRow
                  className="text-destructive"
                  onClick={() => {
                    menu.close()
                    void binSelected()
                  }}
                >
                  Move to the Bin
                </SelectedMenuRow>
              )}
              pages={{}}
            />
          ) : null
        }
        search={{
          name: "archive-search",
          label: "Search the archive",
          placeholder: "Search titles and captions…",
          value: search.q ?? "",
          onChange: (q) => onSearch({ q: q || undefined }),
        }}
        massSelect={
          canManage
            ? {
                on: selecting,
                onToggle: () => {
                  if (selecting) setSelected(new Set())
                  setSelecting(!selecting)
                },
              }
            : null
        }
        filter={
        <FilterPopover
          count={archiveFilterCount(search)}
          open={filterOpen}
          onOpenChange={setFilterOpen}
          onClear={() => onSearch({ posted: undefined, sort: undefined })}
          save={null}
        >
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
            <FilterRow
              id="archive-filter-posted"
              label="Posted"
              value={search.posted}
              anyLabel="Posted or not"
              options={[["no", "Not posted yet"]]}
              onChange={(posted) => onSearch({ posted: posted === "no" ? "no" : undefined })}
            />
            <FilterRow
              id="archive-filter-sort"
              label="Sort"
              value={search.sort}
              anyLabel="Newest first"
              options={[["views", "Most viewed"]]}
              onChange={(sort) => onSearch({ sort: sort === "views" ? "views" : undefined })}
            />
            <FilterRow
              id="archive-filter-group"
              label="Group"
              value={search.group}
              anyLabel="No groups"
              options={[["source", "By Video project"]]}
              onChange={(group) => onSearch({ group: group === "source" ? "source" : undefined })}
            />
          </div>
        </FilterPopover>
        }
        view={<ContentLayoutSwitch layout={layout} onChange={setLayout} />}
        primary={canManage ? <AddMenu projectId={projectId} onUpload={() => setPicking(true)} /> : undefined}
        menuLabel="More for the archive"
        // The Bin is a tab of the project's ⋮ (Tyler, 27 Nov 2026: "move bin into the tab here instead").
        end={
          <ProjectMenuButton
            extraTabs={
              canManage
                ? [{ value: "bin", label: binCount ? `Bin · ${binCount}` : "Bin", content: <BinTab projectId={projectId} onPutBack={() => setReloads((count) => count + 1)} /> }]
                : undefined
            }
          />
        }
      />

      <ScrollArea className="min-h-0 flex-1">
        {error ? (
          <div className="p-3">
            <ErrorRow message={error} onRetry={() => setReloads((count) => count + 1)} />
          </div>
        ) : !items ? (
          <div className="p-3">
            <LoadingRow label="Opening the archive…" />
          </div>
        ) : !shownItems?.length && !drafts.length ? (
          <p className="p-4 text-sm text-muted-foreground">
            {search.stage === "draft" && !search.q && (!search.kind || search.kind === "video")
              ? "No drafts yet. Press + Add, then Create video, to make one."
              : search.q || search.kind || search.posted || search.stage === "draft"
                ? "Nothing matches that."
                : canManage
                  ? `${projectName}'s archive is empty. Press Send to Promo on an export in Video, or + Add to upload a file.`
                  : `${projectName}'s archive is empty.`}
          </p>
        ) : layout === "list" ? (
          // Its own container, so its columns come and go with the middle's width.
          <div className="@container">
          <ContentTable
            drafts={drafts}
            items={groups.flatMap((group) => group.items)}
            openId={openId}
            selecting={selecting && canManage}
            selected={selected}
            onTick={tick}
            onTickAll={(ids) => setSelected((current) => (ids.every((id) => current.has(id)) ? new Set() : new Set(ids)))}
            onOpenItem={onOpen}
            onOpenDraft={openDraft}
          />
          </div>
        ) : (
          <div className="grid gap-4 p-3">
            {drafts.length ? (
              <section className="grid gap-2">
                <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Drafts</h3>
                <div className={CARD_GRID}>
                  {drafts.map((video) => (
                    <DraftCard key={video.id} video={video} onOpen={() => openDraft(video.id)} />
                  ))}
                </div>
              </section>
            ) : null}
            {groups.filter((group) => group.items.length).map((group) => (
              <section key={group.name} className="grid gap-2">
                {group.name || drafts.length ? (
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.name || "Archive"}</h3>
                ) : null}
                <div className={CARD_GRID}>
                  {group.items.map((item) => (
                    <ArchiveCardButton
                      key={item.id}
                      item={item}
                      open={item.id === openId}
                      selecting={selecting && canManage}
                      ticked={selected.has(item.id)}
                      onTick={() => tick(item.id)}
                      onOpen={() => onOpen(item.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </ScrollArea>

      {canManage ? <MediaPicker open={picking} onOpenChange={setPicking} onSelectMedia={(url) => void addUpload(url)} showVideos /> : null}
    </>
  )
}

/**
 * The Bin, a tab of the project's ⋮ on Content (Tyler, 27 Nov 2026: "The bin
 * should open up a modal instead", then "move bin into the tab here
 * instead"): the project's deleted items, newest first, each with Put back
 * and Delete for good, which asks first, as the item's own ⋮ in the Bin did.
 * They go for good 30 days after deleting anyway. Read each time the tab opens.
 */
function BinTab({ projectId, onPutBack }: { projectId: string; onPutBack: () => void }) {
  const [items, setItems] = React.useState<ArchiveCard[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [forGood, setForGood] = React.useState<ArchiveCard | null>(null)
  React.useEffect(() => {
    let cancelled = false
    loadArchiveItems({ projectId, sort: "newest", bin: true, notPosted: false }).then(
      (answer) => {
        if (cancelled) return
        setItems(answer.items)
        setError(null)
      },
      (failure: unknown) => {
        if (!cancelled) setError(getArchiveErrorMessage(failure))
      }
    )
    return () => {
      cancelled = true
    }
  }, [projectId, reloads])

  async function act(itemId: string, work: () => Promise<void>) {
    setBusyId(itemId)
    dismissErrorToast()
    try {
      await work()
      setReloads((count) => count + 1)
    } catch (failure) {
      showErrorToast(getArchiveErrorMessage(failure))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="grid gap-1 p-3">
      <p className="px-1 pb-1 text-xs text-muted-foreground">Gone for good {BIN_DAYS} days after deleting.</p>
      {error ? (
        <ErrorRow message={error} onRetry={() => setReloads((count) => count + 1)} />
      ) : !items ? (
        <LoadingRow label="Opening the Bin…" />
      ) : !items.length ? (
        <p className="px-1 py-1.5 text-sm text-muted-foreground">The Bin is empty.</p>
      ) : (
        items.map((item) => {
          const Icon = KIND_ICONS[item.kind]
          return (
            <div key={item.id} className="flex min-h-11 min-w-0 items-center gap-2.5 px-1 py-1">
              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                {item.coverUrl ? <img src={item.coverUrl} alt="" className="size-full object-cover" loading="lazy" /> : <Icon className="size-4 text-muted-foreground" />}
              </span>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm">{item.title || "Untitled"}</span>
                <span className="truncate text-xs text-muted-foreground">{cardMeasure(item)}</span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyId !== null}
                onClick={() =>
                  void act(item.id, async () => {
                    await restoreArchiveItem(item.id)
                    onPutBack()
                  })
                }
              >
                {busyId === item.id && !forGood ? <Loader2Icon className="animate-spin" /> : null}
                Put back
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    disabled={busyId !== null}
                    aria-label={`Delete ${item.title || "this item"} for good`}
                    onClick={() => setForGood(item)}
                  >
                    <Trash2Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete for good</TooltipContent>
              </Tooltip>
            </div>
          )
        })
      )}
      <ConfirmDialog
        open={forGood !== null}
        onOpenChange={(open) => (open ? null : setForGood(null))}
        title="Delete this for good?"
        description="Its files go from storage now, and it can't be put back. Posts already made stay on their networks."
        confirmLabel="Delete for good"
        loading={busyId !== null}
        onConfirm={() => {
          const item = forGood
          if (!item) return
          void act(item.id, async () => {
            await deleteArchiveItemForGood(item.id)
            setForGood(null)
          })
        }}
      />
    </div>
  )
}

/** Cards under their Video project's name, or one unnamed group. Uploads go under "Uploaded". */
function groupCards(items: ArchiveCard[], bySource: boolean): { name: string; items: ArchiveCard[] }[] {
  if (!bySource) return [{ name: "", items }]
  const groups = new Map<string, ArchiveCard[]>()
  for (const item of items) {
    const name = item.videoProjectName || "Uploaded"
    groups.set(name, [...(groups.get(name) ?? []), item])
  }
  return [...groups.entries()].map(([name, grouped]) => ({ name, items: grouped }))
}

const KIND_ICONS: Record<ArchiveItemKind, React.ComponentType<{ className?: string }>> = {
  video: FilmIcon,
  carousel: GalleryHorizontalIcon,
  picture: ImageIcon,
}

/** "0:42", "12 slides" or the picture's size. */
function cardMeasure(item: ArchiveCard): string {
  if (item.kind === "carousel") return `${item.slides} ${plural(item.slides, "slide", "slides")}`
  if (item.kind === "video" && item.durationMs) {
    const seconds = Math.round(item.durationMs / 1000)
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
  }
  return formatFileSize(item.fileSize)
}

type TableColumn = "name" | "kind" | "length" | "status" | "changed"

/**
 * All content as a list (Tyler, 27 Nov 2026: "Shouldnt there be 2 icon for list
 * and grid ?"): the drafts and the Archive's items in one table with the same
 * columns, newest change first. A draft opens the editor; an item opens on the
 * right, and with Select on its tick box marks it, as its card does.
 */
function ContentTable({
  drafts,
  items,
  openId,
  selecting,
  selected,
  onTick,
  onTickAll,
  onOpenItem,
  onOpenDraft,
}: {
  drafts: DraftVideo[]
  items: ArchiveCard[]
  openId: string | undefined
  selecting: boolean
  selected: Set<string>
  onTick: (id: string) => void
  onTickAll: (ids: string[]) => void
  onOpenItem: (id: string) => void
  onOpenDraft: (id: string) => void
}) {
  const [sort, setSort] = React.useState<TableColumn>("changed")
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc")
  type Row =
    | { type: "draft"; id: string; name: string; kind: string; length: string; status: string; changed: string; video: DraftVideo }
    | { type: "item"; id: string; name: string; kind: string; length: string; status: string; changed: string; item: ArchiveCard }
  const rows: Row[] = [
    ...drafts.map((video) => ({
      type: "draft" as const,
      id: video.id,
      name: video.name,
      // A draft is a video; Status says it is not published yet.
      kind: ARCHIVE_KIND_LABELS.video,
      length: formatClock(video.durationMs),
      status: VIDEO_STATUS_LABELS[video.status],
      changed: video.updatedAt,
      video,
    })),
    ...items.map((item) => ({
      type: "item" as const,
      id: item.id,
      name: item.title || "Untitled",
      kind: ARCHIVE_KIND_LABELS[item.kind],
      length: cardMeasure(item),
      status: item.posted ? `Posted ${item.posted} ${plural(item.posted, "time", "times")}` : "Not posted yet",
      changed: item.createdAt,
      item,
    })),
  ]
  const sorted = [...rows].sort((a, b) => {
    const order = a[sort] < b[sort] ? -1 : a[sort] > b[sort] ? 1 : 0
    return direction === "asc" ? order : -order
  })
  const itemIds = items.map((item) => item.id)
  return (
    <CrmTable<TableColumn>
      columns={[
        { key: "name", label: "Item", column: "main", className: "min-w-40" },
        { key: "kind", label: "Kind", column: "meta", className: "hidden @md:table-cell" },
        { key: "length", label: "Length", column: "meta", className: "hidden @xl:table-cell" },
        { key: "status", label: "Status", column: "meta", className: "hidden @lg:table-cell" },
        { key: "changed", label: "Last change", column: "meta", className: "hidden @2xl:table-cell" },
      ]}
      sort={sort}
      direction={direction}
      onSort={(column) => {
        if (column === sort) setDirection((was) => (was === "asc" ? "desc" : "asc"))
        else {
          setSort(column)
          setDirection(column === "changed" ? "desc" : "asc")
        }
      }}
      select={
        selecting && itemIds.length
          ? {
              noun: "items",
              checked: itemIds.every((id) => selected.has(id)) ? true : itemIds.some((id) => selected.has(id)) ? "indeterminate" : false,
              onToggle: () => onTickAll(itemIds),
            }
          : null
      }
      actions={false}
    >
      {sorted.map((row) => {
        const Icon = row.type === "draft" ? ClapperboardIcon : KIND_ICONS[row.item.kind]
        return (
          <CrmTableRow
            key={`${row.type}:${row.id}`}
            open={row.type === "item" && row.id === openId}
            label={row.name}
            cog={false}
            tick={selecting ? (row.type === "item" ? { shown: true, ticked: selected.has(row.id), onToggle: () => onTick(row.id) } : { shown: true, ticked: false, onToggle: () => undefined, none: true }) : null}
            onOpen={() => (row.type === "draft" ? onOpenDraft(row.id) : selecting ? onTick(row.id) : onOpenItem(row.id))}
          >
            <MainCell lead={<Icon className="size-4 text-muted-foreground" />} name={row.name} />
            <TableCell column="meta" className="hidden @md:table-cell">
              {row.kind}
            </TableCell>
            <TableCell column="meta" className="hidden tabular-nums @xl:table-cell">
              {row.length}
            </TableCell>
            <TableCell column="meta" className="hidden @lg:table-cell">
              {row.type === "draft" ? <Chip muted={row.video.status === "draft"}>{row.status}</Chip> : row.status}
            </TableCell>
            <TableCell column="meta" className="hidden @2xl:table-cell">
              {formatRelativeTime(row.changed)}
            </TableCell>
          </CrmTableRow>
        )
      })}
    </CrmTable>
  )
}

function ArchiveCardButton({
  item,
  open,
  selecting,
  ticked,
  onTick,
  onOpen,
}: {
  item: ArchiveCard
  open: boolean
  selecting: boolean
  ticked: boolean
  onTick: () => void
  onOpen: () => void
}) {
  const Icon = KIND_ICONS[item.kind]
  const arriving = item.status === "copying"
  return (
    <div className={cn("group relative grid gap-1.5 rounded-lg p-1.5", open ? "bg-accent" : "hover:bg-accent/60")}>
      <button
        type="button"
        className="grid gap-1.5 text-left focus-visible:outline-none"
        aria-pressed={open}
        onClick={selecting ? onTick : onOpen}
      >
        <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
          {item.coverUrl ? <img src={item.coverUrl} alt="" className="size-full object-cover" loading="lazy" /> : <Icon className="size-6 text-muted-foreground" />}
          {arriving ? (
            <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-background/70 text-xs">
              <Loader2Icon className="size-3.5 animate-spin" />
              Arriving…
            </span>
          ) : null}
          <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-background/85 px-1.5 py-0.5 text-[11px]">
            <Icon className="size-3" />
            {cardMeasure(item)}
          </span>
          {item.pinned ? (
            <span className="absolute top-1 right-1 rounded bg-background/85 p-1" aria-label="Pinned">
              <PinIcon className="size-3" />
            </span>
          ) : null}
        </span>
        <span className="truncate text-sm font-medium">{item.title || "Untitled"}</span>
        <span className="truncate text-xs text-muted-foreground">
          {[
            item.language,
            item.posted ? `Posted ${item.posted} ${plural(item.posted, "time", "times")}` : "Not posted yet",
            item.views ? `${item.views.toLocaleString()} views` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
      {selecting ? (
        <Checkbox className="absolute top-2.5 left-2.5 bg-background" checked={ticked} onCheckedChange={onTick} aria-label={`Select ${item.title || "this item"}`} />
      ) : null}
    </div>
  )
}

function FilterRow({
  id,
  label,
  value,
  anyLabel,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string | undefined
  anyLabel: string
  options: [string, string][]
  onChange: (value: string | undefined) => void
}) {
  return (
    <>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value ?? ANY} onValueChange={(next) => onChange(next === ANY ? undefined : next)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{anyLabel}</SelectItem>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}

/**
 * "+ Add": the one primary button, opening a menu (Travel's trip page pattern).
 * Create video opens New video's popover under Add, a name and a shape or a
 * template, and the video it makes opens in the editor (Tyler, 27 Nov 2026:
 * "Pressing the create video button should open a popover and also after I
 * click create video, it doesnt direct me to the video editor").
 */
function AddMenu({ projectId, onUpload }: { projectId: string; onUpload: () => void }) {
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  // The menu gives focus back to Add as it closes, which would close the popover the same moment.
  const keepFocus = React.useRef(false)
  return (
    <NewVideoPopover
      projectId={projectId}
      aspect="9:16"
      side="bottom"
      // Add sits at the right of the header, so it opens leftwards under it, as the header's menus do.
      align="end"
      withTemplates
      anchorOnly
      open={creating}
      onOpenChange={setCreating}
      onCreated={(videoId, panel) => navigate({ to: "/admin/video-editor/$projectId", params: { projectId }, search: { video: videoId, panel } })}
    >
    <FoldingMenu
      label="Add to the archive"
      fit
      open={open}
      onOpenChange={setOpen}
      onCloseAutoFocus={(event) => {
        if (!keepFocus.current) return
        keepFocus.current = false
        event.preventDefault()
      }}
      trigger={
        <DashboardToolbarButton type="button">
          <PlusIcon className="size-4" />
          <span className="@max-3xl:sr-only">Add</span>
        </DashboardToolbarButton>
      }
    >
      <MenuAction
        icon={<UploadIcon className="size-4" />}
        onClick={() => {
          setOpen(false)
          onUpload()
        }}
      >
        Upload or pick files
      </MenuAction>
      <MenuAction
        icon={<FilmIcon className="size-4" />}
        onClick={() => {
          keepFocus.current = true
          setOpen(false)
          setCreating(true)
        }}
      >
        {/* Tyler, 27 Nov 2026: rename it to "Create video". */}
        Create video
      </MenuAction>
    </FoldingMenu>
    </NewVideoPopover>
  )
}
