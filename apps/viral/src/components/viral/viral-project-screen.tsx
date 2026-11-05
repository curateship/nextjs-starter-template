import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  EyeOffIcon,
  GridIcon,
  LinkIcon,
  ListIcon,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react"
import { toast } from "sonner"

import { useOptionalShellRuntime } from "@/components/shell/shell-layout"
import { DEFAULT_DASHBOARD_TABS } from "@/lib/layout/styling-values"
import { cn } from "@/lib/utils"

import { DashboardCardHeader, DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { FilterPopover } from "@/components/shared/filter-popover"
import { FoldingMenu, MenuAction, MenuLine, MenuSection, useOpenSections } from "@/components/shared/folding-menu"
import { MassSelectChip, SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CreatorCard } from "@/components/viral/creator-card"
import { CreatorsCard } from "@/components/viral/creators-card"
import { DeleteSavedVideosDialog } from "@/components/viral/delete-saved-videos-dialog"
import { HookBoard } from "@/components/viral/hook-board"
import { KeywordsCard } from "@/components/viral/keywords-card"
import { PasteLinkDialog } from "@/components/viral/paste-link-dialog"
import { PlayerPanel } from "@/components/viral/player-panel"
import { ProjectProvider, type ProjectContextValue } from "@/components/viral/project-context"
import { ProjectDetailsPanel } from "@/components/viral/project-details-panel"
import { useKeyedAction } from "@/components/viral/use-keyed-action"
import { useSavedProgress } from "@/components/viral/use-saved-progress"
import { VaultItemPanel } from "@/components/viral/vault-item-panel"
import { VaultList } from "@/components/viral/vault-list"
import { VaultSelectedMenu } from "@/components/viral/vault-selected-menu"
import { VideoGrid, VideoList } from "@/components/viral/video-grid"
import type { SavedView } from "@/lib/api/saved-views"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import {
  addViralKeywordFn,
  followCreatorByLink,
  followViralChannel,
  hideViralChannelsFn,
  loadChannelUploadsFn,
  refreshViralKeyword,
  removeViralKeywordFn,
  searchViralProject,
  setViralCreatorWatch,
  unfollowViralCreator,
  unhideViralChannelFn,
} from "@/lib/api/viral/viral-projects"
import { loadVault, type VaultItem } from "@/lib/api/viral/viral-vault"
import { saveVideos } from "@/lib/api/viral/viral-videos"
import { plural } from "@/lib/format/plural"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { SAVED_VIEW_ERRORS, savedViewScreen, type SavedViewValues } from "@/lib/saved-views"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { creatorPlatformLabels, formatCount } from "@/lib/viral/creators"
import { SOCIAL_NAMES, socialHasKeywords, type Social } from "@/lib/viral/socials"
import {
  countVideos,
  isKeywordWorking,
  postsPerWeek,
  VIRAL_KEYWORD_MAX,
  type ViralCreator,
  type ViralKeyword,
  type ViralProjectScreen,
  type ViralVideo,
} from "@/lib/viral/viral"
import {
  describeViralView,
  VIRAL_SAVED_VIEW_KIND,
  viralViewFilters,
  type ViralViewFilters,
} from "@/lib/viral/viral-saved-views"
import {
  filterCreators,
  filterVideos,
  sortVideos,
  VIRAL_CARD_SIZES,
  VIRAL_FIT_CHOICES,
  VIRAL_LAYOUTS,
  VIRAL_SORTS,
  VIRAL_SOURCES,
  viralSortLabels,
  viralSourceLabels,
  type SubscriberRange,
  type ViralCardSize,
  type ViralSort,
  type ViralSource,
} from "@/lib/viral/viral-view"

const projectRoute = getRouteApi("/_authenticated/admin/projects_/$projectId")

/** While a keyword is searching, the screen reads the project again this often. */
const SEARCHING_POLL_MS = 3000

const LAYOUT_STORAGE_KEY = "viral-layout"
const SIZE_STORAGE_KEY = "viral-card-size"

/**
 * Where this browser keeps the panels' widths, and where the page was. App
 * keys, so they live here rather than in the shell's `panelLayoutKey`. The
 * number is bumped whenever the default widths move.
 */
const LAYOUT_KEY = "viral-project-horizontal-1"
const placeKey = (projectId: string) => `viral-project-place-${projectId}`

type ChannelUploads =
  | { state: "loading" }
  | { state: "ready"; videos: ViralVideo[] }
  | { state: "failed"; error: string }

type ProjectVault = { state: "loading" } | { state: "ready"; items: VaultItem[]; tags: string[] } | { state: "failed"; error: string }

/**
 * One project's page, drawn as Travel's trip page (Tyler, 4 Nov 2026): the
 * project, its socials, keywords and creators on the left, what they found
 * in the middle, the open video on the right. The Vault row on the left turns
 * the middle into the project's saved ideas and the right into the open one.
 * Everything the address can hold lives there (the tab, the open video, the
 * picked social and creator, the sort, the filters), so a reload or a shared
 * link opens the same thing. Nothing here calls YouTube except the buttons
 * that say what they cost.
 */
export function ViralProjectScreenView({ screen, views }: { screen: ViralProjectScreen; views: SavedView[] }) {
  const router = useRouter()
  const search = projectRoute.useSearch()
  const setSearch = useListSearchNavigate()
  const { project } = screen
  const view = search.view ?? "videos"
  const vaultView = view === "vault"
  const social: Social | null = search.social && project.socials.includes(search.social) ? search.social : null
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
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [savingView, setSavingView] = React.useState(false)
  const [removing, setRemoving] = React.useState<ViralKeyword | null>(null)
  const [deletingVideos, setDeletingVideos] = React.useState<ViralVideo[]>([])
  const [pasting, setPasting] = React.useState(false)
  const [vault, setVault] = React.useState<ProjectVault>({ state: "loading" })
  // A switch flipped here shows at once, before the screen reads itself again.
  const [watchOverride, setWatchOverride] = React.useState<Record<string, boolean>>({})
  const { run, isBusy } = useKeyedAction(getViralErrorMessage)
  // Typing stays instant; the address catches up a moment later.
  const [searchText, setSearchText] = useSearchBoxText(text, (next) => setSearch({ q: next.trim() ? next : undefined }))

  const refresh = React.useCallback(() => router.invalidate(), [router])

  // The project's vault is read when it is opened, and again when it changes.
  const readVault = React.useCallback(async () => {
    try {
      const answer = await loadVault(project.id)
      setVault({ state: "ready", items: answer.items, tags: answer.tags })
    } catch (error) {
      setVault({ state: "failed", error: getViralErrorMessage(error) })
    }
  }, [project.id])
  React.useEffect(() => {
    if (!vaultView) return
    let live = true
    loadVault(project.id)
      .then((answer) => {
        if (live) setVault({ state: "ready", items: answer.items, tags: answer.tags })
      })
      .catch((error) => {
        if (live) setVault({ state: "failed", error: getViralErrorMessage(error) })
      })
    return () => {
      live = false
    }
  }, [project.id, vaultView])

  const afterVaultChange = React.useCallback(async () => {
    await refresh()
    if (vaultView) await readVault()
  }, [readVault, refresh, vaultView])

  // Every video this screen knows of, so a card keeps saying it is being
  // saved and broken down while somebody looks at other videos.
  const allVideos = React.useMemo(
    () => [...screen.videos, ...Object.values(uploads).flatMap((one) => (one.state === "ready" ? one.videos : []))],
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

  // A picked social keeps the middle panel to what that social found.
  const socialVideos = React.useMemo(
    () => (social ? screen.videos.filter((video) => video.platform === social) : screen.videos),
    [screen.videos, social]
  )

  // The project's own filters first, then the ones in the address.
  const shown = React.useMemo(
    () =>
      sortVideos(
        filterVideos(socialVideos, {
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
    [direction, fit, keywordFilter, project.min_score, project.min_views, socialVideos, sort, source, text]
  )
  const projectVideos = React.useMemo(
    () =>
      filterVideos(socialVideos, {
        minViews: project.min_views,
        minScore: project.min_score,
        source: "both",
        keyword: null,
        text: "",
        minFit: 0,
      }),
    [project.min_score, project.min_views, socialVideos]
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
      ? { state: "ready", videos: screen.videos.filter((video) => video.channelId === pickedCreator.channelId) }
      : (uploads[pickedCreator.key] ?? { state: "loading" })
    : undefined
  // The Downloaded, Analysed and Hooks tabs are the Videos tab's list, with
  // its filters, kept to the videos downloaded with no AI yet, to the videos
  // with an analysis written, and to those with words in their hook.
  const isDownloaded = (video: ViralVideo) => video.savedStatus === "downloaded"
  const isAnalysed = (video: ViralVideo) => video.analysed
  const hasHook = (video: ViralVideo) => video.hook !== null
  const appliedProjectVideos = projectVideos.map(progress.apply)
  const downloadedCount = appliedProjectVideos.filter(isDownloaded).length
  const analysedCount = projectVideos.filter(isAnalysed).length
  const hookCount = projectVideos.filter(hasHook).length
  const middleVideos = pickedCreator
    ? creatorUploads?.state === "ready"
      ? creatorUploads.videos.map(progress.apply)
      : []
    : view === "analysed"
      ? shown.map(progress.apply).filter(isAnalysed)
      : view === "downloaded"
        ? shown.map(progress.apply).filter(isDownloaded)
        : view === "hooks"
          ? shown.map(progress.apply).filter(hasHook)
          : shown.map(progress.apply)

  const vaultItems = vault.state === "ready" ? vault.items : []
  const openItem = vaultView ? (vaultItems.find((item) => item.id === search.open) ?? null) : null

  // The open video is looked for everywhere this screen has videos, so a
  // filter that hides it does not stop it playing.
  const found = !vaultView && search.open ? allVideos.find((video) => video.key === search.open) : undefined
  const pickedVideo = found ? progress.apply(found) : null

  // An address naming a video that is no longer in the results (a re-run
  // replaced it, or its channel was hidden) drops it rather than failing.
  const missingVideo = !vaultView && Boolean(search.open) && !pickedVideo && creatorUploads?.state !== "loading"
  const missingItem = vaultView && vault.state === "ready" && Boolean(search.open) && !openItem
  React.useEffect(() => {
    if (missingVideo || missingItem) setSearch({ open: undefined })
  }, [missingItem, missingVideo, setSearch])

  // Opening the vault opens its first idea, so the right panel is never empty
  // (UI standard: "the right panel ... is never emptied by hand").
  const firstItemId = vaultView && vault.state === "ready" && !search.open ? (vault.items[0]?.id ?? null) : null
  React.useEffect(() => {
    if (firstItemId) setSearch({ open: firstItemId })
  }, [firstItemId, setSearch])

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
        setUploads((was) => ({ ...was, [creator.key]: { state: "failed", error: getViralErrorMessage(error) } }))
      )
      .finally(() => asking.current.delete(creator.key))
  }, [project.id, wanted])

  function pickCreator(creator: ViralCreator) {
    setSearch({ creator: creator.key, open: undefined, view: undefined })
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
  const tickedVaultIds = vaultView ? vaultItems.filter((item) => ticked.has(item.id)).map((item) => item.id) : []

  async function searchAll() {
    await run("search-all", async () => {
      const { queued, units } = await searchViralProject(project.id)
      await refresh()
      toast.success(
        `Searching ${queued} ${plural(queued, "keyword")} using ${units.toLocaleString()} units of your daily YouTube allowance. Keep browsing; the videos arrive as each one finishes.`
      )
    })
  }

  async function refreshKeyword(keyword: ViralKeyword) {
    await run(`keyword:${keyword.id}`, async () => {
      const { units } = await refreshViralKeyword(keyword.id)
      await refresh()
      toast.success(`Searching "${keyword.keyword}" again, using ${units} units of your daily YouTube allowance.`)
    })
  }

  async function addKeyword(value: string) {
    let added = false
    await run("add-keyword", async () => {
      const { searchError } = await addViralKeywordFn(project.id, value)
      added = true
      await refresh()
      if (searchError) toast.message(`Added "${value.trim()}". ${searchError}`)
      else if (!project.sample) toast.success(`Added "${value.trim()}" and searching it.`)
    })
    return added
  }

  async function followLink(link: string) {
    let added = false
    await run("follow-link", async () => {
      const followed = await followCreatorByLink(project.id, link)
      added = true
      await refresh()
      toast.success(`Following them on ${creatorPlatformLabels[followed.platform as keyof typeof creatorPlatformLabels] ?? "that social"}. Their newest posts arrive in this project.`)
    })
    return added
  }

  async function confirmRemove() {
    const keyword = removing
    if (!keyword) return
    await run(`keyword:${keyword.id}`, async () => {
      await removeViralKeywordFn(keyword.id)
      setRemoving(null)
      await refresh()
      if (keywordFilter === keyword.keyword) setSearch({ keyword: undefined })
      toast.success(`Removed "${keyword.keyword}".`)
    })
  }

  async function hideChannels(
    videos: { platform: ViralVideo["platform"]; channelId: string; channelName: string }[],
    key = "hide"
  ) {
    const unique = [...new Map(videos.map((one) => [`${one.platform}:${one.channelId}`, one])).values()]
    await run(key, async () => {
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
          ? `${unique[0].channelName || "That channel"} is hidden from this project. The ⋮ beside the tabs shows it again.`
          : `${unique.length} channels are hidden from this project. The ⋮ beside the tabs shows them again.`
      )
    })
  }

  async function showChannel(channel: ViralProjectScreen["hidden"][number]) {
    await run(`unhide:${channel.platform}:${channel.channelId}`, async () => {
      await unhideViralChannelFn(project.id, channel)
      await refresh()
      toast.success(`${channel.channelName || "That channel"} shows again.`)
    })
  }

  /** Download (no AI) or Analyse's first step, for some videos in one request. */
  async function saveMany(videos: ViralVideo[], analyse: boolean) {
    await run(videos.length === 1 ? `save:${videos[0].key}` : "save-many", async () => {
      const saving = videos.filter((video) => !video.sample)
      const saved = await saveVideos(
        saving.map((video) => video.url),
        project.id,
        analyse
      )
      saved.forEach((detail, index) => progress.report(saving[index].key, { id: detail.id, status: detail.status }))
      setTicked(new Set())
      await refresh()
      const count = `${saved.length} ${plural(saved.length, "video")}`
      toast.success(
        analyse
          ? `Breaking down ${count}. Each shows its progress on its row; open one and press Analyse with AI once it's ready.`
          : `Downloading ${count}. No AI runs. ${saved.length === 1 ? "It shows" : "They show"} on the Downloaded tab once ${saved.length === 1 ? "it is" : "they are"} in.`
      )
    })
  }

  async function changeWatch(creator: ViralCreator, watch: boolean) {
    const creatorId = creator.followedId
    if (!creatorId) return
    setWatchOverride((was) => ({ ...was, [creatorId]: watch }))
    await run(`watch:${creatorId}`, async () => {
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
    await run(`creator:${creator.key}`, async () => {
      await followViralChannel(project.id, creator.channelId as string)
      await refresh()
      toast.success(`Following ${creator.name} in this project.`)
    })
  }

  async function unfollow(creator: ViralCreator) {
    if (!creator.followedId) return
    await run(`creator:${creator.key}`, async () => {
      await unfollowViralCreator(project.id, creator.followedId as string)
      await refresh()
      toast.success(`Unfollowed ${creator.name} in this project.`)
    })
  }

  const hasSearched = screen.keywords.some((keyword) => keyword.ran_at)
  const hasYoutube = project.socials.some(socialHasKeywords)

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
      return (Object.values(SAVED_VIEW_ERRORS) as string[]).includes(message) ? message : getViralErrorMessage(error)
    },
  }

  /** Opens a view: its filters replace the ones set, and a removed keyword is said and left out. */
  function openView(saved: SavedView) {
    const filters = viralViewFilters(saved.filters)
    if (filters.keyword && !screen.keywords.some((keyword) => keyword.keyword === filters.keyword)) {
      showErrorToast(`The keyword "${filters.keyword}" was removed, so "${saved.name}" opened without it.`)
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
        <SortRows idPrefix="edit-view" values={values} onChange={change} />
        <ViralFilterRows idPrefix="edit-view" values={values} keywords={screen.keywords} onChange={change} />
      </>
    )
  }

  // ------------------------------------------------------------- Panels --

  const creatorCards = project.socials.map((one) => (
    <CreatorsCard
      key={one}
      title={`${SOCIAL_NAMES[one]} creators`}
      storageId={`viral-project-creators-${one}`}
      placeholder={one === "tiktok" ? "https://www.tiktok.com/@creator" : "https://www.youtube.com/@creator"}
      creators={creators.filter((creator) => creator.platform === one)}
      total={screen.creators.filter((creator) => creator.platform === one).length}
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
  ))

  const left = (
    <ProjectDetailsPanel
      activeSocial={social}
      onPickSocial={(next) => setSearch({ social: next ?? undefined, creator: undefined, open: undefined })}
      vaultOpen={vaultView}
      onOpenVault={() => {
        setTicked(new Set())
        setSearch({ view: vaultView ? undefined : "vault", open: undefined, creator: undefined })
      }}
    >
      {hasYoutube && (!social || socialHasKeywords(social)) ? (
        <KeywordsCard
          project={project}
          keywords={screen.keywords}
          activeKeyword={keywordFilter}
          isBusy={isBusy}
          onPickKeyword={(keyword) => setSearch({ keyword: keyword ?? undefined, creator: undefined })}
          onSearchAll={() => void searchAll()}
          onRefreshKeyword={(keyword) => void refreshKeyword(keyword)}
          onRemoveKeyword={setRemoving}
          onAddKeyword={addKeyword}
        />
      ) : null}
      {creatorCards.filter((_, index) => !social || project.socials[index] === social)}
    </ProjectDetailsPanel>
  )

  // A pair like the tabs, list first, as Tyler drew it on 20 Oct 2026.
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

  // On the Downloaded and Analysed tabs every ticked video is saved, so Delete
  // is offered there. A sample's videos are made up, so nothing is saved from one.
  const savedTab = !pickedCreator && (view === "downloaded" || view === "analysed")
  const tickedSaved = tickedVideos.filter((video) => video.savedVideoId)
  const selectedMenu =
    selecting && tickedVideos.length ? (
      <SelectedMenu
        count={tickedVideos.length}
        busy={isBusy("save-many") || isBusy("hide")}
        onClear={() => setTicked(new Set())}
        pages={{}}
        main={(menu) => (
          <>
            {view === "analysed" || project.sample ? null : (
              <SelectedMenuRow
                onClick={() => {
                  menu.close()
                  void saveMany(tickedVideos, true)
                }}
              >
                <SparklesIcon className="size-4 text-muted-foreground" />
                Break them down
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

  // In the toolbar after "N selected", as Travel's trip page has it (UI
  // standard, "Three-panel guide"). Hooks is a list of words nobody ticks.
  const selectChip = <MassSelectChip on={selecting} onToggle={toggleSelecting} />

  const toolbar = (
    <div className="flex shrink-0 items-center gap-1">
      {selectedMenu}
      {view === "hooks" ? null : selectChip}
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
        <SortRows idPrefix="viral-filter" values={currentView} onChange={(patch) => setSearch(patch)} />
        <ViralFilterRows
          idPrefix="viral-filter"
          values={currentView}
          keywords={screen.keywords}
          onChange={(patch) => setSearch({ ...patch, creator: undefined })}
        />
        {/* How the videos are drawn, not what they hold, so Clear and views leave it alone. It sits here
            rather than in the header so the four tabs and their ⋮ fit beside the toolbar (Tyler, 4 Nov 2026:
            "middle header alignment is wrong"). Hooks is one list of words, drawn the same either way. */}
        {view === "hooks" ? null : (
          <FilterRow id="viral-filter-layout" label="Show as">
            <Select value={layout} onValueChange={(next) => setLayout(next as typeof layout)}>
              <SelectTrigger id="viral-filter-layout" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="list">List</SelectItem>
                <SelectItem value="grid">Grid</SelectItem>
              </SelectContent>
            </Select>
          </FilterRow>
        )}
        {layout === "grid" && view !== "hooks" ? (
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
      <AddMenu
        canSearch={hasYoutube}
        sample={project.sample}
        busy={isBusy("add-keyword") || isBusy("follow-link")}
        onAddKeyword={addKeyword}
        onFollow={followLink}
        onPaste={addLink}
      />
    </div>
  )

  const gridProps = {
    videos: middleVideos,
    selectedKey: pickedVideo?.key ?? null,
    onPick: pickVideo,
    ticked: selecting ? ticked : undefined,
    onTick: selecting ? toggleTick : undefined,
  }

  const videoContent = (emptyText: string) =>
    middleVideos.length === 0 ? (
      <p className="px-3 py-10 text-center text-sm text-muted-foreground">{emptyText}</p>
    ) : view === "hooks" && !pickedCreator ? (
      <HookBoard videos={middleVideos} selectedKey={pickedVideo?.key ?? null} onOpen={openAtHook} />
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

  const analysedEmpty = analysedCount
    ? "No analysed video matches these filters."
    : "Nothing analysed yet. Open a video and press Analyse with AI. It shows here once the script is written."

  // An analysed video with nothing said or shown in its hook has no line.
  const hooksEmpty = hookCount
    ? "No hook matches these filters."
    : "No hooks yet. Analyse videos and the words of each one's opening show here."

  const downloadedEmpty = downloadedCount
    ? "No downloaded video matches these filters."
    : "Nothing downloaded without AI yet. Open a video and pick Download in its ⋮."

  const videosEmpty =
    social && !socialHasKeywords(social)
      ? `Nothing from ${SOCIAL_NAMES[social]} yet. Follow a creator with + Add; their newest posts arrive here.`
      : !screen.keywords.length && !screen.creators.length
        ? hasYoutube
          ? "Add a keyword or follow a creator with + Add."
          : "Follow a creator with + Add."
        : !hasSearched && !screen.videos.length
          ? searching
            ? "Searching. The videos arrive as each keyword finishes."
            : "Nothing searched yet. Press Search all on the left."
          : screen.videos.length
            ? "No video matches these filters."
            : "The searches found nothing. Try other keywords or a longer window."

  const bodyClassName = "min-h-0 flex-1"

  let middle: React.ReactNode
  if (vaultView) {
    middle = (
      <>
        <DashboardCardTitleHeader
          className="group/title"
          back={{
            label: "Back to the videos",
            onClick: () => {
              setTicked(new Set())
              setSearch({ view: undefined, open: undefined })
            },
          }}
          title="Vault"
          meta={vault.state === "ready" ? `${vault.items.length} ${plural(vault.items.length, "idea")}` : undefined}
          action={
            vault.state === "ready" && vault.items.length ? (
              <div className="flex items-center gap-1">
                {tickedVaultIds.length ? (
                  <VaultSelectedMenu
                    ids={tickedVaultIds}
                    tags={vault.tags}
                    onClear={() => setTicked(new Set())}
                    onDone={async (change) => {
                      if (change.kind === "delete") {
                        setTicked(new Set())
                        if (search.open && tickedVaultIds.includes(search.open)) setSearch({ open: undefined })
                      }
                      await afterVaultChange()
                    }}
                  />
                ) : null}
                {selectChip}
              </div>
            ) : undefined
          }
        />
        <ScrollArea className="min-h-0 flex-1">
          {vault.state === "loading" ? (
            <LoadingRow label="Opening the vault" />
          ) : vault.state === "failed" ? (
            <div className="p-3">
              <ErrorRow message={vault.error} onRetry={() => void readVault()} />
            </div>
          ) : vault.items.length ? (
            <VaultList
              items={vault.items}
              selectedId={openItem?.id ?? null}
              onPick={(item) => setSearch({ open: item.id })}
              ticked={selecting ? ticked : undefined}
              onTick={selecting ? toggleTick : undefined}
            />
          ) : (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              Nothing in this project's vault yet. Open a video and press Save to vault.
            </p>
          )}
        </ScrollArea>
      </>
    )
  } else if (pickedCreator) {
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
                : creatorPlatformLabels[pickedCreator.platform]
          }
          action={
            <div className="flex items-center gap-1">
              {selectedMenu}
              {selectChip}
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
        {/* group/title: the Mass select chip shows while this header is pointed at. */}
        <DashboardCardHeader className="group/title @container">
          <DashboardTabs
              value={view}
              onValueChange={(next) => {
                setTicked(new Set())
                setSearch({ view: next === "videos" ? undefined : (next as typeof view) })
              }}
              tabs={[
                // The search's spinner rides on the tab its videos land in, so
                // the toolbar never grows and shrinks around + Add.
                {
                  value: "videos",
                  label: searching ? (
                    <>
                      Videos
                      <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
                    </>
                  ) : (
                    "Videos"
                  ),
                  count: projectVideos.length,
                  ariaLabel: searching ? `Videos, ${projectVideos.length}, still searching` : undefined,
                },
                { value: "downloaded", label: "Downloaded", count: downloadedCount },
                { value: "analysed", label: "Analysed", count: analysedCount },
                { value: "hooks", label: "Hooks", count: hookCount },
              ]}
              after={<TabsMenu hidden={screen.hidden} isBusy={isBusy} onShow={(channel) => void showChannel(channel)} />}
            />
          {toolbar}
        </DashboardCardHeader>
        <ScrollArea className={bodyClassName}>
          {videoContent(
            view === "analysed"
              ? analysedEmpty
              : view === "downloaded"
                ? downloadedEmpty
                : view === "hooks"
                  ? hooksEmpty
                  : videosEmpty
          )}
        </ScrollArea>
      </>
    )
  }

  let right: React.ReactNode
  if (vaultView) {
    right = openItem ? (
      <VaultItemPanel
        key={openItem.id}
        item={openItem}
        tags={vault.state === "ready" ? vault.tags : []}
        onChanged={(item) =>
          setVault((was) =>
            was.state === "ready" ? { ...was, items: was.items.map((one) => (one.id === item.id ? item : one)) } : was
          )
        }
        onDeleted={async () => {
          setSearch({ open: undefined })
          await afterVaultChange()
        }}
      />
    ) : (
      <>
        <DashboardCardTitleHeader icon={<EyeIcon />} title="Idea" />
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">Click an idea to play it and read its script here.</p>
      </>
    )
  } else if (pickedVideo || !pickedCreator) {
    right = (
      <PlayerPanel
        video={pickedVideo}
        emptyText="Click a video to play it and analyse it here."
        projectId={project.id}
        projectTopic={project.topic}
        onVaultChanged={afterVaultChange}
        onHideChannel={(video) => void hideChannels([video])}
        onBack={pickedCreator ? () => setSearch({ open: undefined }) : undefined}
        onSavedChange={progress.report}
        onDeleted={(video) => afterDelete([video.key])}
        startAtMs={search.at}
      />
    )
  } else {
    right = (
      <CreatorCard
        creator={pickedCreator}
        postsPerWeek={
          creatorUploads?.state === "ready" ? postsPerWeek(creatorUploads.videos.map((video) => video.postedAt)) : null
        }
        busy={isBusy(`creator:${pickedCreator.key}`)}
        hiding={isBusy(`hide:${pickedCreator.key}`)}
        onFollow={() => void follow(pickedCreator)}
        onUnfollow={() => void unfollow(pickedCreator)}
        onHide={() =>
          void hideChannels(
            [
              {
                platform: pickedCreator.platform,
                channelId: pickedCreator.key.split(":").slice(1).join(":"),
                channelName: pickedCreator.name,
              },
            ],
            `hide:${pickedCreator.key}`
          )
        }
      />
    )
  }

  const context = React.useMemo<ProjectContextValue>(() => ({ screen, refresh }), [refresh, screen])
  const rightIsVideo = !vaultView && (pickedVideo || !pickedCreator)

  return (
    <ProjectProvider value={context}>
      <ThreePanels
        layoutKey={LAYOUT_KEY}
        place={{
          key: placeKey(project.id),
          search,
          ids: vaultView ? vaultItems.map((item) => item.id) : middleVideos.map((video) => video.key),
          ready: vaultView ? vault.state !== "loading" : undefined,
        }}
        showMiddleFor={`${search.creator ?? ""}${vaultView ? "vault" : ""}${social ?? ""}`}
        showRightFor={search.open}
        left={{ label: "Project", showLabel: "Show the project", content: left }}
        middle={{ label: vaultView ? "Vault" : "Videos", content: middle }}
        right={{
          label: vaultView ? "Idea" : rightIsVideo ? "Video" : "Creator",
          showLabel: vaultView ? "Show the idea" : rightIsVideo ? "Show the video" : "Show the creator",
          content: right,
        }}
      >
        <PasteLinkDialog
          open={pasting}
          projectId={project.id}
          onClose={() => setPasting(false)}
          onPasted={async (pasted) => {
            progress.report(pasted.key, { id: pasted.video.id, status: pasted.video.status })
            await refresh()
          }}
          onOpenVideo={(key) => setSearch({ open: key, at: undefined, creator: undefined, view: undefined })}
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
                  ? ` ${result.filesKept} ${plural(result.filesKept, "file")} stayed, because the vault keeps ${result.filesKept === 1 ? "it" : "them"}.`
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
          title={`Remove "${removing?.keyword ?? ""}"?`}
          description={
            removing?.result_count
              ? `The ${countVideos(removing.result_count)} it found leave the list, unless another keyword also found them. Ideas in the vault stay.`
              : "It has found nothing yet, so nothing else changes."
          }
          confirmLabel="Remove keyword"
          loading={removing ? isBusy(`keyword:${removing.id}`) : false}
          onConfirm={confirmRemove}
        />
      </ThreePanels>
    </ProjectProvider>
  )
}

/**
 * "+ Add", the middle panel's one primary button, Travel's Add menu drawn for
 * a project (Tyler, 4 Nov 2026): Add a keyword and Follow a creator turn the
 * same dropdown into a small form with the cursor in it; Paste a link opens
 * its window. Add a keyword only shows while YouTube is on the project,
 * because only YouTube is searched by keyword.
 */
function AddMenu({
  canSearch,
  sample,
  busy,
  onAddKeyword,
  onFollow,
  onPaste,
}: {
  canSearch: boolean
  sample: boolean
  busy: boolean
  onAddKeyword: (keyword: string) => Promise<boolean>
  onFollow: (link: string) => Promise<boolean>
  onPaste: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<"keyword" | "creator" | null>(null)
  const [text, setText] = React.useState("")

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setForm(null)
  }

  async function submit() {
    if (!text.trim()) {
      showErrorToast(form === "keyword" ? "Type a keyword first." : "Paste a profile link first.")
      return
    }
    if (sample && form === "creator") {
      showErrorToast("A sample project follows nobody. Make your own project to follow creators.")
      return
    }
    dismissErrorToast()
    const done = form === "keyword" ? await onAddKeyword(text) : await onFollow(text)
    if (done) {
      setText("")
      setOpen(false)
      setForm(null)
    }
  }

  return (
    <FoldingMenu
      label="Add"
      fit={form === null}
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <Button type="button" className="ml-1 @max-3xl:size-8 @max-3xl:px-0" aria-label="Add">
          <PlusIcon className="size-4" />
          <span className="@max-3xl:hidden">Add</span>
        </Button>
      }
    >
      {form ? (
        <form
          className="grid gap-3 p-1"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Back" onClick={() => setForm(null)}>
              <ArrowLeftIcon />
            </Button>
            <span className="text-sm font-medium">{form === "keyword" ? "Add a YouTube keyword" : "Follow a creator"}</span>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="viral-add-field" className="sr-only">
              {form === "keyword" ? "Keyword" : "Profile link"}
            </Label>
            <Input
              id="viral-add-field"
              autoFocus
              value={text}
              maxLength={form === "keyword" ? VIRAL_KEYWORD_MAX : 2048}
              placeholder={form === "keyword" ? "high protein lunch" : "https://www.tiktok.com/@creator"}
              onChange={(event) => setText(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {form === "keyword"
                ? "It's searched straight away, using YouTube's free daily allowance."
                : "A YouTube or TikTok profile link. Their newest posts arrive in this project."}
            </p>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              {form === "keyword" ? "Add keyword" : "Follow"}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {canSearch ? (
            <MenuAction icon={<SearchIcon className="size-4" />} onClick={() => setForm("keyword")}>
              Add a keyword
            </MenuAction>
          ) : null}
          <MenuAction icon={<UserPlusIcon className="size-4" />} onClick={() => setForm("creator")}>
            Follow a creator
          </MenuAction>
          <MenuAction
            icon={<LinkIcon className="size-4" />}
            onClick={() => {
              setOpen(false)
              onPaste()
            }}
          >
            Paste a link
          </MenuAction>
        </>
      )}
    </FoldingMenu>
  )
}

/**
 * The ⋮ after the tabs, for what is rarely needed (Travel's Bin sits there):
 * the channels hidden from this project, each with Show again.
 */
function TabsMenu({
  hidden,
  isBusy,
  onShow,
}: {
  hidden: ViralProjectScreen["hidden"]
  isBusy: (key: string) => boolean
  onShow: (channel: ViralProjectScreen["hidden"][number]) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [shown, toggle] = useOpenSections<"hidden">()
  const runtime = useOptionalShellRuntime()
  const pills = (runtime?.config.styling.dashboardTabs ?? DEFAULT_DASHBOARD_TABS) === "pills"
  return (
    // Level with the tab names, as Travel's ScheduleMenu: underlined tabs carry a 2px see-through line under
    // each, so the ⋮ gets the same line; pills are 28px, so the ⋮ is 28px.
    <div className={cn("flex items-center", !pills && "border-b-2 border-transparent")}>
    <FoldingMenu
      label="More for these videos"
      align="start"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button type="button" variant="ghost" size={pills ? "icon-sm" : "icon"} aria-label="More for these videos">
          <EllipsisVerticalIcon className="size-4" />
        </Button>
      }
    >
      <MenuSection
        label="Hidden channels"
        value={hidden.length ? String(hidden.length) : "None"}
        open={shown.has("hidden")}
        onToggle={() => toggle("hidden")}
      >
        {hidden.length ? (
          <ul className="grid gap-1">
            {hidden.map((channel) => (
              <li key={`${channel.platform}:${channel.channelId}`} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {channel.channelName || channel.channelId}
                  <span className="text-muted-foreground"> · {creatorPlatformLabels[channel.platform]}</span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy(`unhide:${channel.platform}:${channel.channelId}`)}
                  onClick={() => onShow(channel)}
                >
                  Show again
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Nothing is hidden. Hide a channel from a video's ⋮.</p>
        )}
      </MenuSection>
      <MenuLine />
      <p className="px-2.5 py-1.5 text-xs text-muted-foreground">To delete saved videos, tick them on Downloaded or Analysed.</p>
    </FoldingMenu>
    </div>
  )
}

const ANY = "any"

/** Sort by and its order: the first rows of Filter and of Edit view. */
function SortRows({
  idPrefix,
  values,
  onChange,
}: {
  idPrefix: string
  values: ViralViewFilters
  onChange: (patch: Record<string, string | number | undefined>) => void
}) {
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
    </>
  )
}

/**
 * The Filter popover's rows, also Edit view's: where the videos come from,
 * how well they fit, and the keyword that found them. Each row is a label,
 * then its Select.
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
