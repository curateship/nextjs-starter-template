import * as React from "react"
import { Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router"
import {
  GridIcon,
  ListIcon,
  SettingsIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  DashboardCardTitleHeader,
} from "@/components/shared/dashboard-card-header"
import {
  dashboardToolbarButtonActiveClassName,
  dashboardToolbarButtonGroupClassName,
  dashboardToolbarButtonGroupItemClassName,
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PlayerPanel } from "@/components/video-viral/player-panel"
import type { Favourites } from "@/components/video-viral/star-menu"
import { VideoGrid, VideoList } from "@/components/video-viral/video-grid"
import { ViralPanels } from "@/components/video-viral/viral-panels"
import { useSavedProgress } from "@/components/video-viral/use-saved-progress"
import { getViralErrorMessage } from "@/lib/api/video/viral"
import {
  deleteViralCollection,
  renameViralCollection,
  type ViralCollectionSummary,
} from "@/lib/api/video/viral-collections"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { focusRing } from "@/lib/layout/focus-ring"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import type { ViralVideo } from "@/lib/video/viral"
import {
  filterVideos,
  sortVideos,
  VIRAL_CARD_SIZES,
  VIRAL_LAYOUTS,
  VIRAL_SORTS,
  viralSortLabels,
  type ViralCardSize,
  type ViralSort,
} from "@/lib/video/viral-view"

type CollectionSearch = {
  video?: string
  sort?: ViralSort
  direction?: "asc" | "desc"
  q?: string
}

const LAYOUT_STORAGE_KEY = "video-viral-layout"
const SIZE_STORAGE_KEY = "video-viral-card-size"

/**
 * Favourites, its own page beside Viral in the left menu: every collection on
 * the left, the open one's starred videos in the middle, the one picked
 * playing on the right. Taking a star off removes it from here only.
 */
export function ViralCollectionScreen({
  collection,
  collections,
  videos,
  favourites,
}: {
  /** Null on `/admin/video-favourites` while there is no collection yet. */
  collection: ViralCollectionSummary | null
  collections: ViralCollectionSummary[]
  videos: ViralVideo[]
  favourites: Favourites
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as CollectionSearch
  const setSearch = useListSearchNavigate()
  const sort: ViralSort = search.sort ?? "score"
  const direction = search.direction ?? "desc"
  const [searchText, setSearchText] = useSearchBoxText(search.q ?? "", (next) =>
    setSearch({ q: next.trim() ? next : undefined })
  )
  const [layout, setLayout] = useRememberedChoice(LAYOUT_STORAGE_KEY, "list", VIRAL_LAYOUTS)
  const [size, setSize] = useRememberedChoice<ViralCardSize>(SIZE_STORAGE_KEY, "medium", VIRAL_CARD_SIZES)
  const [renaming, setRenaming] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [run, busy] = useAsyncAction(getViralErrorMessage)
  const refresh = React.useCallback(() => router.invalidate(), [router])
  const progress = useSavedProgress(videos, () => void refresh())

  const shown = React.useMemo(
    () =>
      sortVideos(
        filterVideos(videos, {
          minViews: 0,
          minScore: 0,
          source: "both",
          keyword: null,
          text: search.q ?? "",
          minFit: 0,
        }),
        sort,
        direction
      ).map(progress.apply),
    [direction, progress.apply, search.q, sort, videos]
  )
  const found = videos.find((video) => video.key === search.video)
  const picked = found ? progress.apply(found) : null

  const missingVideo = Boolean(search.video) && !picked
  React.useEffect(() => {
    if (missingVideo) setSearch({ video: undefined })
  }, [missingVideo, setSearch])

  async function confirmDelete() {
    if (!collection) return
    await run(async () => {
      await deleteViralCollection(collection.id)
      setDeleting(false)
      toast.success(`Deleted “${collection.name}”. No video was deleted.`)
      // The page itself opens whichever collection is left, or says there
      // is none.
      await navigate({ to: "/admin/video-favourites" })
    })
  }

  const left = (
    <>
      <DashboardCardTitleHeader icon={<StarIcon />} title="Favourites" />
      <ScrollArea className="min-h-0 flex-1">
        <ul className="grid gap-1 p-3">
          {collections.length ? null : (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              No collections yet.
            </li>
          )}
          {collections.map((one) => (
            <li key={one.id} className="flex items-center gap-1">
              <Link
                to="/admin/video-favourites/$collectionId"
                params={{ collectionId: one.id }}
                aria-current={one.id === collection?.id ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm",
                  one.id === collection?.id ? "bg-muted font-medium" : "hover:bg-muted/50",
                  focusRing
                )}
              >
                <span className="truncate">{one.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{one.item_count}</span>
              </Link>
              {one.id === collection?.id ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Rename ${one.name}`} onClick={() => setRenaming(true)}>
                        <SettingsIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Rename</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${one.name}`} onClick={() => setDeleting(true)}>
                        <Trash2Icon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete the collection</TooltipContent>
                  </Tooltip>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </ScrollArea>
    </>
  )

  const gridProps = {
    videos: shown,
    selectedKey: picked?.key ?? null,
    onPick: (video: ViralVideo) => setSearch({ video: video.key }),
    favourites,
    onFavouritesChanged: refresh,
    projectId: null,
  }

  const middle = (
    <>
      <DashboardCardTitleHeader
        icon={<StarIcon />}
        title={collection?.name ?? "No collection yet"}
        meta={collection ? `${videos.length} ${plural(videos.length, "video")}` : undefined}
        action={
          <div className={dashboardToolbarButtonGroupClassName}>
            <DashboardToolbarButton
              type="button"
              variant="ghost"
              aria-label="Grid"
              aria-pressed={layout === "grid"}
              className={cn(dashboardToolbarButtonGroupItemClassName, layout === "grid" && dashboardToolbarButtonActiveClassName)}
              onClick={() => setLayout("grid")}
            >
              <GridIcon className="size-4" />
            </DashboardToolbarButton>
            <DashboardToolbarButton
              type="button"
              variant="ghost"
              aria-label="List"
              aria-pressed={layout === "list"}
              className={cn(dashboardToolbarButtonGroupItemClassName, layout === "list" && dashboardToolbarButtonActiveClassName)}
              onClick={() => setLayout("list")}
            >
              <ListIcon className="size-4" />
            </DashboardToolbarButton>
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <DashboardToolbarSearch
          name="viral-collection-search"
          aria-label="Search these videos"
          placeholder="Search titles and channels…"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select value={sort} onValueChange={(next) => setSearch({ sort: next === "score" ? undefined : next, direction: undefined })}>
          <DashboardToolbarSelectTrigger aria-label="Sort by" className="min-w-36">
            <SelectValue />
          </DashboardToolbarSelectTrigger>
          <SelectContent>
            {VIRAL_SORTS.filter((one) => one !== "topic").map((one) => (
              <SelectItem key={one} value={one}>
                Sort: {viralSortLabels[one]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {layout === "grid" ? (
          <Select value={size} onValueChange={(next) => setSize(next as ViralCardSize)}>
            <DashboardToolbarSelectTrigger aria-label="Card size" className="min-w-24">
              <SelectValue />
            </DashboardToolbarSelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {!collection
              ? "Press the star on any video in a Viral project and make a collection. It shows here."
              : videos.length
                ? "No starred video matches that search."
                : "Nothing starred here yet. Press the star on any video in a project."}
          </p>
        ) : layout === "grid" ? (
          <VideoGrid size={size} {...gridProps} />
        ) : (
          <VideoList
            {...gridProps}
            sort={sort}
            direction={direction}
            onSort={(column) =>
              setSearch(
                column === sort
                  ? { direction: direction === "desc" ? "asc" : undefined }
                  : { sort: column === "score" ? undefined : column, direction: undefined }
              )
            }
          />
        )}
      </ScrollArea>
    </>
  )

  return (
    <>
      <ViralPanels
        left={left}
        middle={middle}
        right={
          <PlayerPanel
            video={picked}
            projectId={null}
            favourites={favourites}
            onFavouritesChanged={refresh}
            onSavedChange={progress.report}
            onDeleted={async (video) => {
              // The star stays: a favourite keeps its own copy of the details.
              progress.forget([video.key])
              await refresh()
            }}
          />
        }
        leftLabel="Show the collections"
        rightLabel="Show the video"
        rightOpen={Boolean(picked)}
        onCloseRight={() => setSearch({ video: undefined })}
      />

      {collection ? (
        <RenameCollectionDialog
          open={renaming}
          collection={collection}
          onOpenChange={setRenaming}
          onRenamed={refresh}
        />
      ) : null}

      <ConfirmDialog
        open={deleting && collection !== null}
        onOpenChange={setDeleting}
        title={`Delete “${collection?.name ?? ""}”?`}
        description={`Only the collection and its ${videos.length} ${plural(videos.length, "star")} go. No video, search result or breakdown is deleted.`}
        confirmLabel="Delete collection"
        loading={busy}
        onConfirm={confirmDelete}
      />
    </>
  )
}

function RenameCollectionDialog({
  open,
  collection,
  onOpenChange,
  onRenamed,
}: {
  open: boolean
  collection: ViralCollectionSummary
  onOpenChange: (open: boolean) => void
  onRenamed: () => Promise<void>
}) {
  const [name, setName] = React.useState(collection.name)
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setName(collection.name)
      setInvalid(false)
    }
  }

  async function submit() {
    if (busy) return
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("A collection needs a name.")
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      await renameViralCollection(collection.id, name)
      await onRenamed()
      toast.success("Collection renamed.")
      onOpenChange(false)
    } catch (error) {
      setInvalid(true)
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog
      open={open}
      dirty={name.trim() !== collection.name}
      busy={busy}
      onClose={() => onOpenChange(false)}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename collection</DialogTitle>
            <DialogDescription>Its starred videos stay as they are.</DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Collection</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="viral-collection-rename">Name</Label>
                    <Input
                      id="viral-collection-rename"
                      autoFocus
                      maxLength={120}
                      value={name}
                      aria-invalid={invalid || undefined}
                      onChange={(event) => {
                        setName(event.target.value)
                        setInvalid(false)
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
