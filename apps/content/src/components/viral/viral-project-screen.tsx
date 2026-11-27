import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  DownloadIcon,
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

import { ProjectMenuButton, SHRINKING_MENU } from "@/components/content-app/project-top"
import { ProjectHeaderLead } from "@/components/social/projects/project-header-lead"
import { HeaderChoice } from "@/components/content-app/list-header"
import { ViewMenu } from "@/components/shared/view-menu"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { FilterPopover } from "@/components/shared/filter-popover"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import {
  SaveViewDialog,
  SavedViewsControls,
  type EditFields,
  type SavedViewsScreen,
} from "@/components/shared/saved-views"
import { middleGutterClassName, PanelReopenButton, ThreePanels } from "@/components/shared/three-panels"
import { PROJECTS_PANEL_LAYOUT_KEY } from "@/lib/social/reddit/options"
import { cn } from "@/lib/utils"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { CrmRowMenu } from "@/components/crm/crm-row"
import { ListHeader } from "@/components/content-app/list-header"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
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
import { ProjectSettingsMenu } from "@/components/viral/project-menu"
import { CreatorCard } from "@/components/viral/creator-card"
import { CreatorSummary } from "@/components/viral/creator-summary"
import { DeleteSavedVideosDialog } from "@/components/viral/delete-saved-videos-dialog"
import { HookBoard } from "@/components/viral/hook-board"
import { KeywordsDropdown } from "@/components/viral/keywords-dropdown"
import { PasteLinkDialog } from "@/components/viral/paste-link-dialog"
import { PlayerPanel } from "@/components/viral/player-panel"
import { SoundBoard } from "@/components/viral/sound-board"
import { ProjectProvider, type ProjectContextValue } from "@/components/viral/project-context"
import { SocialIcon } from "@/components/viral/social-icon"
import { useKeyedAction } from "@/components/viral/use-keyed-action"
import { useSavedProgress } from "@/components/viral/use-saved-progress"
import { PostThreadPanel, SocialSourcesDropdown, TextPostsMiddle } from "@/components/viral/text-socials"
import { useTextSocials } from "@/components/viral/use-text-socials"
import { CreatorTable, VideoGrid, VideoList } from "@/components/viral/video-grid"
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
import { saveVideos } from "@/lib/api/viral/viral-videos"
import {
  findSameIdeaFn,
  loadSameIdeaFn,
  markViralVideoSeenFn,
  type SameIdeaView,
} from "@/lib/api/viral/viral-finding"
import { plural } from "@/lib/format/plural"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { SAVED_VIEW_ERRORS, savedViewScreen, type SavedViewValues } from "@/lib/saved-views"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { creatorPlatformLabels, formatCount } from "@/lib/viral/creators"
import { isTextSocial, SOCIAL_NAMES, socialHasKeywords, type Social, type TextSocial } from "@/lib/viral/socials"
import {
  describeTextPostsView,
  filterTextPosts,
  readTextPostSort,
  sortTextPosts,
  TEXT_POST_MIN_STEPS,
  TEXT_POSTS_SAVED_VIEW_KIND,
  textPostSorts,
  textPostsViewFilters,
  figureName,
  type TextPostSort,
  type TextPostsViewFilters,
} from "@/lib/viral/text-posts"
import { trendingSounds } from "@/lib/viral/sounds"
import {
  countVideos,
  isKeywordWorking,
  OUTLIER_BADGE_MIN,
  postsPerWeek,
  soundKey,
  soundLabel,
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
  SUBSCRIBER_STEPS,
  VIRAL_CARD_SIZES,
  VIRAL_FIT_CHOICES,
  VIRAL_LAYOUTS,
  VIRAL_SORTS,
  VIRAL_SOURCES,
  viralShowLabels,
  viralSortLabels,
  viralSourceLabels,
  type SubscriberRange,
  type ViralShow,
  type ViralCardSize,
  type ViralSort,
  type ViralSource,
} from "@/lib/viral/viral-view"

const projectRoute = getRouteApi("/_authenticated/admin/projects_/$projectId_/research")

/** While a keyword is searching, the screen reads the project again this often. */
const SEARCHING_POLL_MS = 3000

const LAYOUT_STORAGE_KEY = "viral-layout"
const SIZE_STORAGE_KEY = "viral-card-size"

/**
 * Where this browser keeps the panels' widths. The number is bumped whenever
 * the default widths move.
 */
// The project page's own widths, so Research and the project's other rows draw the same columns (`workspace/docs/content-app.md`).
const LAYOUT_KEY = PROJECTS_PANEL_LAYOUT_KEY

/**
 * Where this browser keeps the panels' widths, and where the page was. App
 * keys, so they live here rather than in the shell's `panelLayoutKey`. The
 * number is bumped whenever the default widths move.
 */
const placeKey = (projectId: string) => `viral-project-place-${projectId}`

type ChannelUploads =
  | { state: "loading" }
  | { state: "ready"; videos: ViralVideo[] }
  | { state: "failed"; error: string }

type SameIdeaState =
  | { state: "searching" }
  | { state: "ready"; view: SameIdeaView | null }
  | { state: "failed"; error: string }


/**
 * One project's own dashboard (`workspace/docs/project-page.md`), drawn on
 * the shell's three-panel design (task features/03): the project's page of
 * blocks on the left (Dashboards with Videos; Socials; the creators; what
 * Promo reads), what was found in the middle under one header with the
 * Keywords dropdown, and the open video, post or creator on the right. Everything the address can hold lives there (the tab,
 * Filter's Show, the open video, the picked social and creator, the sort,
 * the filters), so a reload or a shared link opens the same thing. Nothing
 * here calls YouTube except the buttons that say what they cost.
 */
export function ViralProjectScreenView({
  screen,
  views,
  postViews,
  left: projectLeft,
  rightCover,
}: {
  screen: ViralProjectScreen
  views: SavedView[]
  /** Saved views on the X, Reddit and LinkedIn list, a kind of their own. */
  postViews: SavedView[]
  /**
   * The Projects dashboard's left panel: in Content, Research is a tab of
   * the project's page (`workspace/docs/content-app.md`).
   */
  left: React.ReactNode
  /** The left page's cover, which the right panel carries on. */
  rightCover: string | null
}) {
  const router = useRouter()
  const search = projectRoute.useSearch()
  const setSearch = useListSearchNavigate()
  const { project } = screen
  const view = search.view ?? "videos"
  // Filter's Show on Videos: every video, or only the downloaded or analysed ones (Tyler, 19 Nov 2026).
  const show = view === "videos" ? (search.show ?? null) : null
  const social: Social | null = search.social && project.socials.includes(search.social) ? search.social : null
  // X, Reddit and LinkedIn find posts, read by Promo, rather than videos
  // (`text-socials.tsx`); with one picked, the middle and right show those.
  const textSocial = social && isTextSocial(social) ? social : null
  const postSort = textSocial ? readTextPostSort(textSocial, search.psort) : "newest"
  const sort: ViralSort = search.sort ?? "score"
  const direction = search.direction ?? "desc"
  const source: ViralSource = search.from ?? "both"
  const keywordFilter = search.keyword ?? null
  const fit = search.fit ?? 0
  const text = search.q ?? ""
  const followers = React.useMemo(() => ({ min: search.fmin ?? null, max: search.fmax ?? null }), [search.fmax, search.fmin])
  const sameKey = textSocial ? null : (search.same ?? null)

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
  const [savingPostsView, setSavingPostsView] = React.useState(false)
  const [removing, setRemoving] = React.useState<ViralKeyword | null>(null)
  const [deletingVideos, setDeletingVideos] = React.useState<ViralVideo[]>([])
  const [pasting, setPasting] = React.useState(false)
  // A switch flipped here shows at once, before the screen reads itself again.
  const [watchOverride, setWatchOverride] = React.useState<Record<string, boolean>>({})
  // Videos opened since the screen was read, so their New mark clears at once.
  const [opened, setOpened] = React.useState<Set<string>>(new Set())
  // "Same idea, other creators" searches, by the video they were run for.
  const [sameIdeas, setSameIdeas] = React.useState<Record<string, SameIdeaState>>({})
  const { run, isBusy } = useKeyedAction(getViralErrorMessage)

  const refresh = React.useCallback(() => router.invalidate(), [router])

  // What the project's page puts first in every middle header (nothing on Research), as on its other tabs.
  const projectLead = <ProjectHeaderLead />

  /**
   * Filter's Social row, first in every Filter on Found videos: every social
   * the project reads, or one. They were rows of the Research block on the
   * project's left panel; a slice of one list is a Filter row (Tyler, 19 Nov
   * 2026: "We dont need analyzed and downloaded its own tab when it can be
   * sectioned or filtered"). X, Reddit and LinkedIn find posts, so picking
   * one shows its posts in place of the videos.
   */
  const socialRow = project.socials.length ? (
    <FilterRow id="viral-filter-social" label="Social">
      <Select
        value={social ?? "all"}
        onValueChange={(next) => {
          setTicked(new Set())
          // A video's, post's or creator's key means nothing on another social's list.
          setSearch({ social: next === "all" ? undefined : (next as Social), open: undefined, creator: undefined, same: undefined })
        }}
      >
        <SelectTrigger id="viral-filter-social" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Every social</SelectItem>
          {project.socials.map((one) => (
            <SelectItem key={one} value={one}>
              {SOCIAL_NAMES[one]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterRow>
  ) : null

  // Research's own settings, its search, AI limit and socials, at the end of every middle header (`content-app.md`).
  // The channels hidden from this project, each with Show again, a tab of the project's ⋮, which is last in every header.
  const hiddenItems = screen.hidden.map((channel) => ({
    label: `Show ${channel.channelName || channel.channelId} again`,
    icon: <EyeIcon className="size-4" />,
    onClick: () => void showChannel(channel),
  }))
  // One ⋮ with the project's own tabs, then Research's as Research and Socials (Tyler, 27 Nov 2026: "should be merged").
  const researchMenu = (
    <ProjectSettingsMenu
      project={project}
      refresh={refresh}
      onGone={() => undefined}
      research
      inMenu={(tabs) => (
        <ProjectMenuButton extraTabs={tabs} actions={hiddenItems.length ? { title: "Hidden", items: hiddenItems } : undefined} />
      )}
    />
  )


  // Every video this screen knows of, so a card keeps saying it is being
  // saved and broken down while somebody looks at other videos.
  const allVideos = React.useMemo(
    () => [
      ...screen.videos,
      ...Object.values(uploads).flatMap((one) => (one.state === "ready" ? one.videos : [])),
      ...Object.values(sameIdeas).flatMap((one) => (one.state === "ready" && one.view ? one.view.videos : [])),
    ],
    [sameIdeas, screen.videos, uploads]
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
          followers,
        }),
        sort,
        direction
      ),
    [direction, fit, followers, keywordFilter, project.min_score, project.min_views, socialVideos, sort, source, text]
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

  // The Creators tab (Tyler, 21 Nov 2026: "Move the creators block into the
  // middle tab here"): YouTube's and TikTok's creators in the middle, with
  // the social picked in the Socials block narrowing them, and the open one
  // (`open`, `platform:channel`) on the right. A creator's own page of
  // videos (`creator`) still replaces the list.
  const creatorsList = view === "creators" && !pickedCreator && !sameKey && !textSocial
  const usesCreator = (creator: ViralCreator) =>
    (project.socials as readonly string[]).includes(creator.platform) && (!social || creator.platform === social)
  const creatorCount = screen.creators.filter(usesCreator).length
  const creatorsHere = creators.filter(usesCreator)
  const openCreator = creatorsList && search.open ? (screen.creators.find((creator) => creator.key === search.open) ?? null) : null
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
  // The Sounds tab: the sounds under the videos the filters leave (Tyler, 4 Nov 2026: "A Sounds tab").
  const sounds = React.useMemo(() => trendingSounds(shown), [shown])
  const soundCount = trendingSounds(projectVideos).length
  const pickedSound = view === "sounds" && search.sound ? (sounds.find((one) => one.key === search.sound) ?? null) : null
  const sameIdea = sameKey ? sameIdeas[sameKey] : undefined
  const sameOriginal = sameKey ? (allVideos.find((video) => video.key === sameKey) ?? null) : null
  // A video opened here, or the one open now, no longer says New.
  const markSeen = (video: ViralVideo) => (video.seen || opened.has(video.key) || video.key === search.open ? { ...video, seen: true } : video)
  // A creator page shows the channel's videos in this project first, sorted
  // like the list, then any newer uploads read from the channel.
  const creatorVideos = pickedCreator
    ? (() => {
        const channelId = pickedCreator.key.split(":").slice(1).join(":")
        const inProject = sortVideos(
          socialVideos.filter((video) => video.platform === pickedCreator.platform && video.channelId === channelId),
          sort,
          direction
        )
        const known = new Set(inProject.map((video) => video.key))
        const read = creatorUploads?.state === "ready" ? creatorUploads.videos.filter((video) => !known.has(video.key)) : []
        return [...inProject, ...read]
      })()
    : []
  const middleVideos = (
    sameKey
      ? sameIdea?.state === "ready" && sameIdea.view
        ? sortVideos(sameIdea.view.videos, sort, direction)
        : []
      : pickedCreator
        ? creatorVideos
        : view === "hooks"
          ? shown.filter(hasHook)
          : view === "sounds"
            ? pickedSound
              ? shown.filter((video) => video.sound && soundKey(video.sound) === pickedSound.key)
              : []
            : show === "analysed"
              ? shown.filter(isAnalysed)
              : show === "downloaded"
                ? shown.map(progress.apply).filter(isDownloaded)
                : shown
  ).map((video) => markSeen(progress.apply(video)))


  // The open video is looked for everywhere this screen has videos, so a
  // filter that hides it does not stop it playing.
  const found = !textSocial && !creatorsList && search.open ? allVideos.find((video) => video.key === search.open) : undefined
  const pickedVideo = found ? markSeen(progress.apply(found)) : null

  // Opening a video clears its New mark for this person (Tyler, 4 Nov 2026:
  // "Opening that video"), so the server is told once per video opened.
  const toldSeen = React.useRef(new Set<string>())
  const unseenOpen = found && !found.seen && !found.sample ? found : null
  React.useEffect(() => {
    if (!unseenOpen || toldSeen.current.has(unseenOpen.key)) return
    toldSeen.current.add(unseenOpen.key)
    markViralVideoSeenFn({ platform: unseenOpen.platform, platformVideoId: unseenOpen.platformVideoId }).catch(() => {
      // Only the New mark rides on it; it comes back next time if this failed.
      toldSeen.current.delete(unseenOpen.key)
    })
  }, [unseenOpen])

  // A "same idea" list in the address that this screen hasn't read yet is
  // read once. Reading a kept search spends nothing.
  const sameWanted = sameKey && !sameIdeas[sameKey] ? sameKey : null
  React.useEffect(() => {
    if (!sameWanted) return
    const [platform, ...rest] = sameWanted.split(":")
    if (platform !== "youtube" && platform !== "tiktok" && platform !== "instagram") return
    let live = true
    loadSameIdeaFn({ projectId: project.id, platform, platformVideoId: rest.join(":") })
      .then((kept) => {
        if (live) setSameIdeas((was) => ({ ...was, [sameWanted]: { state: "ready", view: kept } }))
      })
      .catch((error) => {
        if (live) setSameIdeas((was) => ({ ...was, [sameWanted]: { state: "failed", error: getViralErrorMessage(error) } }))
      })
    return () => {
      live = false
    }
  }, [project.id, sameWanted])

  // An address naming a video that is no longer in the results (a re-run
  // replaced it, or its channel was hidden) drops it rather than failing.
  const missingVideo =
    !textSocial && !creatorsList && Boolean(search.open) && !pickedVideo && creatorUploads?.state !== "loading" && !(sameKey && sameIdea?.state !== "ready")

  /**
   * Which of Research's lists shows, one dropdown first in each of its
   * headers after the project's controls: the found videos, their hooks and
   * sounds, and the creators (Tyler, 27 Nov 2026: "Lets
   * put them all in the top header so we have just one header. The tabs can
   * now be either dropdowns or filter"). They were the Research block's rows
   * and the tabs of the videos' own header. The vault is the Projects
   * dashboard's own, and Winning ads is gone (Tyler, 27 Nov 2026: "Remove
   * winning ads feature ... and vault dont belong here").
   */
  // Drawn after the search icon of the header it sits in (`HeaderChoice`), with the search's spinner after it.
  const researchViews = (
    <HeaderChoice>
    <span className="flex min-w-0 shrink items-center gap-1">
    <span className={SHRINKING_MENU}>
      <ViewMenu
        label="Which part of Research"
        value={view}
        onValueChange={(next) => {
          if (next === view) return
          setTicked(new Set())
          // A video's key means nothing on Creators, nor a creator's on the videos.
          const keyed = (one: string) => one === "creators"
          setSearch({
            view: next === "videos" ? undefined : (next as typeof view),
            sound: undefined,
            show: undefined,
            ...(keyed(next) || keyed(view) ? { open: undefined } : {}),
          })
        }}
        choices={[
          { value: "videos", label: "Found videos", count: projectVideos.length },
          { value: "hooks", label: "Hooks", count: hookCount },
          { value: "sounds", label: "Sounds", count: soundCount },
          ...(project.socials.includes("youtube") || project.socials.includes("tiktok")
            ? [{ value: "creators", label: "Creators", count: creatorCount }]
            : []),
        ]}
      />
    </span>
    {searching ? <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Still searching" /> : null}
    </span>
    </HeaderChoice>
  )
  const textSocials = useTextSocials(project.id, project.socials.some(isTextSocial))
  const textPosts = React.useMemo(
    () =>
      textSocial && textSocials.data.state === "ready"
        ? sortTextPosts(
            filterTextPosts(textSocials.data.posts, { social: textSocial, q: text, minLikes: search.pmin }),
            postSort,
            search.pdir ?? "desc"
          )
        : [],
    [postSort, search.pdir, search.pmin, text, textSocial, textSocials.data]
  )
  // Looked for among all the social's posts, so a filter that hides the open one does not close it.
  const openPost =
    textSocial && textSocials.data.state === "ready"
      ? (textSocials.data.posts.find((post) => post.network === textSocial && post.id === search.open) ?? null)
      : null
  const missingPost = Boolean(textSocial) && textSocials.data.state === "ready" && Boolean(search.open) && !openPost
  React.useEffect(() => {
    if (missingVideo || missingPost) setSearch({ open: undefined })
  }, [missingPost, missingVideo, setSearch])

  // Picking X, Reddit or LinkedIn opens its first post, so the right panel is never empty.
  const firstPostId = textSocial && !search.open ? (textPosts[0]?.id ?? null) : null
  React.useEffect(() => {
    if (firstPostId) setSearch({ open: firstPostId })
  }, [firstPostId, setSearch])

  // The Sounds tab opens the picked sound's first video, or the top sound's,
  // so the right panel is never empty.
  const firstSoundKey = pickedSound?.key ?? sounds[0]?.key ?? null
  const firstSoundVideoKey =
    view === "sounds" && !search.open && !pickedCreator && !sameKey && firstSoundKey
      ? (shown.find((video) => video.sound && soundKey(video.sound) === firstSoundKey)?.key ?? null)
      : null
  React.useEffect(() => {
    if (firstSoundVideoKey) setSearch({ open: firstSoundVideoKey })
  }, [firstSoundVideoKey, setSearch])

  // The Creators tab opens its first creator, so the right panel is never empty.
  const firstCreatorKey = creatorsList && !openCreator ? (creatorsHere[0]?.key ?? null) : null
  React.useEffect(() => {
    if (firstCreatorKey) setSearch({ open: firstCreatorKey })
  }, [firstCreatorKey, setSearch])

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

  function retryUploads(creator: ViralCreator) {
    setUploads((was) => {
      const next = { ...was }
      delete next[creator.key]
      return next
    })
  }

  function pickVideo(video: ViralVideo) {
    // The video being left was seen while it was open.
    const leaving = search.open
    if (leaving) setOpened((was) => (was.has(leaving) ? was : new Set(was).add(leaving)))
    setSearch({ open: video.key, at: undefined })
  }

  // A channel known to this project opens as its creator page in the middle.
  const creatorKeys = React.useMemo(() => new Set(screen.creators.map((creator) => creator.key)), [screen.creators])
  const hasChannel = (video: ViralVideo) => creatorKeys.has(`${video.platform}:${video.channelId}`)
  function openChannel(video: ViralVideo) {
    setSearch({ creator: `${video.platform}:${video.channelId}`, view: undefined, same: undefined, sound: undefined })
  }

  /** "Same idea, other creators" from the right panel's ⋮: about 1 cent and 102 units. */
  async function runSameIdea(video: ViralVideo) {
    if (project.sample) {
      showErrorToast("A sample project's videos are made up, so there is nothing to search for. Make your own project to try it.")
      return
    }
    setSearch({ same: video.key, creator: undefined, view: undefined, sound: undefined, open: video.key })
    setSameIdeas((was) => ({ ...was, [video.key]: { state: "searching" } }))
    await run(`same:${video.key}`, async () => {
      try {
        const view = await findSameIdeaFn({ projectId: project.id, platform: video.platform, platformVideoId: video.platformVideoId })
        setSameIdeas((was) => ({ ...was, [video.key]: { state: "ready", view } }))
        await refresh()
      } catch (error) {
        setSameIdeas((was) => ({ ...was, [video.key]: { state: "failed", error: getViralErrorMessage(error) } }))
        throw error
      }
    })
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
    await run("search-all", async () => {
      await searchViralProject(project.id)
      await refresh()
    })
  }

  async function refreshKeyword(keyword: ViralKeyword) {
    await run(`keyword:${keyword.id}`, async () => {
      await refreshViralKeyword(keyword.id)
      await refresh()
    })
  }

  async function addKeyword(value: string) {
    let added = false
    await run("add-keyword", async () => {
      const { searchError } = await addViralKeywordFn(project.id, value)
      added = true
      await refresh()
      if (searchError) toast.message(`Added "${value.trim()}". ${searchError}`)
    })
    return added
  }

  async function followLink(link: string) {
    let added = false
    await run("follow-link", async () => {
      await followCreatorByLink(project.id, link)
      added = true
      await refresh()
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
    })
  }

  async function showChannel(channel: ViralProjectScreen["hidden"][number]) {
    await run(`unhide:${channel.platform}:${channel.channelId}`, async () => {
      await unhideViralChannelFn(project.id, channel)
      await refresh()
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
    })
  }

  async function unfollow(creator: ViralCreator) {
    if (!creator.followedId) return
    await run(`creator:${creator.key}`, async () => {
      await unfollowViralCreator(project.id, creator.followedId as string)
      await refresh()
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
    ...(search.fmin ? { fmin: search.fmin } : {}),
    ...(search.fmax ? { fmax: search.fmax } : {}),
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
      fmin: filters.fmin,
      fmax: filters.fmax,
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

  // ------------------------------------------- X, Reddit, LinkedIn views --

  // The posts list keeps views of its own kind, so its menu never holds a video view.
  const currentPostsView = textPostsViewFilters({
    ...(textSocial ? { social: textSocial } : {}),
    ...(search.q ? { q: search.q } : {}),
    ...(search.psort ? { psort: search.psort } : {}),
    ...(search.pdir ? { pdir: search.pdir } : {}),
    ...(search.pmin ? { pmin: search.pmin } : {}),
  })
  const postsViewsHere: SavedViewsScreen = {
    screen: savedViewScreen(TEXT_POSTS_SAVED_VIEW_KIND, project.id),
    describe: (filters) => describeTextPostsView(textPostsViewFilters(filters), (one) => SOCIAL_NAMES[one]),
    kept: (filters) => textPostsViewFilters(filters) as SavedViewValues,
    describeError: viewsHere.describeError,
  }

  /** Opens a posts view: it picks its social, and a social the project no longer has is said and left out. */
  function openPostsView(saved: SavedView) {
    const filters = textPostsViewFilters(saved.filters)
    const social = filters.social && project.socials.includes(filters.social) ? filters.social : textSocial
    if (filters.social && social !== filters.social) {
      showErrorToast(`This project no longer reads ${SOCIAL_NAMES[filters.social]}, so "${saved.name}" opened on ${social ? SOCIAL_NAMES[social] : "its videos"}.`)
    }
    setSearch({
      social: social ?? undefined,
      q: filters.q,
      psort: filters.psort,
      pdir: filters.pdir,
      pmin: filters.pmin,
      open: undefined,
      creator: undefined,
    })
  }

  function savePostsView() {
    setFilterOpen(false)
    if (!search.q && !search.psort && !search.pdir && !search.pmin) {
      showErrorToast("Search or pick a filter first, then save it as a view.")
      return
    }
    setSavingPostsView(true)
  }

  const editPostsViewFields: EditFields = ({ filters, change }) => {
    const values = textPostsViewFilters(filters)
    return (
      <>
        <div className="grid gap-2">
          <Label htmlFor="edit-posts-view-search">Search</Label>
          <Input
            id="edit-posts-view-search"
            value={typeof filters.q === "string" ? filters.q : ""}
            maxLength={200}
            placeholder="Words in the post, its writer or its subreddit"
            onChange={(event) => change({ q: event.target.value || undefined })}
          />
        </div>
        {values.social ? (
          <TextPostFilterRows idPrefix="edit-posts-view" social={values.social} values={values} onChange={change} />
        ) : null}
      </>
    )
  }

  const postsHeader = textSocial ? (
    <ListHeader
      tabs={
        <span className="flex min-w-0 items-center gap-2">
          <PanelReopenButton side="left" label="Show the Projects page" />
          {projectLead}
          {researchViews}
          <span aria-hidden className="ml-1 flex shrink-0 text-muted-foreground [&_svg]:size-4">
            <SocialIcon social={textSocial} />
          </span>
          <h2 className="min-w-0 truncate text-[0.891rem] font-medium">{SOCIAL_NAMES[textSocial]} posts</h2>
          {textSocials.data.state === "ready" ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{textPosts.length}</span> : null}
        </span>
      }
      end={<>{researchMenu}<PanelReopenButton side="right" label="Show the post" /></>}
      menuLabel="More for these posts"
      search={{
        name: "viral-in-posts",
        label: `Search these ${SOCIAL_NAMES[textSocial]} posts`,
        placeholder: "Search posts",
        value: text,
        onChange: (next) => setSearch({ q: next.trim() ? next : undefined }),
      }}
      massSelect={null}
      filter={
        <FilterPopover
          count={1 + (search.pmin ? 1 : 0)}
          open={filterOpen}
          onOpenChange={setFilterOpen}
          onClear={() => setSearch({ social: undefined, pmin: undefined, open: undefined })}
          save={
            <Button type="button" onClick={savePostsView}>
              Save as view
            </Button>
          }
        >
          {socialRow}
          <TextPostFilterRows idPrefix="posts-filter" social={textSocial} values={currentPostsView} onChange={(patch) => setSearch(patch)} />
        </FilterPopover>
      }
      view={
        <>
          <SavedViewsControls
            here={postsViewsHere}
            views={postViews}
            filters={currentPostsView as SavedViewValues}
            onOpen={openPostsView}
            editFields={editPostsViewFields}
            saveButton={false}
            buttonVariant="ghost"
          />
          {/* What Promo reads here, beside Views as Keywords sits on the videos (Tyler, 21 Nov 2026: "these belong in the middle panel"). */}
          <SocialSourcesDropdown
            key={textSocial}
            projectId={project.id}
            social={textSocial}
            data={textSocials.data}
            sample={project.sample}
            onChanged={textSocials.reload}
          />
        </>
      }
    />
  ) : null

  // ------------------------------------------------------------- Panels --


  // The Projects dashboard's left panel, the same as on the project's other tabs (`content-app.md`).
  const left = projectLeft

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

  // Shown as Downloaded or Analysed, every ticked video is saved, so Delete
  // is offered there. A sample's videos are made up, so nothing is saved from one.
  const savedTab = !pickedCreator && show !== null
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
            {show === "analysed" || project.sample ? null : (
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

  const filterCount = [social, search.from, search.fit, search.keyword, search.fmin || search.fmax, show].filter(Boolean).length
  const clearFilters = () =>
    setSearch({ q: undefined, social: undefined, from: undefined, fit: undefined, keyword: undefined, fmin: undefined, fmax: undefined, show: undefined })


  // Select comes right after the search box (Tyler, 9 Nov 2026: "mass select should be after saerch field").
  // Hooks is a list of words nobody ticks.
  const massSelect =
    view === "hooks" || (view === "sounds" && !pickedSound) ? null : { on: selecting, onToggle: toggleSelecting }

  const filter = (
    // Wide enough for every picked value to show whole, Followers' two
    // included (Tyler, 21 Nov 2026: "the filter dropdown to be wider so the
    // text can show").
    <FilterPopover
      contentClassName="w-96"
      count={filterCount}
      open={filterOpen}
      onOpenChange={setFilterOpen}
      onClear={() => setSearch({ social: undefined, from: undefined, fit: undefined, keyword: undefined, fmin: undefined, fmax: undefined, show: undefined })}
      save={
        <Button type="button" onClick={saveAsView}>
          Save as view
        </Button>
      }
    >
      {socialRow}
      {/* Downloaded and Analysed were tabs (Tyler, 19 Nov 2026: "We dont need analyzed and downloaded its own tab when it can be sectioned or filtered"). */}
      {view === "videos" ? (
        <FilterRow id="viral-filter-show" label="Show">
          <Select
            value={show ?? "all"}
            onValueChange={(next) => {
              setTicked(new Set())
              setSearch({ show: next === "all" ? undefined : (next as ViralShow) })
            }}
          >
            <SelectTrigger id="viral-filter-show" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{viralShowLabels.all}</SelectItem>
              <SelectItem value="downloaded">{viralShowLabels.downloaded} · {downloadedCount}</SelectItem>
              <SelectItem value="analysed">{viralShowLabels.analysed} · {analysedCount}</SelectItem>
            </SelectContent>
          </Select>
        </FilterRow>
      ) : null}
      <SortRows idPrefix="viral-filter" values={currentView} onChange={(patch) => setSearch(patch)} />
      <ViralFilterRows
        idPrefix="viral-filter"
        values={currentView}
        keywords={screen.keywords}
        onChange={(patch) => setSearch({ ...patch, creator: undefined })}
      />
      {/* How the videos are drawn, not what they hold, so Clear and views leave it alone. It sits here
          rather than in the header so the tabs fit beside the toolbar (Tyler, 4 Nov 2026:
          "middle header alignment is wrong"). Hooks is one list of words, drawn the same either way. */}
      {view === "hooks" || view === "sounds" ? null : (
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
      {layout === "grid" && view !== "hooks" && view !== "sounds" ? (
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
  )

  // The Creators tab's Filter: their subscribers, the block's range before it moved.
  const creatorsFilter = (
    <FilterPopover
      count={(range.min !== null || range.max !== null ? 1 : 0) + (social ? 1 : 0)}
      open={filterOpen}
      onOpenChange={setFilterOpen}
      onClear={() => {
        setRange({ min: null, max: null })
        if (social) setSearch({ social: undefined, open: undefined })
      }}
      save={
        <Button type="button" onClick={() => setFilterOpen(false)}>
          Done
        </Button>
      }
    >
      {socialRow}
      <FilterRow id="viral-creators-min" label="Subscribers">
        <div className="grid grid-cols-2 gap-2">
          <FollowerSelect
            id="viral-creators-min"
            noun="Subscribers"
            label="From"
            value={range.min}
            onChange={(min) => setRange((was) => ({ ...was, min }))}
          />
          <FollowerSelect
            id="viral-creators-max"
            noun="Subscribers"
            label="Up to"
            value={range.max}
            onChange={(max) => setRange((was) => ({ ...was, max }))}
          />
        </div>
      </FilterRow>
    </FilterPopover>
  )

  const savedViews = (
    <SavedViewsControls
      here={viewsHere}
      views={views}
      filters={currentView as SavedViewValues}
      onOpen={openView}
      editFields={editViewFields}
      saveButton={false}
      buttonVariant="ghost"
    />
  )

  // The keywords sit in the middle header (Tyler, 21 Nov 2026: "keep the keywords moved to the middle").
  const keywordsDropdown =
    hasYoutube && (!social || socialHasKeywords(social)) ? (
      <KeywordsDropdown
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
    ) : null

  const addMenu = (
    <AddMenu
      canSearch={hasYoutube}
      sample={project.sample}
      busy={isBusy("add-keyword") || isBusy("follow-link")}
      onAddKeyword={addKeyword}
      onFollow={followLink}
      onPaste={addLink}
    />
  )


  /** The one middle header (the Admin 3 panel design, "Middle panel"), with `tabs` at its start. */
  const listHeader = (tabs: React.ReactNode) => (
    <ListHeader
      tabs={
        // Gives way first on a narrow middle; its dropdowns cut their words short, so the buttons never run past the edge.
        <span className="flex min-w-0 shrink-[20] items-center gap-1 self-stretch">
          <PanelReopenButton side="left" label="Show the Projects page" />
          {projectLead}
          <span className="flex shrink-0 self-stretch">{tabs}</span>
        </span>
      }
      end={<>{researchMenu}<PanelReopenButton side="right" label={creatorsList ? "Show the creator" : "Show the video"} /></>}
      menuLabel="More for these videos"
      selected={selectedMenu}
      search={
        creatorsList
          ? {
              name: "viral-creator-search",
              label: "Search creators",
              placeholder: "Search creators",
              value: creatorSearch,
              onChange: setCreatorSearch,
            }
          : {
              name: "viral-in-results",
              label: "Search these videos",
              placeholder: "Search videos",
              value: text,
              onChange: (next) => setSearch({ q: next.trim() ? next : undefined }),
            }
      }
      massSelect={creatorsList ? null : massSelect}
      filter={creatorsList ? creatorsFilter : filter}
      view={
        creatorsList ? (
          keywordsDropdown
        ) : (
          <>
            {savedViews}
            {keywordsDropdown}
          </>
        )
      }
      primary={addMenu}
    />
  )

  const gridProps = {
    videos: middleVideos,
    selectedKey: pickedVideo?.key ?? null,
    onPick: pickVideo,
    ticked: selecting ? ticked : undefined,
    onTick: selecting ? toggleTick : undefined,
    onPickChannel: pickedCreator ? undefined : openChannel,
    hasChannel,
  }

  // A row's right-click menu (the Admin 3 panel design): Select first, then what the row can do.
  const [rowMenu, setRowMenu] = React.useState<{ video: ViralVideo; x: number; y: number } | null>(null)

  /**
   * The videos in the middle: the shell's table, which scrolls itself, or the
   * grid, the hooks or the sounds in a scrolling body. With nothing left by a
   * search or a filter, it says so with Clear filters.
   */
  const videoBody = (emptyText: string) => {
    const narrowed = Boolean(text.trim()) || filterCount > 0
    const empty: React.ReactNode =
      narrowed && view !== "sounds" ? (
        <span className="grid justify-items-center gap-2">
          {text.trim() ? `No video matches "${text.trim()}".` : "No video matches those filters."}
          <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        </span>
      ) : (
        emptyText
      )
    const quiet = <div className="px-3 py-10 text-center text-sm text-muted-foreground">{empty}</div>
    if (view === "sounds" && !pickedCreator && !sameKey && !pickedSound) {
      return (
        <ScrollArea className={bodyClassName}>
          {sounds.length ? <SoundBoard sounds={sounds} onPick={(key) => setSearch({ sound: key })} /> : quiet}
        </ScrollArea>
      )
    }
    if (view === "hooks" && !pickedCreator && !sameKey) {
      return (
        <ScrollArea className={bodyClassName}>
          {middleVideos.length ? <HookBoard videos={middleVideos} selectedKey={pickedVideo?.key ?? null} onOpen={openAtHook} /> : quiet}
        </ScrollArea>
      )
    }
    if (layout === "grid") {
      return <ScrollArea className={bodyClassName}>{middleVideos.length ? <VideoGrid size={size} {...gridProps} /> : quiet}</ScrollArea>
    }
    return (
      <VideoList
        {...gridProps}
        sort={sort}
        direction={direction}
        empty={empty}
        onTickAll={() => {
          const keys = middleVideos.map((video) => video.key)
          setTicked((was) => (keys.every((key) => was.has(key)) ? new Set() : new Set(keys)))
        }}
        onRightClick={(video, x, y) => setRowMenu({ video, x, y })}
        onSort={(column) =>
          setSearch(
            column === sort
              ? { direction: direction === "desc" ? "asc" : undefined }
              : { sort: column === "score" ? undefined : column, direction: undefined }
          )
        }
      />
    )
  }

  const rowMenuDrawn = rowMenu ? (
    <CrmRowMenu
      key={`${rowMenu.video.key}-${rowMenu.x}-${rowMenu.y}`}
      at={rowMenu}
      massSelect={
        massSelect
          ? {
              on: selecting,
              onToggle: () => {
                const on = !selecting
                setSelecting(on)
                setTicked(on ? new Set([rowMenu.video.key]) : new Set())
              },
            }
          : null
      }
      items={[
        ...(project.sample
          ? []
          : [
              { label: "Break it down", icon: <SparklesIcon className="size-4" />, onSelect: () => void saveMany([rowMenu.video], true) },
              { label: "Download with no AI", icon: <DownloadIcon className="size-4" />, onSelect: () => void saveMany([rowMenu.video], false) },
            ]),
        { label: "Hide the channel", icon: <EyeOffIcon className="size-4" />, destructive: true, onSelect: () => void hideChannels([rowMenu.video]) },
      ]}
      onClose={() => setRowMenu(null)}
    />
  ) : null

  const analysedEmpty = analysedCount
    ? "No analysed video matches these filters."
    : "Nothing analysed yet. Open a video and press Analyse with AI. It shows here once the script is written."

  // An analysed video with nothing said or shown in its hook has no line.
  const hooksEmpty = hookCount
    ? "No hook matches these filters."
    : "No hooks yet. Analyse videos and the words of each one's opening show here."

  // A sound is known only for TikTok posts from followed creators.
  const soundsEmpty = soundCount
    ? "No sound matches these filters."
    : "No sounds yet. Follow TikTok creators; each post's sound shows here once the creator is read."

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
            : "Nothing searched yet. Press Search all under Keywords."
          : screen.videos.length
            ? "No video matches these filters."
            : "The searches found nothing. Try other keywords or a longer window."

  const bodyClassName = "min-h-0 flex-1"

  let middle: React.ReactNode
  if (textSocial) {
    middle = (
      <TextPostsMiddle
        social={textSocial}
        data={textSocials.data}
        posts={textPosts}
        filtered={Boolean(text.trim() || search.pmin)}
        header={postsHeader}
        sample={project.sample}
        openId={openPost?.id ?? null}
        onPick={(post) => setSearch({ open: post.id })}
        onRetry={textSocials.reload}
      />
    )
  } else if (sameKey) {
    const channels = new Set(middleVideos.map((video) => video.channelId))
    const doubled = new Set(
      middleVideos
        .filter((video) => video.outlier.times !== null && video.outlier.times >= OUTLIER_BADGE_MIN)
        .map((video) => video.channelId)
    )
    middle = (
      <>
        <DashboardCardTitleHeader
          back={{ label: "Back to the videos", onClick: () => setSearch({ same: undefined }) }}
          title="Same idea"
          meta={sameOriginal ? sameOriginal.title : undefined}
          action={
            sameOriginal && sameIdea?.state !== "searching" ? (
              <Button type="button" variant="ghost" size="sm" disabled={isBusy(`same:${sameKey}`)} onClick={() => void runSameIdea(sameOriginal)}>
                {sameIdea?.state === "ready" && sameIdea.view ? "Search again" : "Search"}
              </Button>
            ) : undefined
          }
        />
        {!sameIdea || sameIdea.state === "searching" ? (
            <LoadingRow label={sameIdea ? "Asking the AI for a search line, then searching YouTube…" : "Opening the search"} />
          ) : sameIdea.state === "failed" ? (
            <div className="p-3">
              <ErrorRow message={sameIdea.error} onRetry={sameOriginal ? () => void runSameIdea(sameOriginal) : undefined} />
            </div>
          ) : !sameIdea.view ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              Not searched yet. Search asks the writer picked on Settings → AI writer for one search line, about 1 cent, then searches YouTube with it, 102 units.
            </p>
          ) : (
            <>
              <p className="border-b px-3 py-2 text-sm text-muted-foreground">
                {channels.size
                  ? `${channels.size} other ${plural(channels.size, "creator")} made this, ${doubled.size} doubled their usual.`
                  : "No other creator made this."}{" "}
                Searched YouTube for "{sameIdea.view.searchLine}".
              </p>
              {videoBody("YouTube found no other creator's video for that search line.")}
            </>
          )}
      </>
    )
  } else if (pickedCreator) {
    middle = (
      <>
        <DashboardCardTitleHeader
          back={
            view === "creators"
              ? { label: "Back to every creator", onClick: () => setSearch({ creator: undefined, open: pickedCreator.key }) }
              : { label: "Back to every video", onClick: () => setSearch({ creator: undefined }) }
          }
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
              {layoutToggle}
              {/* Select is in the project's ⋮, as on every list (Tyler, 27 Nov 2026: "Move all the mass select button to here"). */}
              <ProjectMenuButton select={{ on: selecting, onToggle: toggleSelecting }} />
            </div>
          }
        />
        <CreatorSummary creator={pickedCreator} />
        {creatorUploads?.state === "loading" && !creatorVideos.length ? (
            <LoadingRow label="Reading their newest uploads…" />
          ) : creatorUploads?.state === "failed" ? (
            <div className="p-3">
              <ErrorRow message={creatorUploads.error} onRetry={() => retryUploads(pickedCreator)} />
            </div>
          ) : (
            videoBody(
              pickedCreator.followedId
                ? "Nothing saved from them yet. Their videos arrive when the watch timer next checks."
                : "They have no uploads to show."
            )
          )}
      </>
    )
  } else {
    middle = (
      <>
        {listHeader(
          pickedSound ? (
            // The picked sound in the one header (the Admin 3 panel design: "One header only").
            <span className="flex min-w-0 items-center gap-2">
              <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-lg" aria-label="Back to every sound" onClick={() => setSearch({ sound: undefined, open: undefined })}>
                <ArrowLeftIcon className="size-4" />
              </Button>
              <span className="grid min-w-0 leading-tight">
                <span className="truncate text-sm font-medium">{soundLabel(pickedSound.sound)}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {pickedSound.winners} {plural(pickedSound.winners, "winner")} of {countVideos(pickedSound.videos)}
                </span>
              </span>
            </span>
          ) : (
            // Which of Research's lists shows (`researchViews`), drawn after the search icon.
            researchViews
          )
        )}
        {creatorsList ? (
          <CreatorTable
            creators={creatorsHere}
            openKey={openCreator?.key ?? null}
            // A creator's row opens their page of videos (Tyler, 21 Nov 2026: "clicking on the creators row lead to the videos view").
            onOpen={(creator) => setSearch({ creator: creator.key, open: undefined })}
            // The eye shows them on the right (Tyler, 21 Nov 2026: "add eye").
            onShow={(creator) => setSearch({ open: creator.key })}
            onWatchChange={project.sample ? undefined : (creator, watch) => void changeWatch(creator, watch)}
            empty={
              creatorSearch.trim() || range.min !== null || range.max !== null ? (
                <span className="grid justify-items-center gap-2">
                  {creatorSearch.trim() ? `No creator matches "${creatorSearch.trim()}".` : "No creator matches those filters."}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCreatorSearch("")
                      setRange({ min: null, max: null })
                    }}
                  >
                    Clear filters
                  </Button>
                </span>
              ) : (
                "Creators show here once a search finds videos, or follow one with + Add."
              )
            }
          />
        ) : videoBody(
          view === "hooks"
            ? hooksEmpty
            : view === "sounds"
              ? soundsEmpty
              : show === "analysed"
                ? analysedEmpty
                : show === "downloaded"
                  ? downloadedEmpty
                  : videosEmpty
        )}
      </>
    )
  }

  /** A creator on the right: the open one on the Creators tab, or beside their page of videos. */
  const creatorPanel = (creator: ViralCreator) => {
    const read = creator.key === pickedCreator?.key ? creatorUploads : uploads[creator.key]
    return (
      <CreatorCard
        key={creator.key}
        creator={creator}
        postsPerWeek={read?.state === "ready" ? postsPerWeek(read.videos.map((video) => video.postedAt)) : null}
        busy={isBusy(`creator:${creator.key}`)}
        hiding={isBusy(`hide:${creator.key}`)}
        onFollow={() => void follow(creator)}
        onUnfollow={() => void unfollow(creator)}
        onHide={() =>
          void hideChannels(
            [
              {
                platform: creator.platform,
                channelId: creator.key.split(":").slice(1).join(":"),
                channelName: creator.name,
              },
            ],
            `hide:${creator.key}`
          )
        }
      />
    )
  }

  let right: React.ReactNode
  if (textSocial) {
    right = (
      <PostThreadPanel
        key={openPost?.id ?? "none"}
        post={openPost}
        sample={project.sample}
        onThreadRead={textSocials.reload}
        vaultItemId={openPost && textSocials.data.state === "ready" ? (textSocials.data.inVault[openPost.id] ?? null) : null}
        onSavedToVault={async () => {
          textSocials.reload()
          await refresh()
        }}
      />
    )
  } else if (creatorsList) {
    right = openCreator ? (
      creatorPanel(openCreator)
    ) : (
      <>
        <DashboardCardTitleHeader icon={<EyeIcon />} title="Creator" />
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">Click a creator to see them here.</p>
      </>
    )
  } else if (pickedVideo || !pickedCreator) {
    right = (
      <PlayerPanel
        video={pickedVideo}
        emptyText="Click a video to play it and analyse it here."
        projectId={project.id}
        projectTopic={project.topic}
        onVaultChanged={refresh}
        onHideChannel={(video) => void hideChannels([video])}
        onBack={pickedCreator ? () => setSearch({ open: undefined }) : undefined}
        onSavedChange={progress.report}
        onDeleted={(video) => afterDelete([video.key])}
        startAtMs={search.at}
        onOpenChannel={pickedVideo && hasChannel(pickedVideo) ? openChannel : undefined}
        onSameIdea={(video) => void runSameIdea(video)}
      />
    )
  } else {
    right = creatorPanel(pickedCreator)
  }

  const context = React.useMemo<ProjectContextValue>(() => ({ screen, refresh }), [refresh, screen])
  const rightIsVideo = !textSocial && !creatorsList && (pickedVideo || !pickedCreator)

  return (
    <ProjectProvider value={context}>
      {/* The left page's cover carries on behind the right panel, as an extension of the left (Tyler, 12 Nov 2026: "always connect right panel to the left panel bg"). */}
      <RightCoverProvider value={rightCover}>
      <ThreePanels
        layoutKey={LAYOUT_KEY}
        reopenInHeader
        place={{
          key: placeKey(project.id),
          search,
          ids: textSocial
            ? textPosts.map((post) => post.id)
            : creatorsList
            ? creatorsHere.map((creator) => creator.key)
            : middleVideos.map((video) => video.key),
          ready: textSocial ? textSocials.data.state !== "loading" : undefined,
          // A list picked in the Dashboards block (or a social picked in Socials) opens its first row, as every dashboard of sections does.
          section: textSocial ?? (creatorsList ? `creators-${social ?? "all"}` : `videos-${view}-${social ?? "all"}`),
        }}
        showMiddleFor={`${search.creator ?? ""}${creatorsList ? "creators" : ""}${social ?? ""}${sameKey ?? ""}${search.sound ?? ""}`}
        showRightFor={search.open}
        left={{ label: "Projects", showLabel: "Show the Projects page", content: left }}
        middle={{
          label: textSocial ? "Posts" : "Videos",
          // @container: the table's columns drop out by the middle's own width. 24px at its sides (`middleGutterClassName`).
          content: (
            <div className={cn("@container flex h-full min-h-0 flex-col overflow-hidden [&_td[colspan]]:whitespace-normal", middleGutterClassName)}>
              {middle}
            </div>
          ),
        }}
        right={{
          label: textSocial ? "Post" : rightIsVideo ? "Video" : "Creator",
          showLabel: textSocial ? "Show the post" : rightIsVideo ? "Show the video" : "Show the creator",
          content: right,
        }}
      >
        {rowMenuDrawn}
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
        <SaveViewDialog
          open={savingPostsView}
          here={postsViewsHere}
          filters={currentPostsView as SavedViewValues}
          onClose={() => setSavingPostsView(false)}
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
      </RightCoverProvider>
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
        <DashboardToolbarButton type="button" aria-label="Add">
          <PlusIcon className="size-4" />
          <span className="@max-6xl:sr-only">Add</span>
        </DashboardToolbarButton>
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

const ANY = "any"

/** Sort by and its order: the first rows of Filter and of Edit view. */
/**
 * The posts list's Filter rows, also its Edit view's: the sort, the order,
 * and the fewest likes a post may have, in the social's own word for likes.
 */
function TextPostFilterRows({
  idPrefix,
  social,
  values,
  onChange,
}: {
  idPrefix: string
  social: TextSocial
  values: TextPostsViewFilters
  onChange: (patch: { psort?: TextPostSort; pdir?: "asc"; pmin?: number }) => void
}) {
  const sort = readTextPostSort(social, values.psort)
  const likes = figureName(social, "likes") ?? "Likes"
  return (
    <>
      <FilterRow id={`${idPrefix}-psort`} label="Sort by">
        <Select value={sort} onValueChange={(next) => onChange({ psort: next as TextPostSort })}>
          <SelectTrigger id={`${idPrefix}-psort`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {textPostSorts(social).map((one) => (
              <SelectItem key={one.value} value={one.value}>
                {one.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-pdir`} label="Order">
        <Select value={values.pdir ?? "desc"} onValueChange={(next) => onChange({ pdir: next === "asc" ? "asc" : undefined })}>
          <SelectTrigger id={`${idPrefix}-pdir`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">{sort === "newest" ? "Newest first" : "Highest first"}</SelectItem>
            <SelectItem value="asc">{sort === "newest" ? "Oldest first" : "Lowest first"}</SelectItem>
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-pmin`} label={likes}>
        <Select
          value={values.pmin === undefined ? ANY : String(values.pmin)}
          onValueChange={(next) => onChange({ pmin: next === ANY ? undefined : Number(next) })}
        >
          <SelectTrigger id={`${idPrefix}-pmin`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any number</SelectItem>
            {TEXT_POST_MIN_STEPS.map((step) => (
              <SelectItem key={step} value={String(step)}>
                At least {formatCount(step)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
    </>
  )
}

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
      {/* "Small creators, big hits": the creators card's steps, on the videos (Tyler, 4 Nov 2026). */}
      <FilterRow id={`${idPrefix}-fmin`} label="Followers">
        <div className="grid grid-cols-2 gap-2">
          <FollowerSelect
            id={`${idPrefix}-fmin`}
            label="From"
            value={values.fmin ?? null}
            onChange={(next) => onChange({ fmin: next ?? undefined })}
          />
          <FollowerSelect
            id={`${idPrefix}-fmax`}
            label="Up to"
            value={values.fmax ?? null}
            onChange={(next) => onChange({ fmax: next ?? undefined })}
          />
        </div>
      </FilterRow>
    </>
  )
}

function FollowerSelect({
  id,
  noun = "Followers",
  label,
  value,
  onChange,
}: {
  id: string
  /** What the steps count, for a screen reader: "Followers from". */
  noun?: string
  label: string
  value: number | null
  onChange: (value: number | null) => void
}) {
  return (
    <Select value={value === null ? ANY : String(value)} onValueChange={(next) => onChange(next === ANY ? null : Number(next))}>
      <SelectTrigger id={id} aria-label={`${noun} ${label.toLowerCase()}`} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{label}: any</SelectItem>
        {SUBSCRIBER_STEPS.map((step) => (
          <SelectItem key={step} value={String(step)}>
            {label}: {formatCount(step)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
