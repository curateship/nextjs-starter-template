import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import {
  DownloadIcon,
  EyeOffIcon,
  GridIcon,
  LinkIcon,
  ListIcon,
  Loader2Icon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  DashboardCardHeader,
  DashboardCardTitleHeader,
} from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import {
  MassSelectChip,
  SelectedMenu,
  SelectedMenuRow,
} from "@/components/shared/mass-select"
import {
  SaveViewDialog,
  SavedViewsControls,
  type EditFields,
  type SavedViewsScreen,
} from "@/components/shared/saved-views"
import { SearchToggle } from "@/components/shared/search-toggle"
import { ThreePanels } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CreatorCard } from "@/components/video-viral/creator-card"
import { CreatorsCard } from "@/components/video-viral/creators-card"
import { DeleteSavedVideosDialog } from "@/components/video-viral/delete-saved-videos-dialog"
import { HookBoard } from "@/components/video-viral/hook-board"
import { PasteLinkDialog } from "@/components/video-viral/paste-link-dialog"
import { PlayerPanel } from "@/components/video-viral/player-panel"
import { ProjectPanel } from "@/components/video-viral/project-panel"
import { StarMenu, type Favourites } from "@/components/video-viral/star-menu"
import { VideoGrid, VideoList } from "@/components/video-viral/video-grid"
import { ViralProjectDialog } from "@/components/video-viral/viral-project-dialog"
import { useSavedProgress } from "@/components/video-viral/use-saved-progress"
import type { SavedView } from "@/lib/api/saved-views"
import { getViralErrorMessage } from "@/lib/api/video/viral"
import {
  addViralKeywordFn,
  followViralChannel,
  hideViralChannelsFn,
  loadChannelUploadsFn,
  refreshViralKeyword,
  removeViralKeywordFn,
  searchViralProject,
  setViralCreatorWatch,
  unfollowViralCreator,
} from "@/lib/api/video/viral-projects"
import { saveVideos } from "@/lib/api/video/viral-videos"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { SAVED_VIEW_ERRORS, savedViewScreen, type SavedViewValues } from "@/lib/saved-views"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { formatCount } from "@/lib/video/creators"
import {
  countVideos,
  isKeywordWorking,
  postsPerWeek,
  unitsPerKeyword,
  type ViralCreator,
  type ViralKeyword,
  type ViralProjectScreen,
  type ViralVideo,
} from "@/lib/video/viral"
import {
  describeViralView,
  VIRAL_SAVED_VIEW_KIND,
  viralViewFilters,
  type ViralViewFilters,
} from "@/lib/video/viral-saved-views"
import {
  filterCreators,
  filterVideos,
  sortVideos,
  VIRAL_CARD_SIZES,
  VIRAL_LAYOUTS,
  VIRAL_FIT_CHOICES,
  VIRAL_SORTS,
  VIRAL_SOURCES,
  viralSortLabels,
  viralSourceLabels,
  type SubscriberRange,
  type ViralCardSize,
  type ViralSort,
  type ViralSource,
} from "@/lib/video/viral-view"

const projectRoute = getRouteApi("/_authenticated/admin/video-viral_/$projectId")

/** While a keyword is searching, the screen reads the project again this often. */
const SEARCHING_POLL_MS = 3000

const LAYOUT_STORAGE_KEY = "video-viral-layout"
const SIZE_STORAGE_KEY = "video-viral-card-size"

/**
 * Where this browser keeps the panels' widths, and where the dashboard was.
 * App keys, so they live here rather than in the shell's `panelLayoutKey`.
 * The `-2` drops widths measured for the layout before 20 Oct 2026.
 */
const LAYOUT_KEY = "video-viral-project-horizontal-2"
const PLACE_KEY = "video-viral-project-place"

type ChannelUploads =
  | { state: "loading" }
  | { state: "ready"; videos: ViralVideo[] }
  | { state: "failed"; error: string }

/**
 * One Viral project's three-column dashboard (UI standard, "Three-column
 * dashboards"): the project, its keywords and its creators on the left, the
 * videos in the middle, the one picked on the right. Everything the address
 * can hold lives there (the tab, the open video, the picked creator, the sort,
 * the filters), so a reload or a shared link opens the same thing. Nothing
 * here calls YouTube except the buttons that say what they cost.
 */
export function ViralProjectScreenView({
  screen,
  favourites,
  views,
}: {
  screen: ViralProjectScreen
  favourites: Favourites
  views: SavedView[]
}) {
  const router = useRouter()
  const search = projectRoute.useSearch()
  const setSearch = useListSearchNavigate()
  const { project } = screen
  const view = search.view ?? "videos"
  const sort: ViralSort = search.sort ?? "score"
  const direction = search.direction ?? "desc"
  const source: ViralSource = search.from ?? "both"
  const keywordFilter = search.keyword ?? null
  const fit = search.fit ?? 0
  const text = search.q ?? ""

  // The list for a browser that never chose (Tyler, 20 Oct 2026).
  const [layout, setLayout] = useRememberedChoice(LAYOUT_STORAGE_KEY, "list", VIRAL_LAYOUTS)
  const [size, setSize] = useRememberedChoice<ViralCardSize>(SIZE_STORAGE_KEY, "medium", VIRAL_CARD_SIZES)
  const [selecting, setSelecting] = React.useState(false)
  const [ticked, setTicked] = React.useState<Set<string>>(new Set())
  const [range, setRange] = React.useState<SubscriberRange>({ min: null, max: null })
  const [creatorSearch, setCreatorSearch] = React.useState("")
  const [uploads, setUploads] = React.useState<Record<string, ChannelUploads>>({})
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [savingView, setSavingView] = React.useState(false)
  const [removing, setRemoving] = React.useState<ViralKeyword | null>(null)
  const [offerSearch, setOfferSearch] = React.useState(false)
  const [deletingVideos, setDeletingVideos] = React.useState<ViralVideo[]>([])
  const [pasting, setPasting] = React.useState(false)
  // A switch flipped here shows at once, before the screen reads itself again.
  const [watchOverride, setWatchOverride] = React.useState<Record<string, boolean>>({})
  const [run, busy] = useAsyncAction(getViralErrorMessage)
  // Typing stays instant; the address catches up a moment later.
  const [searchText, setSearchText] = useSearchBoxText(text, (next) =>
    setSearch({ q: next.trim() ? next : undefined })
  )

  const refresh = React.useCallback(() => router.invalidate(), [router])
  // Every video this screen knows of, so a card keeps saying it is being
  // saved and broken down while somebody looks at other videos.
  const allVideos = React.useMemo(
    () => [
      ...screen.videos,
      ...Object.values(uploads).flatMap((one) => (one.state === "ready" ? one.videos : [])),
    ],
    [screen.videos, uploads]
  )
  const progress = useSavedProgress(allVideos, () => void refresh())

  // A keyword searching in the background writes its results when it is done,
  // so the screen reads the project again until none is waiting.
  const searching = screen.keywords.some((keyword) => isKeywordWorking(keyword.status))
  React.useEffect(() => {
    if (!searching) return
    const timer = setInterval(() => void router.invalidate(), SEARCHING_POLL_MS)
    return () => clearInterval(timer)
  }, [router, searching])

  // The project's own filters first, then the ones in the address.
  const shown = React.useMemo(
    () =>
      sortVideos(
        filterVideos(screen.videos, {
          minViews: project.min_views,
          minScore: project.min_score,
          source,
          keyword: keywordFilter,
          text,
          minFit: fit,
        }),
        sort,
        direction
      ),
    [direction, fit, keywordFilter, project.min_score, project.min_views, screen.videos, sort, source, text]
  )
  const projectVideos = React.useMemo(
    () =>
      filterVideos(screen.videos, {
        minViews: project.min_views,
        minScore: project.min_score,
        source: "both",
        keyword: null,
        text: "",
        minFit: 0,
      }),
    [project.min_score, project.min_views, screen.videos]
  )
  const creators = React.useMemo(
    () =>
      filterCreators(screen.creators, range, creatorSearch).map((creator) =>
        creator.followedId && creator.followedId in watchOverride
          ? { ...creator, watch: watchOverride[creator.followedId] }
          : creator
      ),
    [range, screen.creators, creatorSearch, watchOverride]
  )

  const pickedCreator = screen.creators.find((creator) => creator.key === search.creator) ?? null
  // A sample channel is made up and has no uploads to read, so its videos are
  // the sample results that are its. Anyone else's are read once and kept.
  const creatorUploads: ChannelUploads | undefined = pickedCreator
    ? project.sample
      ? {
          state: "ready",
          videos: screen.videos.filter((video) => video.channelId === pickedCreator.channelId),
        }
      : (uploads[pickedCreator.key] ?? { state: "loading" })
    : undefined
  // The Downloaded, Broken down and Hooks tabs are the Videos tab's list, with
  // its filters, kept to the videos downloaded with no AI yet, to the videos
  // whose breakdown has finished, and to those with words in their hook.
  const isDownloaded = (video: ViralVideo) => video.savedStatus === "downloaded"
  const isBrokenDown = (video: ViralVideo) => video.savedStatus === "ready"
  const hasHook = (video: ViralVideo) => video.hook !== null
  const appliedProjectVideos = projectVideos.map(progress.apply)
  const downloadedCount = appliedProjectVideos.filter(isDownloaded).length
  const brokenDownCount = appliedProjectVideos.filter(isBrokenDown).length
  const hookCount = projectVideos.filter(hasHook).length
  const middleVideos = pickedCreator
    ? creatorUploads?.state === "ready"
      ? creatorUploads.videos.map(progress.apply)
      : []
    : view === "broken"
      ? shown.map(progress.apply).filter(isBrokenDown)
      : view === "downloaded"
        ? shown.map(progress.apply).filter(isDownloaded)
        : view === "hooks"
          ? shown.map(progress.apply).filter(hasHook)
          : shown.map(progress.apply)

  // The open video is looked for everywhere this screen has videos, so a
  // filter that hides it does not stop it playing.
  const found = search.open ? allVideos.find((video) => video.key === search.open) : undefined
  const pickedVideo = found ? progress.apply(found) : null

  // An address naming a video that is no longer in the results (a re-run
  // replaced it, or its channel was hidden) drops it rather than failing.
  const missingVideo = Boolean(search.open) && !pickedVideo && creatorUploads?.state !== "loading"
  React.useEffect(() => {
    if (missingVideo) setSearch({ open: undefined })
  }, [missingVideo, setSearch])

  // A picked creator's uploads are read when they are first picked, and on a
  // reload with a creator in the address. A read already on its way is not
  // asked for twice.
  const asking = React.useRef(new Set<string>())
  const wanted = pickedCreator && !project.sample && !uploads[pickedCreator.key] ? pickedCreator : null
  React.useEffect(() => {
    if (!wanted || asking.current.has(wanted.key)) return
    const creator = wanted
    asking.current.add(creator.key)
    loadChannelUploadsFn({
      projectId: project.id,
      platform: creator.platform,
      channelId: creator.key.split(":").slice(1).join(":"),
      followedId: creator.followedId,
      subscribers: creator.subscribers,
    })
      .then((videos) =>
        setUploads((was) => ({
          ...was,
          [creator.key]: {
            state: "ready",
            videos: videos.map((video) => ({ ...video, channelName: video.channelName || creator.name })),
          },
        }))
      )
      .catch((error) =>
        setUploads((was) => ({
          ...was,
          [creator.key]: { state: "failed", error: getViralErrorMessage(error) },
        }))
      )
      .finally(() => asking.current.delete(creator.key))
  }, [project.id, wanted])

  function pickCreator(creator: ViralCreator) {
    setSearch({ creator: creator.key, open: undefined })
  }

  function retryUploads(creator: ViralCreator) {
    setUploads((was) => {
      const next = { ...was }
      delete next[creator.key]
      return next
    })
  }

  function pickVideo(video: ViralVideo) {
    setSearch({ open: video.key, at: undefined })
  }

  /** From the Hooks tab: plays the video from its hook's first moment. */
  function openAtHook(video: ViralVideo, startMs: number) {
    setSearch({ open: video.key, at: startMs || undefined })
  }

  function addLink() {
    if (project.sample) {
      showErrorToast("A sample project's videos are made up, so nothing can be pasted into it. Make your own project to try it.")
      return
    }
    setPasting(true)
  }

  function toggleTick(key: string) {
    setTicked((was) => {
      const next = new Set(was)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSelecting() {
    setSelecting((on) => !on)
    setTicked(new Set())
  }
  const tickedVideos = middleVideos.filter((video) => ticked.has(video.key))

  async function searchAll() {
    await run(async () => {
      const { queued, units } = await searchViralProject(project.id)
      await refresh()
      toast.success(`Searching ${queued} ${plural(queued, "keyword")} for ${units.toLocaleString()} units. Keep browsing; the videos arrive as each one finishes.`)
    })
  }

  async function refreshKeyword(keyword: ViralKeyword) {
    await run(async () => {
      const { units } = await refreshViralKeyword(keyword.id)
      await refresh()
      toast.success(`Searching “${keyword.keyword}” again for ${units} units.`)
    })
  }

  async function addKeyword(value: string) {
    let added = false
    await run(async () => {
      const { searchError } = await addViralKeywordFn(project.id, value)
      added = true
      await refresh()
      if (searchError) {
        toast.message(`Added “${value.trim()}”. ${searchError}`)
      } else if (!project.sample) {
        toast.success(`Added “${value.trim()}” and searching it.`)
      }
    })
    return added
  }

  async function confirmRemove() {
    const keyword = removing
    if (!keyword) return
    await run(async () => {
      await removeViralKeywordFn(keyword.id)
      setRemoving(null)
      await refresh()
      if (keywordFilter === keyword.keyword) setSearch({ keyword: undefined })
      toast.success(`Removed “${keyword.keyword}”.`)
    })
  }

  async function hideChannels(videos: { platform: ViralVideo["platform"]; channelId: string; channelName: string }[]) {
    const unique = [...new Map(videos.map((one) => [`${one.platform}:${one.channelId}`, one])).values()]
    await run(async () => {
      await hideViralChannelsFn(
        project.id,
        unique.map((one) => ({ platform: one.platform, channelId: one.channelId, channelName: one.channelName }))
      )
      setTicked(new Set())
      // Read the project again before the address changes: a navigation
      // started first would land with the videos as they were.
      await refresh()
      setSearch({ open: undefined, creator: undefined })
      toast.success(
        unique.length === 1
          ? `${unique[0].channelName || "That channel"} is hidden from this project. Project settings can show it again.`
          : `${unique.length} channels are hidden from this project. Project settings can show them again.`
      )
    })
  }

  /** Download (no AI) or Break it down, for some videos in one request. */
  async function saveMany(videos: ViralVideo[], analyse: boolean) {
    await run(async () => {
      const saving = videos.filter((video) => !video.sample)
      const saved = await saveVideos(
        saving.map((video) => video.url),
        project.id,
        analyse
      )
      saved.forEach((detail, index) =>
        progress.report(saving[index].key, { id: detail.id, status: detail.status })
      )
      setTicked(new Set())
      await refresh()
      const count = `${saved.length} ${plural(saved.length, "video")}`
      toast.success(
        analyse
          ? `Breaking down ${count}. Each shows its progress on its card.`
          : `Downloading ${count}. No AI runs. ${saved.length === 1 ? "It shows" : "They show"} on the Downloaded tab once ${saved.length === 1 ? "it is" : "they are"} in.`
      )
    })
  }

  async function changeWatch(creator: ViralCreator, watch: boolean) {
    const creatorId = creator.followedId
    if (!creatorId) return
    setWatchOverride((was) => ({ ...was, [creatorId]: watch }))
    await run(async () => {
      try {
        await setViralCreatorWatch(creatorId, watch)
      } catch (error) {
        setWatchOverride((was) => {
          const next = { ...was }
          delete next[creatorId]
          return next
        })
        throw error
      }
      await refresh()
      toast.success(
        watch
          ? `Checking ${creator.name} for new posts again, in every project they are in.`
          : `${creator.name} is paused in every project they are in. Their saved posts stay.`
      )
    })
  }

  /** The saved copies are gone: their cards drop the saved state at once. */
  async function afterDelete(keys: string[]) {
    progress.forget(keys)
    setTicked(new Set())
    await refresh()
  }

  async function follow(creator: ViralCreator) {
    if (!creator.channelId) return
    await run(async () => {
      await followViralChannel(project.id, creator.channelId as string)
      await refresh()
      toast.success(`Following ${creator.name} in this project.`)
    })
  }

  async function unfollow(creator: ViralCreator) {
    if (!creator.followedId) return
    await run(async () => {
      await unfollowViralCreator(project.id, creator.followedId as string)
      await refresh()
      toast.success(`Unfollowed ${creator.name} in this project.`)
    })
  }

  const hasSearched = screen.keywords.some((keyword) => keyword.ran_at)
  const searchAgainCost = screen.keywords.length * unitsPerKeyword(project.video_length)

  // ------------------------------------------------------- Saved views --

  // What the address holds now, as a view keeps it.
  const currentView = viralViewFilters({
    ...(search.q ? { q: search.q } : {}),
    ...(search.from ? { from: search.from } : {}),
    ...(search.fit ? { fit: search.fit } : {}),
    ...(search.keyword ? { keyword: search.keyword } : {}),
    ...(search.sort ? { sort: search.sort } : {}),
    ...(search.direction ? { direction: search.direction } : {}),
  })
  const viewsHere: SavedViewsScreen = {
    screen: savedViewScreen(VIRAL_SAVED_VIEW_KIND, project.id),
    describe: (filters) => describeViralView(viralViewFilters(filters)),
    kept: (filters) => viralViewFilters(filters) as SavedViewValues,
    // The shell's own refusals are sentences already; anything else is Viral's.
    describeError: (error) => {
      const message = error instanceof Error ? error.message : ""
      return (Object.values(SAVED_VIEW_ERRORS) as string[]).includes(message)
        ? message
        : getViralErrorMessage(error)
    },
  }

  /** Opens a view: its filters replace the ones set, and a removed keyword is said and left out. */
  function openView(saved: SavedView) {
    const filters = viralViewFilters(saved.filters)
    if (filters.keyword && !screen.keywords.some((keyword) => keyword.keyword === filters.keyword)) {
      showErrorToast(`The keyword “${filters.keyword}” was removed, so “${saved.name}” opened without it.`)
      delete filters.keyword
    }
    setSearch({
      q: filters.q,
      from: filters.from,
      fit: filters.fit,
      keyword: filters.keyword,
      sort: filters.sort,
      direction: filters.direction,
      creator: undefined,
    })
  }

  function saveAsView() {
    setFilterOpen(false)
    if (Object.keys(currentView).length === 0) {
      showErrorToast("Search or pick a filter first, then save it as a view.")
      return
    }
    setSavingView(true)
  }

  const editViewFields: EditFields = ({ filters, change }) => {
    const values = viralViewFilters(filters)
    return (
      <>
        <div className="grid gap-2">
          <Label htmlFor="edit-view-search">Search</Label>
          <Input
            id="edit-view-search"
            value={typeof filters.q === "string" ? filters.q : ""}
            maxLength={200}
            placeholder="Words in the title or channel"
            onChange={(event) => change({ q: event.target.value || undefined })}
          />
        </div>
        <ViralFilterRows idPrefix="edit-view" values={values} keywords={screen.keywords} onChange={change} />
      </>
    )
  }

  // ------------------------------------------------------------- Panels --

  const left = (
    <ProjectPanel
      screen={screen}
      activeKeyword={keywordFilter}
      busy={busy}
      onPickKeyword={(keyword) => setSearch({ keyword: keyword ?? undefined, creator: undefined })}
      onSearchAll={() => void searchAll()}
      onRefreshKeyword={(keyword) => void refreshKeyword(keyword)}
      onRemoveKeyword={setRemoving}
      onAddKeyword={addKeyword}
      onOpenSettings={() => setSettingsOpen(true)}
      creators={
        <CreatorsCard
          creators={creators}
          total={screen.creators.length}
          selectedKey={pickedCreator?.key ?? null}
          onPick={pickCreator}
          onWatchChange={project.sample ? undefined : (creator, watch) => void changeWatch(creator, watch)}
          search={creatorSearch}
          onSearch={setCreatorSearch}
          range={range}
          onRange={setRange}
          projectId={project.id}
          sample={project.sample}
          onAdded={refresh}
        />
      }
    />
  )

  // A pair like the tabs, list first, as Tyler drew it on 20 Oct 2026. The
  // tooltip hangs on a span around each tab rather than on the tab itself: as
  // the tab's own trigger it overwrote the tab's data-state and data-slot, so
  // the picked one was never raised (Tyler: "if its selected then it should
  // change color").
  const layoutToggle = (
    <Tabs value={layout} onValueChange={(next) => setLayout(next as typeof layout)} className="gap-0">
      <TabsList>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <TabsTrigger value="list" aria-label="List" className="px-2">
                <ListIcon className="size-4" />
              </TabsTrigger>
            </span>
          </TooltipTrigger>
          <TooltipContent>List</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <TabsTrigger value="grid" aria-label="Grid" className="px-2">
                <GridIcon className="size-4" />
              </TabsTrigger>
            </span>
          </TooltipTrigger>
          <TooltipContent>Grid</TooltipContent>
        </Tooltip>
      </TabsList>
    </Tabs>
  )

  // On the Downloaded and Broken down tabs every ticked video is saved, so
  // Delete is offered there. Download has nothing left to do on either, and
  // Break it down nothing on Broken down. A sample's videos are made up, so
  // nothing is saved or starred from one.
  const savedTab = !pickedCreator && (view === "downloaded" || view === "broken")
  const tickedSaved = tickedVideos.filter((video) => video.savedVideoId)
  const selectedMenu =
    selecting && tickedVideos.length ? (
      <SelectedMenu
        count={tickedVideos.length}
        busy={busy}
        onClear={() => setTicked(new Set())}
        pages={{}}
        main={(menu) => (
          <>
            {view === "broken" || project.sample ? null : (
              <SelectedMenuRow
                onClick={() => {
                  menu.close()
                  void saveMany(tickedVideos, true)
                }}
              >
                <SparklesIcon className="size-4 text-muted-foreground" />
                Break it down
              </SelectedMenuRow>
            )}
            {savedTab || project.sample ? null : (
              <SelectedMenuRow
                onClick={() => {
                  menu.close()
                  void saveMany(tickedVideos, false)
                }}
              >
                <DownloadIcon className="size-4 text-muted-foreground" />
                Download
              </SelectedMenuRow>
            )}
            {project.sample ? null : (
              <StarMenu
                videos={tickedVideos}
                favourites={favourites}
                sourceProjectId={project.id}
                onChanged={async () => {
                  menu.close()
                  setTicked(new Set())
                  await refresh()
                }}
                trigger={
                  <SelectedMenuRow onClick={() => undefined}>
                    <StarIcon className="size-4 text-muted-foreground" />
                    Star…
                  </SelectedMenuRow>
                }
              />
            )}
            <SelectedMenuRow
              onClick={() => {
                menu.close()
                void hideChannels(tickedVideos)
              }}
            >
              <EyeOffIcon className="size-4 text-muted-foreground" />
              Hide their channels
            </SelectedMenuRow>
            {savedTab && tickedSaved.length ? (
              <SelectedMenuRow
                onClick={() => {
                  menu.close()
                  setDeletingVideos(tickedSaved)
                }}
              >
                <Trash2Icon className="size-4 text-muted-foreground" />
                Delete
              </SelectedMenuRow>
            ) : null}
          </>
        )}
      />
    ) : null

  const filterCount = [search.from, search.fit, search.keyword].filter(Boolean).length

  const toolbar = (
    <div className="flex shrink-0 items-center gap-1">
      {selectedMenu}
      <SearchToggle
        name="viral-in-results"
        label="Search these videos"
        placeholder="Search titles and channels…"
        value={searchText}
        onChange={setSearchText}
      />
      <FilterPopover
        count={filterCount}
        open={filterOpen}
        onOpenChange={setFilterOpen}
        onClear={() => setSearch({ from: undefined, fit: undefined, keyword: undefined })}
        save={
          <Button type="button" onClick={saveAsView}>
            Save as view
          </Button>
        }
      >
        <ViralFilterRows
          idPrefix="viral-filter"
          values={currentView}
          keywords={screen.keywords}
          onChange={(patch) => setSearch({ ...patch, creator: undefined })}
        />
        {/* How the grid is drawn, not what it holds, so Clear and views leave it alone.
            It sits here rather than in the header, which it would push the tabs out of. */}
        {layout === "grid" ? (
          <FilterRow id="viral-filter-size" label="Card size">
            <Select value={size} onValueChange={(next) => setSize(next as ViralCardSize)}>
              <SelectTrigger id="viral-filter-size" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </FilterRow>
        ) : null}
      </FilterPopover>
      <SavedViewsControls
        here={viewsHere}
        views={views}
        filters={currentView as SavedViewValues}
        onOpen={openView}
        editFields={editViewFields}
        saveButton={false}
        buttonVariant="ghost"
      />
      {/* Hooks is one list of words, drawn the same in either layout. */}
      {view === "hooks" ? null : layoutToggle}
      {searching ? (
        <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Searching" />
      ) : null}
      {/* The screen's one primary button, last, filled and worded at every width
          (Tyler, 20 Oct 2026). A header too narrow for it slides the tabs sideways.
          It stands 8px off the list and grid pair, not the toolbar's 4px: two
          filled shapes 4px apart read as touching (Tyler, 29 Oct 2026). */}
      <DashboardToolbarButton type="button" className="ml-1" onClick={addLink}>
        <LinkIcon className="size-4" />
        Add a link
      </DashboardToolbarButton>
    </div>
  )

  const gridProps = {
    videos: middleVideos,
    selectedKey: pickedVideo?.key ?? null,
    onPick: pickVideo,
    ticked: selecting ? ticked : undefined,
    onTick: selecting ? toggleTick : undefined,
    favourites,
    onFavouritesChanged: refresh,
    projectId: project.id,
    // Each downloaded video carries its own Break it down button.
    cardAction:
      view === "downloaded" && !pickedCreator
        ? (video: ViralVideo) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void saveMany([video], true)}
            >
              <SparklesIcon />
              Break it down
            </Button>
          )
        : undefined,
  }

  const selectChip = <MassSelectChip on={selecting} onToggle={toggleSelecting} />

  const videoContent = (emptyText: string) =>
    middleVideos.length === 0 ? (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyText}</p>
    ) : view === "hooks" && !pickedCreator ? (
      <HookBoard videos={middleVideos} selectedKey={pickedVideo?.key ?? null} onOpen={openAtHook} />
    ) : layout === "grid" ? (
      <>
        {/* The grid has no heading row, so the chip has a row of its own. */}
        <div className="flex px-3 pt-3">{selectChip}</div>
        <VideoGrid size={size} {...gridProps} />
      </>
    ) : (
      <VideoList
        {...gridProps}
        selectChip={selectChip}
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
    )

  const brokenDownEmpty = brokenDownCount
    ? "No broken-down video matches these filters."
    : "Nothing broken down yet. Pick a video and press Break it down. It shows here once the AI has watched it."

  // A broken-down video with nothing said or shown in its hook has no line.
  const silentHooks = brokenDownCount - hookCount
  const hooksEmpty = hookCount
    ? "No hook matches these filters."
    : brokenDownCount
      ? `None of the ${brokenDownCount} broken-down ${plural(brokenDownCount, "video")} says or shows anything during its hook.`
      : "No hooks yet. Break videos down and the words of each one's opening show here."

  const downloadedEmpty = downloadedCount
    ? "No downloaded video matches these filters."
    : "Nothing downloaded without AI yet. Pick a video and press Download. It keeps the video in your media library and spends no AI."

  const videosEmpty = !screen.keywords.length
    ? "Add a keyword on the left, then press Search."
    : !hasSearched && !screen.videos.length
      ? searching
        ? "Searching. The videos arrive as each keyword finishes."
        : "Nothing searched yet. Press Search every keyword on the left."
      : screen.videos.length
        ? "No video matches these filters."
        : "The searches found nothing. Try other keywords or a longer window."

  // The grid's chip shows while the grid is pointed at, as a list's does
  // while its first heading is.
  const bodyClassName = cn("min-h-0 flex-1", layout === "grid" && "group/title")

  let middle: React.ReactNode
  if (pickedCreator) {
    middle = (
      <>
        <DashboardCardTitleHeader
          back={{ label: "Back to every video", onClick: () => setSearch({ creator: undefined, open: undefined }) }}
          title={pickedCreator.name}
          meta={
            pickedCreator.subscribers !== null
              ? `${formatCount(pickedCreator.subscribers)} subscribers`
              : pickedCreator.handle
                ? `@${pickedCreator.handle}`
                : undefined
          }
          action={
            <div className="flex items-center gap-1">
              {selectedMenu}
              {layoutToggle}
            </div>
          }
        />
        <ScrollArea className={bodyClassName}>
          {creatorUploads?.state === "loading" ? (
            <LoadingRow label="Reading their newest uploads…" />
          ) : creatorUploads?.state === "failed" ? (
            <div className="p-3">
              <ErrorRow message={creatorUploads.error} onRetry={() => retryUploads(pickedCreator)} />
            </div>
          ) : (
            videoContent(
              pickedCreator.followedId
                ? "Nothing saved from them yet. Their videos arrive when the watch timer next checks."
                : "They have no uploads to show."
            )
          )}
        </ScrollArea>
      </>
    )
  } else {
    middle = (
      <>
        <DashboardCardHeader className="@container">
          <DashboardTabs
            value={view}
            onValueChange={(next) => {
              setTicked(new Set())
              setSearch({ view: next === "videos" ? undefined : next })
            }}
            tabs={[
              { value: "videos", label: "Videos", count: projectVideos.length },
              { value: "downloaded", label: "Downloaded", count: downloadedCount },
              { value: "broken", label: "Broken down", count: brokenDownCount },
              { value: "hooks", label: "Hooks", count: hookCount },
            ]}
          />
          {toolbar}
        </DashboardCardHeader>
        <ScrollArea className={bodyClassName}>
          {videoContent(
            view === "broken"
              ? brokenDownEmpty
              : view === "downloaded"
                ? downloadedEmpty
                : view === "hooks"
                  ? hooksEmpty
                  : videosEmpty
          )}
          {view === "hooks" && hookCount && silentHooks > 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              {silentHooks} broken-down {plural(silentHooks, "video")} {silentHooks === 1 ? "is" : "are"} left out, because nothing is said or shown during {silentHooks === 1 ? "its" : "their"} hook.
            </p>
          ) : null}
        </ScrollArea>
      </>
    )
  }

  const right =
    pickedVideo || !pickedCreator ? (
      <PlayerPanel
        video={pickedVideo}
        emptyText="Click a video to play it and see its breakdown here."
        projectId={project.id}
        favourites={favourites}
        onFavouritesChanged={refresh}
        onHideChannel={(video) => void hideChannels([video])}
        onBack={pickedCreator ? () => setSearch({ open: undefined }) : undefined}
        onSavedChange={progress.report}
        onDeleted={(video) => afterDelete([video.key])}
        startAtMs={search.at}
      />
    ) : (
      <CreatorCard
        creator={pickedCreator}
        postsPerWeek={
          creatorUploads?.state === "ready"
            ? postsPerWeek(creatorUploads.videos.map((video) => video.postedAt))
            : null
        }
        busy={busy}
        onFollow={() => void follow(pickedCreator)}
        onUnfollow={() => void unfollow(pickedCreator)}
        onHide={() =>
          void hideChannels([
            {
              platform: pickedCreator.platform,
              channelId: pickedCreator.key.split(":").slice(1).join(":"),
              channelName: pickedCreator.name,
            },
          ])
        }
      />
    )

  return (
    <ThreePanels
      layoutKey={LAYOUT_KEY}
      place={{ key: PLACE_KEY, search, ids: middleVideos.map((video) => video.key) }}
      showMiddleFor={search.creator ?? ""}
      showRightFor={search.open}
      left={{ label: "Project", showLabel: "Show the project", content: left }}
      middle={{ label: "Videos", content: middle }}
      right={{
        label: pickedVideo || !pickedCreator ? "Video" : "Creator",
        showLabel: pickedVideo || !pickedCreator ? "Show the video" : "Show the creator",
        content: right,
      }}
    >
      <ViralProjectDialog
        open={settingsOpen}
        project={project}
        hidden={screen.hidden}
        folderId={project.folder_id}
        onClose={() => setSettingsOpen(false)}
        onCreated={() => undefined}
        onSaved={(_saved, searchChanged) => {
          void refresh()
          if (searchChanged && hasSearched && !project.sample) setOfferSearch(true)
        }}
      />

      <PasteLinkDialog
        open={pasting}
        projectId={project.id}
        onClose={() => setPasting(false)}
        onPasted={async (pasted) => {
          progress.report(pasted.key, { id: pasted.video.id, status: pasted.video.status })
          await refresh()
        }}
        onOpenVideo={(key) => setSearch({ open: key, at: undefined, creator: undefined })}
      />

      <SaveViewDialog
        open={savingView}
        here={viewsHere}
        filters={currentView as SavedViewValues}
        onClose={() => setSavingView(false)}
      />

      <DeleteSavedVideosDialog
        videos={deletingVideos.flatMap((video) =>
          video.savedVideoId ? [{ savedVideoId: video.savedVideoId, title: video.title }] : []
        )}
        onOpenChange={(open) => {
          if (!open) setDeletingVideos([])
        }}
        onDeleted={async (result) => {
          const deleted = new Set(result.deleted)
          const keys = deletingVideos
            .filter((video) => video.savedVideoId && deleted.has(video.savedVideoId))
            .map((video) => video.key)
          setDeletingVideos([])
          await afterDelete(keys)
          toast.success(
            `${keys.length} saved ${plural(keys.length, "video")} deleted.${
              result.filesKept
                ? ` ${result.filesKept} ${plural(result.filesKept, "file")} stayed in your media library, because a project still uses ${result.filesKept === 1 ? "it" : "them"}.`
                : ""
            }`
          )
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={`Remove “${removing?.keyword ?? ""}”?`}
        description={
          removing?.result_count
            ? `The ${countVideos(removing.result_count)} it found leave the grid, unless another keyword also found them. Starred videos stay starred.`
            : "It has found nothing yet, so nothing else changes."
        }
        confirmLabel="Remove keyword"
        loading={busy}
        onConfirm={confirmRemove}
      />

      <ConfirmDialog
        open={offerSearch}
        onOpenChange={setOfferSearch}
        title="Search again with the new settings?"
        description={`What YouTube is asked for changed, so the videos on screen still follow the old settings. Searching every keyword again uses ${searchAgainCost.toLocaleString()} units.`}
        confirmLabel="Search again"
        cancelLabel="Not now"
        destructive={false}
        loading={busy}
        onConfirm={async () => {
          setOfferSearch(false)
          await searchAll()
        }}
      />
    </ThreePanels>
  )
}

const ANY = "any"

/**
 * The Filter popover's rows, also Edit view's: the sort and its order, where
 * the videos come from, how well they fit, and the keyword that found them.
 * Each row is a label, then its Select.
 */
function ViralFilterRows({
  idPrefix,
  values,
  keywords,
  onChange,
}: {
  idPrefix: string
  values: ViralViewFilters
  keywords: ViralKeyword[]
  onChange: (patch: Record<string, string | number | undefined>) => void
}) {
  // A view's keyword that has since been removed still shows, so the row never reads blank.
  const keywordChoices = [
    ...keywords.map((keyword) => keyword.keyword),
    ...(values.keyword && !keywords.some((keyword) => keyword.keyword === values.keyword) ? [values.keyword] : []),
  ]
  return (
    <>
      <FilterRow id={`${idPrefix}-sort`} label="Sort by">
        <Select value={values.sort ?? "score"} onValueChange={(next) => onChange({ sort: next === "score" ? undefined : next })}>
          <SelectTrigger id={`${idPrefix}-sort`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIRAL_SORTS.map((one) => (
              <SelectItem key={one} value={one}>
                {viralSortLabels[one]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-direction`} label="Order">
        <Select
          value={values.direction ?? "desc"}
          onValueChange={(next) => onChange({ direction: next === "asc" ? "asc" : undefined })}
        >
          <SelectTrigger id={`${idPrefix}-direction`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Highest first</SelectItem>
            <SelectItem value="asc">Lowest first</SelectItem>
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-from`} label="From">
        <Select value={values.from ?? "both"} onValueChange={(next) => onChange({ from: next === "both" ? undefined : next })}>
          <SelectTrigger id={`${idPrefix}-from`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIRAL_SOURCES.map((one) => (
              <SelectItem key={one} value={one}>
                {viralSourceLabels[one]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-fit`} label="Fits the topic">
        <Select value={String(values.fit ?? 0)} onValueChange={(next) => onChange({ fit: next === "0" ? undefined : Number(next) })}>
          <SelectTrigger id={`${idPrefix}-fit`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIRAL_FIT_CHOICES.map((one) => (
              <SelectItem key={one} value={String(one)}>
                {one ? `${one} or more` : "Any fit"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-keyword`} label="Keyword">
        <Select value={values.keyword ?? ANY} onValueChange={(next) => onChange({ keyword: next === ANY ? undefined : next })}>
          <SelectTrigger id={`${idPrefix}-keyword`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Every keyword</SelectItem>
            {keywordChoices.map((keyword) => (
              <SelectItem key={keyword} value={keyword}>
                {keyword}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
    </>
  )
}

function FilterRow({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
      <Label htmlFor={id} className="text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}
