import * as React from "react"
import {
  BookmarkPlusIcon,
  DownloadIcon,
  FilmIcon,
  GalleryHorizontalIcon,
  ImageIcon,
  Loader2Icon,
  PinIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"

import { DashboardCardHeader, DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import { MassSelectChip, SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { SavedViewsControls, SaveViewDialog, type SavedViewsScreen } from "@/components/shared/saved-views"
import { SearchToggle } from "@/components/shared/search-toggle"
import { AskForVideoDialog } from "@/components/archive/ask-for-video-dialog"
import { MediaPicker } from "@/components/media/media-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ErrorRow } from "@/components/ui/error-row"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  addUploadsToArchive,
  binArchiveItems,
  getArchiveErrorMessage,
  loadArchiveItems,
  restoreArchiveItem,
  type ArchiveCard,
} from "@/lib/api/archive/items"
import type { SavedView } from "@/lib/api/saved-views"
import { BIN_DAYS, type ArchiveItemKind } from "@/lib/archive/items"
import {
  ARCHIVE_FILTER_KEYS,
  ARCHIVE_VIEW_KIND,
  archiveFilterCount,
  describeArchiveFilters,
  keptArchiveFilters,
  readArchiveSearch,
  type ArchiveSearch,
} from "@/lib/archive/search"
import { formatFileSize } from "@/lib/format/format-bytes"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** How often the list asks again while something is still arriving from Video. */
const ARRIVING_POLL_MS = 4_000

const ANY = "any"

export type ArchiveItemsHandle = { reload: () => void }

/**
 * The middle panel of the Archive (`workspace/docs/archive.md`): one
 * project's videos, carousels and pictures as a grid, newest first, pinned
 * on top. Drawn on the Archive dashboard and in a project's own dashboard,
 * where a guest from Project sees it too, with nothing to manage.
 *
 * Tabs pick the kind; the toolbar has mass select, search, Filter (not
 * posted yet, most viewed, grouped by Video project), Views and "+ Add",
 * which opens the media library to upload or pick files (part 28). The ⋮
 * after the tabs holds the Bin and the whole project as one zip.
 */
export const ArchiveItemsPanel = React.forwardRef<
  ArchiveItemsHandle,
  {
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
    /** Saved views, on the Archive dashboard. A project's own page leaves them out. */
    views?: SavedView[]
    /** A back arrow, on the project's own dashboard only. */
    header?: React.ReactNode
  }
>(function ArchiveItemsPanel({ projectId, projectName, search, onSearch, openId, onOpen, onShown, canManage, views, header }, ref) {
  const [items, setItems] = React.useState<ArchiveCard[] | null>(null)
  const [binCount, setBinCount] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [selecting, setSelecting] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [savingView, setSavingView] = React.useState(false)
  const [picking, setPicking] = React.useState(false)
  const [asking, setAsking] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const inBin = search.bin === "1"

  React.useImperativeHandle(ref, () => ({ reload: () => setReloads((count) => count + 1) }), [])

  const queryKey = JSON.stringify([projectId, search.kind, search.q, search.posted, search.sort, inBin, reloads])
  React.useEffect(() => {
    let cancelled = false
    loadArchiveItems({
      projectId,
      kind: search.kind,
      q: search.q,
      notPosted: search.posted === "no",
      sort: search.sort === "views" ? "views" : "newest",
      bin: inBin,
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

  const groups = React.useMemo(() => groupCards(items ?? [], search.group === "source"), [items, search.group])
  const shownIds = groups.flatMap((group) => group.items.map((item) => item.id))
  const shownKey = shownIds.join(",")
  const loaded = items !== null
  // Told only once the list has loaded: an empty list while it loads would
  // read as "nothing to open", and the first item would never open on arrival.
  React.useEffect(() => {
    if (loaded) onShown?.(shownKey ? shownKey.split(",") : [])
  }, [loaded, onShown, shownKey])

  const here: SavedViewsScreen = {
    screen: `${ARCHIVE_VIEW_KIND}:${projectId}`,
    describe: (filters) => describeArchiveFilters(filters),
    kept: (filters) => keptArchiveFilters(filters),
  }
  const viewFilters = keptArchiveFilters(search)

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

  async function putBack(itemId: string) {
    try {
      await restoreArchiveItem(itemId)
      setReloads((count) => count + 1)
    } catch (failure) {
      showErrorToast(getArchiveErrorMessage(failure))
    }
  }

  return (
    <>
      {header}
      {inBin ? (
        <DashboardCardTitleHeader
          back={{ label: "Back to the archive", onClick: () => onSearch({ bin: undefined, open: undefined }) }}
          title="Bin"
          meta={<span className="text-sm text-muted-foreground">Gone for good {BIN_DAYS} days after deleting</span>}
        />
      ) : (
        <DashboardCardHeader className="group/title @container">
          <DashboardTabs
            value={search.kind ?? "all"}
            onValueChange={(value) => onSearch({ kind: value === "all" ? undefined : (value as ArchiveItemKind), open: undefined })}
            tabs={[
              { value: "all", label: "All" },
              { value: "video", label: "Videos" },
              { value: "carousel", label: "Carousels" },
              { value: "picture", label: "Pictures" },
            ]}
            after={
              canManage ? (
                <ArchiveMoreMenu projectId={projectId} binCount={binCount} onBin={() => onSearch({ bin: "1", open: undefined })} />
              ) : undefined
            }
          />
          <div className="flex shrink-0 items-center gap-1">
            {selected.size && canManage ? (
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
            ) : null}
            {canManage ? (
              <MassSelectChip
                on={selecting}
                onToggle={() => {
                  if (selecting) setSelected(new Set())
                  setSelecting(!selecting)
                }}
              />
            ) : null}
            <SearchToggle
              name="archive-search"
              label="Search the archive"
              placeholder="Search titles and captions…"
              value={search.q ?? ""}
              onChange={(q) => onSearch({ q: q || undefined })}
            />
            <FilterPopover
              count={archiveFilterCount(search)}
              open={filterOpen}
              onOpenChange={setFilterOpen}
              onClear={() => onSearch({ posted: undefined, sort: undefined })}
              save={
                canManage && views ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!Object.keys(viewFilters).length) {
                        showErrorToast("Search or pick a filter first, then save it as a view.")
                        return
                      }
                      setFilterOpen(false)
                      setSavingView(true)
                    }}
                  >
                    <BookmarkPlusIcon className="size-4" />
                    Save as view
                  </Button>
                ) : null
              }
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
            {canManage && views ? (
              <SavedViewsControls
                here={here}
                views={views}
                filters={viewFilters}
                saveButton={false}
                buttonVariant="ghost"
                onOpen={(saved) =>
                  onSearch({
                    ...Object.fromEntries(ARCHIVE_FILTER_KEYS.map((key) => [key, undefined])),
                    ...readArchiveSearch(saved.filters),
                    open: undefined,
                  })
                }
              />
            ) : null}
            {canManage ? <AddMenu onUpload={() => setPicking(true)} onAsk={() => setAsking(true)} /> : null}
          </div>
        </DashboardCardHeader>
      )}

      <ScrollArea className="min-h-0 flex-1">
        {error ? (
          <div className="p-3">
            <ErrorRow message={error} onRetry={() => setReloads((count) => count + 1)} />
          </div>
        ) : !items ? (
          <div className="p-3">
            <LoadingRow label="Opening the archive…" />
          </div>
        ) : !items.length ? (
          <p className="p-4 text-sm text-muted-foreground">
            {inBin
              ? "The Bin is empty."
              : search.q || search.kind || search.posted
                ? "Nothing in the archive matches that."
                : canManage
                  ? `${projectName}'s archive is empty. Press Send to Promo on an export in Video, or + Add to upload a file.`
                  : `${projectName}'s archive is empty.`}
          </p>
        ) : (
          <div className="grid gap-4 p-3">
            {groups.map((group) => (
              <section key={group.name} className="grid gap-2">
                {group.name ? <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.name}</h3> : null}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
                  {group.items.map((item) => (
                    <ArchiveCardButton
                      key={item.id}
                      item={item}
                      open={item.id === openId}
                      selecting={selecting && canManage && !inBin}
                      ticked={selected.has(item.id)}
                      onTick={() =>
                        setSelected((current) => {
                          const next = new Set(current)
                          if (next.has(item.id)) next.delete(item.id)
                          else next.add(item.id)
                          return next
                        })
                      }
                      onOpen={() => onOpen(item.id)}
                      onPutBack={inBin ? () => void putBack(item.id) : undefined}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </ScrollArea>

      {canManage && views ? <SaveViewDialog open={savingView} here={here} filters={viewFilters} onClose={() => setSavingView(false)} /> : null}
      {canManage && asking ? <AskForVideoDialog projectId={projectId} projectName={projectName} onClose={() => setAsking(false)} /> : null}
      {canManage ? <MediaPicker open={picking} onOpenChange={setPicking} onSelectMedia={(url) => void addUpload(url)} showVideos /> : null}
    </>
  )
})

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

function ArchiveCardButton({
  item,
  open,
  selecting,
  ticked,
  onTick,
  onOpen,
  onPutBack,
}: {
  item: ArchiveCard
  open: boolean
  selecting: boolean
  ticked: boolean
  onTick: () => void
  onOpen: () => void
  onPutBack?: () => void
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
      {onPutBack ? (
        <Button type="button" variant="outline" size="xs" onClick={onPutBack}>
          Put back
        </Button>
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

/** "+ Add": the one primary button, opening a menu (Travel's trip page pattern). */
function AddMenu({ onUpload, onAsk }: { onUpload: () => void; onAsk: () => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <FoldingMenu
      label="Add to the archive"
      fit
      open={open}
      onOpenChange={setOpen}
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
          setOpen(false)
          onAsk()
        }}
      >
        Ask Video for a video
      </MenuAction>
    </FoldingMenu>
  )
}

/** The ⋮ after the tabs: the Bin with its count, and the whole project as one zip (part 31). */
function ArchiveMoreMenu({ projectId, binCount, onBin }: { projectId: string; binCount: number; onBin: () => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="flex items-center border-b-2 border-transparent">
      <FoldingMenu label="More for this archive" fit open={open} onOpenChange={setOpen}>
        <MenuAction
          icon={<Trash2Icon className="size-4" />}
          onClick={() => {
            setOpen(false)
            onBin()
          }}
        >
          Bin{binCount ? ` (${binCount})` : ""}
        </MenuAction>
        <MenuAction
          icon={<DownloadIcon className="size-4" />}
          onClick={() => {
            setOpen(false)
            window.location.assign(`/api/archive/zip/${encodeURIComponent(projectId)}`)
          }}
        >
          Download everything as a zip
        </MenuAction>
      </FoldingMenu>
    </div>
  )
}

