import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  BookmarkPlusIcon,
  DownloadIcon,
  FilmIcon,
  FolderArchiveIcon,
  GalleryHorizontalIcon,
  ImageIcon,
  Loader2Icon,
  PinIcon,
  PlusIcon,
  Trash2Icon,
  Undo2Icon,
  UploadIcon,
} from "lucide-react"

import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { ArchiveItemPanel } from "@/components/archive/archive-item-panel"
import { AskForVideoDialog } from "@/components/archive/ask-for-video-dialog"
import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmListHeader, CrmRowMenu, type RowMenuItem } from "@/components/crm/crm-row"
import { Chip, CrmGroupRow, CrmTable, CrmTableRow, MainCell, useFolds } from "@/components/crm/crm-table"
import { MediaPicker } from "@/components/media/media-picker"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { FoldingMenu, MenuAction, MenuLine } from "@/components/shared/folding-menu"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { SavedViewsControls, SaveViewDialog, type SavedViewsScreen } from "@/components/shared/saved-views"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { ViewMenu } from "@/components/shared/view-menu"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import {
  addUploadsToArchive,
  binArchiveItems,
  getArchiveErrorMessage,
  loadArchiveItems,
  loadEveryArchiveItem,
  restoreArchiveItem,
  type ArchiveCard,
  type ArchiveProjectRow,
} from "@/lib/api/archive/items"
import type { SavedView } from "@/lib/api/saved-views"
import { BIN_DAYS, type ArchiveItemKind } from "@/lib/archive/items"
import {
  ARCHIVE_FILTER_KEYS,
  ARCHIVE_VIEW_KIND,
  describeArchiveFilters,
  keptArchiveFilters,
  readArchiveSearch,
} from "@/lib/archive/search"
import { formatFileSize } from "@/lib/format/format-bytes"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import type { ProjectsSearch } from "@/lib/social/projects-dashboard-search"
import { showErrorToast } from "@/lib/toast/error-toast"

type Column = "title" | "kind" | "project" | "posted" | "size"

/** How often the list asks again while something is still arriving from Video. */
const ARRIVING_POLL_MS = 4_000

const KIND_ICONS: Record<ArchiveItemKind, React.ComponentType<{ className?: string }>> = {
  video: FilmIcon,
  carousel: GalleryHorizontalIcon,
  picture: ImageIcon,
}
const KIND_WORDS: Record<ArchiveItemKind, string> = { video: "Video", carousel: "Carousel", picture: "Picture" }

/** "0:42", "12 slides" or the picture's size. */
function measure(item: ArchiveCard): string {
  if (item.kind === "carousel") return `${item.slides} ${plural(item.slides, "slide", "slides")}`
  if (item.kind === "video" && item.durationMs) {
    const seconds = Math.round(item.durationMs / 1000)
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
  }
  return formatFileSize(item.fileSize)
}

/**
 * The Archive section (Tyler, 12 Nov 2026): the videos, carousels and
 * pictures sent from Video or uploaded (`workspace/docs/archive.md`), in the
 * dashboard's one header and table shape. With no project picked in the
 * Projects block, every project's items show, each row naming its project;
 * picking one narrows the list to it, and only then do its saved views, the
 * zip and uploads without asking which project come in.
 *
 * - **Header:** All, Videos, Carousels, Pictures and Bin as tabs; search,
 *   Select, Filter (posted, most viewed, grouped by Video project), Views,
 *   and Add, which uploads or asks Video for a video.
 * - **Right:** the open item, played, swiped or shown, with its captions,
 *   where it went out and its ⋮ (`ArchiveItemPanel`).
 */
export function ArchiveSection({
  projects,
  views,
  search,
  projectId,
  frame,
}: {
  projects: ArchiveProjectRow[]
  /** The picked project's saved views, read by the route. Empty with no project picked. */
  views: SavedView[]
  search: ProjectsSearch
  projectId: string
  frame: CrmFrame
}) {
  const router = useRouter()
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const project = projects.find((row) => row.id === projectId) ?? null
  const inBin = search.bin === "1"
  const q = search.q ?? ""
  const [items, setItems] = React.useState<ArchiveCard[] | null>(null)
  const [binCount, setBinCount] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const reload = React.useCallback(() => setReloads((count) => count + 1), [])
  /** Something changed: the list, and the route's copy behind the left page's counts, read again. */
  const changed = React.useCallback(() => {
    reload()
    void router.invalidate()
  }, [reload, router])
  const [sort, setSort] = React.useState<Column | null>(null)
  const [direction, setDirection] = React.useState<"asc" | "desc">("asc")
  const toggleSort = (column: Column) => {
    if (column === sort) setDirection(direction === "asc" ? "desc" : "asc")
    else {
      setSort(column)
      setDirection(column === "title" || column === "project" ? "asc" : "desc")
    }
  }
  const folds = useFolds()
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getArchiveErrorMessage)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [savingView, setSavingView] = React.useState(false)
  const [uploadTo, setUploadTo] = React.useState<ArchiveProjectRow | null>(null)
  const [askFor, setAskFor] = React.useState<ArchiveProjectRow | null>(null)

  const queryKey = JSON.stringify([projectId, search.kind, q, search.posted, search.sort, inBin, reloads])
  React.useEffect(() => {
    let cancelled = false
    const query = {
      kind: inBin ? undefined : search.kind,
      q: q || undefined,
      notPosted: search.posted === "no",
      sort: search.sort === "views" ? ("views" as const) : ("newest" as const),
      bin: inBin,
    }
    ;(projectId ? loadArchiveItems({ projectId, ...query }) : loadEveryArchiveItem(query)).then(
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
    const timer = setInterval(reload, ARRIVING_POLL_MS)
    return () => clearInterval(timer)
  }, [arriving, reload])

  const projectName = React.useCallback((id: string) => projects.find((row) => row.id === id)?.name ?? "", [projects])

  const sorted = React.useMemo(() => {
    const list = items ?? []
    // Unsorted, the server's order holds: pinned first, then newest or most viewed.
    if (!sort) return list
    const sign = direction === "asc" ? 1 : -1
    return [...list].sort((a, b) => {
      if (sort === "kind") return a.kind.localeCompare(b.kind) * sign
      if (sort === "project") return projectName(a.projectId).localeCompare(projectName(b.projectId)) * sign
      if (sort === "posted") return (a.posted - b.posted) * sign
      if (sort === "size") return (a.fileSize - b.fileSize) * sign
      return (a.title || "~").localeCompare(b.title || "~") * sign
    })
  }, [direction, items, projectName, sort])

  const groups = React.useMemo(() => {
    if (search.group !== "source") return [{ label: null as string | null, rows: sorted }]
    const byName = new Map<string, ArchiveCard[]>()
    for (const item of sorted) {
      const name = item.videoProjectName || "Uploaded"
      byName.set(name, [...(byName.get(name) ?? []), item])
    }
    return [...byName.entries()].map(([label, rows]) => ({ label: label as string | null, rows }))
  }, [search.group, sorted])

  const ids = groups.flatMap((group) => (group.label && folds.folded(group.label) ? [] : group.rows)).map((item) => item.id)
  const openId = search.open
  const loaded = items !== null

  const firstId = sorted[0]?.id
  const openInList = Boolean(openId && sorted.some((item) => item.id === openId))
  React.useEffect(() => {
    if (loaded && firstId && !openInList) setListSearch({ open: firstId })
  }, [firstId, loaded, openInList, setListSearch])
  const [pressedId, setPressedId] = React.useState<string>()
  const pick = (id: string) => {
    setPressedId(id)
    setOpen(id)
  }

  const filterKey = `${projectId}|${search.kind}|${q}|${search.posted}|${search.sort}|${inBin}`
  useClearSelectionOnListChange(selection.setSelected, filterKey)
  const selected = sorted.filter((item) => selection.selected.has(item.id))
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }

  async function toBin(list: ArchiveCard[]) {
    const ok = await run(async () => {
      await binArchiveItems(list.map((item) => item.id))
      changed()
    })
    if (ok) selection.clear()
  }
  async function putBack(list: ArchiveCard[]) {
    const ok = await run(async () => {
      for (const item of list) await restoreArchiveItem(item.id)
      changed()
    })
    if (ok) selection.clear()
  }
  async function upload(target: ArchiveProjectRow, mediaUrl: string) {
    try {
      await addUploadsToArchive(target.id, [mediaUrl])
      changed()
    } catch (failure) {
      showErrorToast(getArchiveErrorMessage(failure))
    }
  }

  const actionsFor = (item: ArchiveCard): RowMenuItem[] =>
    item.deletedAt
      ? [{ label: "Put back", icon: <Undo2Icon className="size-4" />, onSelect: () => void putBack([item]) }]
      : [{ label: "Move to the Bin", icon: <Trash2Icon className="size-4" />, destructive: true, onSelect: () => void toBin([item]) }]

  const here: SavedViewsScreen | null = project
    ? {
        screen: `${ARCHIVE_VIEW_KIND}:${project.id}`,
        describe: (filters) => describeArchiveFilters(filters),
        kept: (filters) => keptArchiveFilters(filters),
      }
    : null
  const viewFilters = keptArchiveFilters(search)
  const filterCount = [search.posted, search.sort, search.group].filter(Boolean).length

  const tab = inBin ? "bin" : (search.kind ?? "all")
  const tabs = [
    { value: "all", label: "All" },
    { value: "video", label: "Videos" },
    { value: "carousel", label: "Carousels" },
    { value: "picture", label: "Pictures" },
    { value: "bin", label: "Bin", count: binCount || undefined },
  ]
  const pickTab = (value: string) =>
    setListSearch({
      bin: value === "bin" ? "1" : undefined,
      kind: value === "all" || value === "bin" ? undefined : value,
      open: undefined,
    })

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={
          <>
            <PanelReopenButton side="left" label="Show the page" />
            <span className="hidden @3xl:contents">
              <DashboardTabs value={tab} onValueChange={pickTab} tabs={tabs} />
            </span>
            <span className="shrink-0 @3xl:hidden">
              <ViewMenu value={tab} onValueChange={pickTab} choices={tabs} label="Which items" />
            </span>
          </>
        }
        end={<PanelReopenButton side="right" label="Show the item" />}
        selected={
          massSelect && selected.length ? (
            <SelectedMenu
              count={selected.length}
              busy={busy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) =>
                inBin ? (
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      void putBack(selected)
                    }}
                  >
                    <Undo2Icon className="size-4 text-muted-foreground" />
                    Put back
                  </SelectedMenuRow>
                ) : (
                  <SelectedMenuRow
                    className="text-destructive"
                    onClick={() => {
                      menu.close()
                      void toBin(selected)
                    }}
                  >
                    <Trash2Icon className="size-4" />
                    Move to the Bin
                  </SelectedMenuRow>
                )
              }
            />
          ) : null
        }
        menuLabel="More for the archive"
        menuItems={
          project
            ? [
                {
                  label: `Download ${project.name} as a zip`,
                  icon: <DownloadIcon className="size-4" />,
                  onClick: () => window.location.assign(`/api/archive/zip/${encodeURIComponent(project.id)}`),
                },
              ]
            : undefined
        }
        search={{
          name: "archive-search",
          label: "Search titles and captions",
          placeholder: "Search the archive",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <FilterPopover
            count={filterCount}
            open={filterOpen}
            onOpenChange={setFilterOpen}
            onClear={() => setListSearch({ posted: undefined, sort: undefined, group: undefined })}
            contentClassName="w-60"
            save={
              here ? (
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
            <ArchiveFilter
              id="archive-posted"
              label="Posted"
              value={search.posted}
              any="Posted or not"
              options={[["no", "Not posted yet"]]}
              onChange={(posted) => setListSearch({ posted })}
            />
            <ArchiveFilter
              id="archive-sort"
              label="Sort"
              value={search.sort}
              any="Newest first"
              options={[["views", "Most viewed"]]}
              onChange={(value) => setListSearch({ sort: value })}
            />
            <ArchiveFilter
              id="archive-group"
              label="Group"
              value={search.group}
              any="No groups"
              options={[["source", "By Video project"]]}
              onChange={(group) => setListSearch({ group })}
            />
          </FilterPopover>
        }
        view={
          here ? (
            <SavedViewsControls
              here={here}
              views={views}
              filters={viewFilters}
              saveButton={false}
              buttonVariant="ghost"
              onOpen={(saved) =>
                setListSearch({
                  ...Object.fromEntries(ARCHIVE_FILTER_KEYS.map((key) => [key, undefined])),
                  ...readArchiveSearch(saved.filters),
                  bin: undefined,
                  open: undefined,
                })
              }
            />
          ) : null
        }
        primary={
          <AddMenu
            projects={projects}
            picked={project}
            onUpload={setUploadTo}
            onAsk={setAskFor}
          />
        }
      />
      {error ? (
        <div className="px-6 py-3">
          <ErrorRow message={error} onRetry={reload} />
        </div>
      ) : !items ? (
        <div className="px-6 py-3">
          <LoadingRow label="Opening the archive…" />
        </div>
      ) : (
        <CrmTable<Column>
          columns={[
            { key: "title", label: "Item", column: "main", className: "min-w-40" },
            { key: "kind", label: "Kind", column: "preview", className: "hidden md:hidden @lg:table-cell" },
            { key: "project", label: "Project", column: "preview", className: projectId ? "hidden" : "hidden md:hidden @2xl:table-cell" },
            { key: "posted", label: "Posted", column: "meta", className: "hidden md:hidden @xl:table-cell" },
            { key: "size", label: "Length or size", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
          ]}
          sort={sort ?? "title"}
          direction={sort ? direction : "asc"}
          onSort={toggleSort}
          actions={false}
          select={
            massSelect
              ? {
                  noun: "items",
                  disabled: ids.length === 0,
                  checked: selection.selectAllState(ids),
                  onToggle: () => selection.toggleVisible(ids),
                }
              : null
          }
          empty={
            sorted.length > 0
              ? null
              : inBin
                ? `The Bin is empty. A deleted item waits here for ${BIN_DAYS} days.`
                : q || search.kind || search.posted
                  ? "Nothing in the archive matches that."
                  : project
                    ? `${project.name}'s archive is empty. Press Send to Promo on an export in Video, or Add to upload a file.`
                    : "The archive is empty. Press Send to Promo on an export in Video, or Add to upload a file."
          }
        >
          {groups.map((group) => (
            <React.Fragment key={group.label ?? "all"}>
              {group.label ? (
                <CrmGroupRow
                  label={group.label}
                  count={group.rows.length}
                  folded={folds.folded(group.label)}
                  onToggle={() => folds.toggle(group.label!)}
                />
              ) : null}
              {group.label && folds.folded(group.label)
                ? null
                : group.rows.map((item) => {
                    const Icon = KIND_ICONS[item.kind]
                    return (
                      <CrmTableRow
                        key={item.id}
                        open={item.id === openId}
                        label={item.title || "Untitled"}
                        tick={{ shown: massSelect, ticked: selection.selected.has(item.id), onToggle: () => selection.toggle(item.id) }}
                        onOpen={() => pick(item.id)}
                        onRightClick={(x, y) => setRightClick({ id: item.id, x, y })}
                      >
                        <MainCell
                          name={item.title || "Untitled"}
                          lead={
                            item.coverUrl ? (
                              <img src={item.coverUrl} alt="" loading="lazy" className="size-7 shrink-0 rounded-md object-cover" />
                            ) : (
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                <Icon className="size-3.5" />
                              </span>
                            )
                          }
                        >
                          {item.pinned ? <PinIcon className="size-3 shrink-0 text-muted-foreground" aria-label="Pinned" /> : null}
                          {item.status === "copying" ? (
                            <Chip muted className="shrink-0">
                              <Loader2Icon className="size-3 animate-spin" aria-hidden />
                              Arriving
                            </Chip>
                          ) : null}
                        </MainCell>
                        <TableCell column="preview" className="hidden md:hidden @lg:table-cell">
                          <Chip muted>{KIND_WORDS[item.kind]}</Chip>
                        </TableCell>
                        <TableCell column="preview" className={projectId ? "hidden" : "hidden md:hidden @2xl:table-cell"}>
                          <span className="block truncate">{projectName(item.projectId)}</span>
                        </TableCell>
                        <TableCell column="mutedMeta" className="hidden md:hidden @xl:table-cell">
                          {item.posted ? `${item.posted} ${plural(item.posted, "time", "times")}` : "Not yet"}
                        </TableCell>
                        <TableCell column="mutedMeta" className="hidden tabular-nums md:hidden @3xl:table-cell">
                          {measure(item)}
                        </TableCell>
                      </CrmTableRow>
                    )
                  })}
            </React.Fragment>
          ))}
        </CrmTable>
      )}
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={(() => {
            const item = sorted.find((each) => each.id === rightClick.id)
            return item ? actionsFor(item) : []
          })()}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: filterKey,
    showRightFor: pressedId && pressedId === search.open ? pressedId : undefined,
    middle,
    right: {
      label: "Item",
      showLabel: "Show the item",
      content: (
        <div className="flex h-full min-h-0 flex-col bg-card">
          <ArchiveItemPanel
            key={openId ?? "none"}
            itemId={openInList ? openId : undefined}
            canManage
            collapse
            projects={projects.map((row) => ({ id: row.id, name: row.name }))}
            onChanged={changed}
            onOpen={(itemId) => setListSearch({ open: itemId })}
          />
        </div>
      ),
    },
    windows: (
      <>
        {here ? <SaveViewDialog open={savingView} here={here} filters={viewFilters} onClose={() => setSavingView(false)} /> : null}
        {askFor ? <AskForVideoDialog projectId={askFor.id} projectName={askFor.name} onClose={() => setAskFor(null)} /> : null}
        <MediaPicker
          open={uploadTo !== null}
          onOpenChange={(open) => {
            if (!open) setUploadTo(null)
          }}
          onSelectMedia={(url) => {
            if (uploadTo) void upload(uploadTo, url)
          }}
          showVideos
        />
      </>
    ),
  })
}

/** One of Filter's rows: a label, then a select whose first choice is "any". */
function ArchiveFilter<T extends string>({
  id,
  label,
  value,
  any,
  options,
  onChange,
}: {
  id: string
  label: string
  value: T | undefined
  any: string
  options: [T, string][]
  onChange: (value: T | undefined) => void
}) {
  return (
    <FilterRow id={id} label={label}>
      <Select value={value ?? "any"} onValueChange={(next) => onChange(next === "any" ? undefined : (next as T))}>
        <SelectTrigger id={id} className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">{any}</SelectItem>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterRow>
  )
}

/**
 * Add, the one primary button, opening a menu (Travel's trip page pattern):
 * Upload or pick files, then Ask Video for a video. With a project picked in
 * the Projects block both go to it; with none, each project is a row of its
 * own under each action, so nothing lands in a project nobody chose.
 */
function AddMenu({
  projects,
  picked,
  onUpload,
  onAsk,
}: {
  projects: ArchiveProjectRow[]
  picked: ArchiveProjectRow | null
  onUpload: (project: ArchiveProjectRow) => void
  onAsk: (project: ArchiveProjectRow) => void
}) {
  const [open, setOpen] = React.useState(false)
  const run = (work: () => void) => () => {
    setOpen(false)
    work()
  }
  const targets = picked ? [picked] : projects
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
      {!targets.length ? (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">Make a project first, in the Projects section.</p>
      ) : (
        <>
          {targets.map((project) => (
            <MenuAction key={`up-${project.id}`} icon={<UploadIcon className="size-4" />} onClick={run(() => onUpload(project))}>
              {picked ? "Upload or pick files" : `Upload to ${project.name}`}
            </MenuAction>
          ))}
          <MenuLine />
          {targets.map((project) => (
            <MenuAction key={`ask-${project.id}`} icon={<FolderArchiveIcon className="size-4" />} onClick={run(() => onAsk(project))}>
              {picked ? "Ask Video for a video" : `Ask Video for a video for ${project.name}`}
            </MenuAction>
          ))}
        </>
      )}
    </FoldingMenu>
  )
}
