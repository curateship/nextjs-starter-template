import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import {
  EyeOffIcon,
  FilmIcon,
  GridIcon,
  ListIcon,
  Loader2Icon,
  PlusIcon,
  SparklesIcon,
  StarIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  DashboardCardHeader,
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AddCreatorDialog } from "@/components/video-viral/add-creator-dialog"
import { CreatorCard } from "@/components/video-viral/creator-card"
import { PlayerPanel } from "@/components/video-viral/player-panel"
import { ProjectPanel } from "@/components/video-viral/project-panel"
import { StarMenu, type Favourites } from "@/components/video-viral/star-menu"
import {
  CreatorList,
  VideoGrid,
  VideoList,
} from "@/components/video-viral/video-grid"
import { ViralPanels } from "@/components/video-viral/viral-panels"
import { ViralProjectDialog } from "@/components/video-viral/viral-project-dialog"
import { useSavedProgress } from "@/components/video-viral/use-saved-progress"
import { getViralErrorMessage } from "@/lib/api/video/viral"
import {
  addViralKeywordFn,
  followViralChannel,
  hideViralChannelsFn,
  loadChannelUploadsFn,
  refreshViralKeyword,
  removeViralKeywordFn,
  searchViralProject,
  unfollowViralCreator,
} from "@/lib/api/video/viral-projects"
import { saveVideos } from "@/lib/api/video/viral-videos"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"
import { useRememberedChoice } from "@/lib/remembered-choice"
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
  atAGlance,
  filterCreators,
  filterVideos,
  sortVideos,
  SUBSCRIBER_STEPS,
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

type ChannelUploads =
  | { state: "loading" }
  | { state: "ready"; videos: ViralVideo[] }
  | { state: "failed"; error: string }

/**
 * One Viral project's screen. Everything the address can hold lives there
 * (the view, the picked video or creator, the sort, the filters), so a reload
 * or a shared link opens the same thing. Nothing here calls YouTube except
 * the buttons that say what they cost.
 */
export function ViralProjectScreenView({
  screen,
  favourites,
}: {
  screen: ViralProjectScreen
  favourites: Favourites
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

  const [layout, setLayout] = useRememberedChoice(LAYOUT_STORAGE_KEY, "grid", VIRAL_LAYOUTS)
  const [size, setSize] = useRememberedChoice<ViralCardSize>(SIZE_STORAGE_KEY, "medium", VIRAL_CARD_SIZES)
  const [ticked, setTicked] = React.useState<Set<string>>(new Set())
  const [range, setRange] = React.useState<SubscriberRange>({ min: null, max: null })
  const [uploads, setUploads] = React.useState<Record<string, ChannelUploads>>({})
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [addingCreator, setAddingCreator] = React.useState(false)
  const [removing, setRemoving] = React.useState<ViralKeyword | null>(null)
  const [offerSearch, setOfferSearch] = React.useState(false)
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
    () => filterCreators(screen.creators, range, view === "creators" ? text : ""),
    [range, screen.creators, text, view]
  )
  const glance = atAGlance(projectVideos, screen.creators)

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
  // The Broken down tab is the Videos tab's list, with its filters, kept to
  // the videos whose breakdown has finished.
  const isBrokenDown = (video: ViralVideo) => video.savedStatus === "ready"
  const brokenDownCount = projectVideos.map(progress.apply).filter(isBrokenDown).length
  const middleVideos =
    view === "creators" && pickedCreator
      ? creatorUploads?.state === "ready"
        ? creatorUploads.videos.map(progress.apply)
        : []
      : view === "broken"
        ? shown.map(progress.apply).filter(isBrokenDown)
        : shown.map(progress.apply)

  // The picked video is looked for everywhere this screen has videos, so a
  // filter that hides it does not stop it playing.
  const found = search.video
    ? allVideos.find((video) => video.key === search.video)
    : undefined
  const pickedVideo = found ? progress.apply(found) : null

  // An address naming a video that is no longer in the results (a re-run
  // replaced it, or its channel was hidden) drops it rather than failing.
  const missingVideo = Boolean(search.video) && !pickedVideo && creatorUploads?.state !== "loading"
  React.useEffect(() => {
    if (missingVideo) setSearch({ video: undefined })
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
    setSearch({ creator: creator.key, video: undefined })
  }

  function retryUploads(creator: ViralCreator) {
    setUploads((was) => {
      const next = { ...was }
      delete next[creator.key]
      return next
    })
  }

  function pickVideo(video: ViralVideo) {
    setSearch({ video: video.key })
  }

  function toggleTick(key: string) {
    setTicked((was) => {
      const next = new Set(was)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
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
      setSearch({ video: undefined, creator: undefined })
      toast.success(
        unique.length === 1
          ? `${unique[0].channelName || "That channel"} is hidden from this project. Project settings can show it again.`
          : `${unique.length} channels are hidden from this project. Project settings can show them again.`
      )
    })
  }

  async function saveTicked() {
    await run(async () => {
      const saving = tickedVideos.filter((video) => !video.sample)
      const saved = await saveVideos(
        saving.map((video) => video.url),
        project.id
      )
      saved.forEach((detail, index) =>
        progress.report(saving[index].key, { id: detail.id, status: detail.status })
      )
      setTicked(new Set())
      await refresh()
      toast.success(`${saved.length} ${plural(saved.length, "video")} saved for breaking down. Each shows its progress on its card.`)
    })
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

  // ------------------------------------------------------------- Panels --

  const left = (
    <ProjectPanel
      screen={screen}
      glance={glance}
      activeKeyword={keywordFilter}
      busy={busy}
      onPickKeyword={(keyword) =>
        setSearch({ keyword: keyword ?? undefined, view: undefined, creator: undefined })
      }
      onSearchAll={() => void searchAll()}
      onRefreshKeyword={(keyword) => void refreshKeyword(keyword)}
      onRemoveKeyword={setRemoving}
      onAddKeyword={addKeyword}
      onOpenSettings={() => setSettingsOpen(true)}
    />
  )

  const viewTabs = (
    <Tabs
      value={view}
      onValueChange={(next) =>
        setSearch({ view: next === "videos" ? undefined : next, creator: undefined })
      }
    >
      <TabsList>
        <TabsTrigger value="videos">Videos {projectVideos.length}</TabsTrigger>
        <TabsTrigger value="broken">Broken down {brokenDownCount}</TabsTrigger>
        <TabsTrigger value="creators">Creators {screen.creators.length}</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const layoutToggle = (
    <div className="flex items-center gap-2">
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
  )

  const searchBox = (
    <DashboardToolbarSearch
      name="viral-in-results"
      aria-label={view === "creators" ? "Search creators" : "Search these videos"}
      placeholder={view === "creators" ? "Search creators…" : "Search titles and channels…"}
      value={searchText}
      onChange={(event) => setSearchText(event.target.value)}
    />
  )

  const videosToolbar = (
    <div className="flex flex-wrap items-center gap-2 border-b p-3">
      {searchBox}
      <Select value={sort} onValueChange={(next) => setSearch({ sort: next === "score" ? undefined : next, direction: undefined })}>
        <DashboardToolbarSelectTrigger aria-label="Sort by" className="min-w-36">
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          {VIRAL_SORTS.map((one) => (
            <SelectItem key={one} value={one}>
              Sort: {viralSortLabels[one]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={source} onValueChange={(next) => setSearch({ from: next === "both" ? undefined : next })}>
        <DashboardToolbarSelectTrigger aria-label="Where the videos come from" className="min-w-40">
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          {VIRAL_SOURCES.map((one) => (
            <SelectItem key={one} value={one}>
              From: {viralSourceLabels[one]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(fit)} onValueChange={(next) => setSearch({ fit: next === "0" ? undefined : Number(next) })}>
        <DashboardToolbarSelectTrigger aria-label="How well they fit the description" className="min-w-32">
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          {VIRAL_FIT_CHOICES.map((one) => (
            <SelectItem key={one} value={String(one)}>
              {one ? `Fits ${one} or more` : "Any fit"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {keywordFilter ? (
        <Button variant="secondary" size="sm" onClick={() => setSearch({ keyword: undefined })}>
          Keyword: {keywordFilter}
          <XIcon />
          <span className="sr-only">Show every keyword</span>
        </Button>
      ) : null}
    </div>
  )

  const creatorsToolbar = (
    <div className="flex flex-wrap items-center gap-2 border-b p-3">
      {searchBox}
      <SubscriberSelect
        label="Subscribers from"
        value={range.min}
        onChange={(min) => setRange((was) => ({ ...was, min }))}
      />
      <SubscriberSelect
        label="Subscribers up to"
        value={range.max}
        onChange={(max) => setRange((was) => ({ ...was, max }))}
      />
    </div>
  )

  const bulkBar = tickedVideos.length ? (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 p-3">
      <span className="text-sm">{tickedVideos.length} ticked</span>
      <DashboardToolbarButton type="button" variant="outline" disabled={busy || project.sample} onClick={() => void saveTicked()}>
        {busy ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
        Save &amp; break down
      </DashboardToolbarButton>
      {project.sample ? null : (
        <StarMenu
          videos={tickedVideos}
          favourites={favourites}
          sourceProjectId={project.id}
          onChanged={async () => {
            setTicked(new Set())
            await refresh()
          }}
          trigger={
            <DashboardToolbarButton type="button" variant="outline">
              <StarIcon className="size-4" />
              Star
            </DashboardToolbarButton>
          }
        />
      )}
      <DashboardToolbarButton type="button" variant="outline" disabled={busy} onClick={() => void hideChannels(tickedVideos)}>
        <EyeOffIcon className="size-4" />
        Hide their channels
      </DashboardToolbarButton>
      <DashboardToolbarButton type="button" variant="ghost" onClick={() => setTicked(new Set())}>
        Clear
      </DashboardToolbarButton>
    </div>
  ) : null

  const gridProps = {
    videos: middleVideos,
    selectedKey: pickedVideo?.key ?? null,
    onPick: pickVideo,
    ticked,
    onTick: toggleTick,
    favourites,
    onFavouritesChanged: refresh,
    projectId: project.id,
  }

  const videoContent = (emptyText: string) =>
    middleVideos.length === 0 ? (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyText}</p>
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
    )

  const brokenDownEmpty = brokenDownCount
    ? "No broken-down video matches these filters."
    : "Nothing broken down yet. Pick a video and press Save & break down. It shows here once the AI has watched it."

  const videosEmpty = !screen.keywords.length
    ? "Add a keyword on the left, then press Search."
    : !hasSearched && !screen.videos.length
      ? searching
        ? "Searching. The videos arrive as each keyword finishes."
        : "Nothing searched yet. Press Search every keyword on the left."
      : screen.videos.length
        ? "No video matches these filters."
        : "The searches found nothing. Try other keywords or a longer window."

  let middle: React.ReactNode
  if (view === "creators" && pickedCreator) {
    middle = (
      <>
        <DashboardCardTitleHeader
          icon={<FilmIcon />}
          back={{ label: "Back to every creator", onClick: () => setSearch({ creator: undefined, video: undefined }) }}
          title={pickedCreator.name}
          meta={
            pickedCreator.subscribers !== null
              ? `${formatCount(pickedCreator.subscribers)} subscribers`
              : pickedCreator.handle
                ? `@${pickedCreator.handle}`
                : undefined
          }
          action={layoutToggle}
        />
        {bulkBar}
        <ScrollArea className="min-h-0 flex-1">
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
  } else if (view === "creators") {
    middle = (
      <>
        <DashboardCardHeader>
          {viewTabs}
          <div className="ml-auto">
            <DashboardToolbarButton type="button" variant="outline" disabled={project.sample} onClick={() => setAddingCreator(true)}>
              <PlusIcon className="size-4" />
              Add a creator
            </DashboardToolbarButton>
          </div>
        </DashboardCardHeader>
        {creatorsToolbar}
        <ScrollArea className="min-h-0 flex-1">
          {creators.length ? (
            <CreatorList creators={creators} selectedKey={pickedCreator?.key ?? null} onPick={pickCreator} />
          ) : (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {screen.creators.length
                ? "No creator matches these filters."
                : "Creators show here once a search has found videos, or once you add one."}
            </p>
          )}
        </ScrollArea>
      </>
    )
  } else {
    middle = (
      <>
        <DashboardCardHeader>
          {viewTabs}
          <div className="ml-auto flex items-center gap-2">
            {searching ? <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Searching" /> : null}
            {layoutToggle}
          </div>
        </DashboardCardHeader>
        {videosToolbar}
        {bulkBar}
        <ScrollArea className="min-h-0 flex-1">
          {videoContent(view === "broken" ? brokenDownEmpty : videosEmpty)}
        </ScrollArea>
      </>
    )
  }

  const right =
    pickedVideo || !pickedCreator ? (
      <PlayerPanel
        video={pickedVideo}
        projectId={project.id}
        favourites={favourites}
        onFavouritesChanged={refresh}
        onHideChannel={(video) => void hideChannels([video])}
        onBack={pickedCreator ? () => setSearch({ video: undefined }) : undefined}
        onSavedChange={progress.report}
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
    <>
      <ViralPanels
        left={left}
        middle={middle}
        right={right}
        leftLabel="Show the project"
        rightLabel={pickedVideo ? "Show the video" : "Show the creator"}
        rightOpen={Boolean(pickedVideo || pickedCreator)}
        onCloseRight={() => setSearch(pickedVideo ? { video: undefined } : { creator: undefined })}
      />

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

      <AddCreatorDialog
        projectId={project.id}
        open={addingCreator}
        onOpenChange={setAddingCreator}
        onAdded={refresh}
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
    </>
  )
}

function SubscriberSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
}) {
  return (
    <Select value={value === null ? "any" : String(value)} onValueChange={(next) => onChange(next === "any" ? null : Number(next))}>
      <DashboardToolbarSelectTrigger aria-label={label} className="min-w-40">
        <SelectValue />
      </DashboardToolbarSelectTrigger>
      <SelectContent>
        <SelectItem value="any">{label}: any</SelectItem>
        {SUBSCRIBER_STEPS.map((step) => (
          <SelectItem key={step} value={String(step)}>
            {label}: {formatCount(step)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
