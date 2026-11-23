import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { CalendarHeartIcon, HeartIcon, LayoutGridIcon, MessagesSquareIcon, type LucideIcon } from "lucide-react"

import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { useTabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { middleGutterClassName, MiddleHeading, PanelReopenButton, ThreePanels } from "@/components/shared/three-panels"
import { useWidgetLayout, type WidgetStore } from "@/components/shared/widgets/use-widget-layout"
import { ManageWidgetsProvider, WidgetSettings } from "@/components/shared/widgets/widget-menus"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { widgetsShown } from "@/lib/admin-dashboard/overview-widgets"
import {
  clearDeadMatchesNow,
  deleteMatchFact,
  dismissAiDraft,
  markManyMovedToText,
  markMovedToText,
  markNotOver,
  saveDatePlan,
  saveMatchFact,
  saveMatchNote,
  setAiDraftsHere,
  showThreeDrafts,
  tidyMyReply,
} from "@/lib/api/dating/chats"
import {
  answerAiQuestion,
  letAiDraftAgain,
  likeFromSecondLook,
  loadDatingDashboard,
  loadDatingMatch,
  loadDatingProfile,
  markDatingMatchSeen,
  readCardAgain,
  readCardInFront,
  readMatchesNow,
  readMyProfile,
  refreshConversation,
  reportScam,
  reviewMyProfile,
  sendFromPhone,
  startSwiping,
  stopSwiping,
  swipeCard,
  unmatchOnPhone,
  type DatingDashboard,
  type MatchDetail,
  type ProfileDetail,
} from "@/lib/api/dating/dashboard"
import { applyProfileSuggestion, startFirstPhotoTest, stopFirstPhotoTest, undoProfileApply } from "@/lib/api/dating/own-profile"
import {
  loadDatingPage,
  loadDatingWidgets,
  saveDatingHiddenSectionList,
  saveDatingSectionOrderList,
  saveDatingWidgetLayout,
} from "@/lib/api/dating/page"
import { resume } from "@/lib/api/dating/phone"
import { deleteProfile, loadProfileCounts, pickProfile, setProfilePaused } from "@/lib/api/dating/profiles"
import type { SavedView } from "@/lib/api/saved-views"
import { DATING_WIDGET_OFFER, type DatingSections } from "@/lib/dating/dating-page"
import { datingErrorMessage } from "@/lib/dating/errors"
import { changeKey } from "@/lib/dating/own-profile"
import { LEAD_TAB_WORDS, readLeadView, shownLeads, type LeadGroup, type LeadListItem, type LeadTab, type LeadView } from "@/lib/dating/leads"
import {
  DATING_APP_WORDS,
  DATING_PANEL_LAYOUT_KEY,
  DATING_PLACE_KEY,
  DATING_TWO_PANEL_LAYOUT_KEY,
  GOOGLE_RETURN_WORDS,
  type GoogleReturn,
} from "@/lib/dating/options"
import { useLoad } from "@/lib/hooks/use-load"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import type { StoredPage } from "@/lib/notes/page-body"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import type { DatingBlocks } from "./dating-blocks"
import { DatingOverview } from "./dating-overview"
import { DatingPagePanel } from "./dating-page-panel"
import { DatePlanDialog, type DatePlanTarget } from "./date-plan-dialog"
import { LeadList, type LeadRowAction } from "./lead-list"
import { LeadPanel, type LeadActions } from "./lead-panel"
import { MyProfilePanel } from "./my-profile-panel"
import { PhonePanel } from "./phone-panel"
import { PictureDialog } from "./picture-dialog"
import { NewProfileDialog } from "./profiles"

export type DatingSearch = LeadView & {
  /**
   * What the right panel shows: a lead, by its card's id or its chat's when
   * Date never read the card, or `phone` or `me` for the phone and the
   * member's own profile.
   */
  open?: string
  /** How coming back from Google Calendar's screen went; it opens the ⋮ where Google Calendar is. */
  google?: GoogleReturn
}

/** The right panel's two views that are not a lead, opened from the left page's blocks. */
const PANEL_VIEWS = ["phone", "me"] as const

/** While the phone or the AI is working, the dashboard looks again this often. */
const BUSY_EVERY_MS = 4_000
/** Otherwise, this often. */
const QUIET_EVERY_MS = 15_000
/** A lead read as the pointer headed for it is kept this long (part 7). */
const PREFETCH_FRESH_MS = 30_000

const SECTION_ICONS: Record<LeadTab, LucideIcon> = {
  overview: LayoutGridIcon,
  all: HeartIcon,
  matches: MessagesSquareIcon,
  dates: CalendarHeartIcon,
}

/** Where Overview's layout is read and saved: on the open profile's page row. */
const DATING_WIDGET_STORE: WidgetStore = {
  load: loadDatingWidgets,
  save: saveDatingWidgetLayout,
  message: datingErrorMessage,
}

type Loaded<T> = { id: string; value: T } | { id: string; error: string }
type Settled<T> = { value: T } | { error: string }

/**
 * The Dating dashboard at /admin/dating, in the Admin 3 panel design (task
 * "features/07-three-panel-design", Tyler, 18 Nov 2026: "Revamp the dating
 * dashboard to the new 3 panel design patters"), keeping Tyler's rule of
 * 20 Oct 2026: "the left panel summarizes, middle is a list of all the leads
 * and its status and right shows the profile and the chatbox is below it".
 *
 * - **Left:** the open profile's page of "/" blocks under its cover
 *   (`dating-page-panel.tsx`). Its fixed Dashboards block picks the section:
 *   Overview, Leads, Matches or Dates. Its ⋮ holds every Dating setting.
 * - **Middle:** Overview's widgets, straight on the page with no right panel,
 *   or the section's list with its one header.
 * - **Right:** the open lead, the phone or My profile. It always has
 *   something: on arrival the dashboard goes back to where it was, or opens
 *   the first lead ("RIght panel always has something").
 *
 * It reads everything again every few seconds while the phone or the AI is
 * busy, and every fifteen otherwise. The up and down arrows move through the
 * list as shown, and L or P likes or passes the open lead while it is not
 * swiped yet. It shows one profile (task "features/06-profiles"); switching
 * profile loads the whole page again.
 */
export function DatingWorkspace({ initial, views, search }: { initial: DatingDashboard; views: SavedView[]; search: DatingSearch }) {
  const navigate = useNavigate({ from: "/admin/dating" })
  const setView = useListSearchNavigate()
  const [data, setData] = React.useState(initial)
  const [profile, setProfile] = React.useState<Loaded<ProfileDetail> | null>(null)
  const [match, setMatch] = React.useState<Loaded<MatchDetail> | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [picture, setPicture] = React.useState<{ id: string; title: string; description?: string } | null>(null)
  const [planning, setPlanning] = React.useState<DatePlanTarget | null>(null)
  const [clearing, setClearing] = React.useState<LeadListItem[] | null>(null)
  const [unmatching, setUnmatching] = React.useState<LeadListItem | null>(null)
  const [newOpen, setNewOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState<{ leads: number; chats: number } | null>(null)
  const failing = React.useRef(false)
  const seen = React.useRef<string | null>(null)
  const leftMenu = useTabbedMenuState()
  const { openAt: openLeftMenuAt } = leftMenu
  const manageWidgets = React.useCallback(() => openLeftMenuAt("widgets"), [openLeftMenuAt])

  const view = readLeadView(search)
  const section: LeadTab = view.tab ?? "all"
  const overview = section === "overview"
  const shown = shownLeads(data.leads, view)
  // The rows as the list shows them, folded headings left out, and for which section.
  const [rows, setRows] = React.useState<{ section: LeadTab; ids: string[] } | null>(null)
  const reportRows = (ids: string[]) => setRows({ section, ids })
  const rowIds = rows?.section === section ? rows.ids : null

  // A link to My profile on a Facebook Dating profile, which has none (left out on 22 Oct 2026), opens the first lead instead.
  const panelView = PANEL_VIEWS.find((item) => item === search.open && !(item === "me" && data.profile.app === "facebook")) ?? null
  const lead = search.open && !panelView ? (data.leads.find((item) => item.id === search.open || item.matchId === search.open) ?? null) : null
  const openProfileId = lead?.profileId ?? null
  const openMatchId = lead?.matchId ?? null

  // Leads read as the pointer headed for them (part 7), so opening one draws
  // at once. Each read is kept for half a minute, then dropped.
  const [warm, setWarm] = React.useState<Record<string, Settled<ProfileDetail | MatchDetail>>>({})
  const asking = React.useRef(new Set<string>())
  const warmTimers = React.useRef(new Set<ReturnType<typeof setTimeout>>())
  React.useEffect(() => {
    const timers = warmTimers.current
    return () => timers.forEach((timer) => clearTimeout(timer))
  }, [])
  const prefetch = (leadId: string) => {
    const target = data.leads.find((item) => item.id === leadId)
    if (!target) return
    const reads: [string, () => Promise<ProfileDetail | MatchDetail>][] = []
    if (target.profileId) reads.push([`card:${target.profileId}`, () => loadDatingProfile(target.profileId as string)])
    if (target.matchId) reads.push([`chat:${target.matchId}`, () => loadDatingMatch(target.matchId as string)])
    for (const [key, read] of reads) {
      // One read per lead at a time, and none while the last is still kept.
      if (asking.current.has(key) || key in warm) continue
      asking.current.add(key)
      void settle(read())
        .then((result) => {
          setWarm((current) => ({ ...current, [key]: result }))
          const timer = setTimeout(() => {
            warmTimers.current.delete(timer)
            setWarm((current) => {
              const next = { ...current }
              delete next[key]
              return next
            })
          }, PREFETCH_FRESH_MS)
          warmTimers.current.add(timer)
        })
        .finally(() => asking.current.delete(key))
    }
  }

  const reload = React.useCallback(async () => {
    const [next, card, chat] = await Promise.all([
      loadDatingDashboard(),
      openProfileId ? settle(loadDatingProfile(openProfileId)) : null,
      openMatchId ? settle(loadDatingMatch(openMatchId)) : null,
    ])
    if (next.profile.id !== initial.profile.id) {
      openDashboard()
      return
    }
    setData(next)
    if (openProfileId && card) setProfile({ id: openProfileId, ...card })
    if (openMatchId && chat) setMatch({ id: openMatchId, ...chat })
  }, [openProfileId, openMatchId, initial.profile.id])

  const cardRead = openProfileId ? (profile?.id === openProfileId ? profile : (warm[`card:${openProfileId}`] as Settled<ProfileDetail> | undefined) ?? null) : null
  const chatRead = openMatchId ? (match?.id === openMatchId ? match : (warm[`chat:${openMatchId}`] as Settled<MatchDetail> | undefined) ?? null) : null
  const profileValue = cardRead && "value" in cardRead ? cardRead.value : null
  const matchValue = chatRead && "value" in chatRead ? chatRead.value : null
  const detailError = (cardRead && "error" in cardRead ? cardRead.error : null) ?? (chatRead && "error" in chatRead ? chatRead.error : null)
  const loading = Boolean(lead && ((openProfileId && !cardRead) || (openMatchId && !chatRead)))

  const active = Boolean(
    data.walks.current ||
      data.walks.waiting ||
      data.phone?.running ||
      profileValue?.aiBusy ||
      profileValue?.pendingSwipe ||
      matchValue?.aiBusy ||
      matchValue?.pending.length ||
      matchValue?.messages.some((message) => message.status === "sending")
  )
  const every = active ? BUSY_EVERY_MS : QUIET_EVERY_MS

  React.useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      reload()
        .then(
          () => {
            failing.current = false
          },
          (error: unknown) => {
            // Said once, not every few seconds while the server is away.
            if (live && !failing.current) showErrorToast(datingErrorMessage(error))
            failing.current = true
          }
        )
        .finally(() => {
          if (live) timer = setTimeout(tick, every)
        })
    }
    tick()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [reload, every])

  // Opening a chat reads it: its unread count goes back to none.
  React.useEffect(() => {
    if (!matchValue || seen.current === matchValue.id || matchValue.sample) return
    seen.current = matchValue.id
    if (matchValue.messages.length) void markDatingMatchSeen(matchValue.id).catch(() => {})
  }, [matchValue])

  async function act(key: string, work: () => Promise<unknown>): Promise<boolean> {
    setBusy(key)
    dismissErrorToast()
    try {
      await work()
      await reload().catch(() => {})
      return true
    } catch (error) {
      showErrorToast(datingErrorMessage(error))
      return false
    } finally {
      setBusy(null)
    }
  }

  /** A call whose answer the caller needs, with the same busy mark and error toast as `act`. */
  async function fetchIt<T>(key: string, work: () => Promise<T>): Promise<T | null> {
    setBusy(key)
    dismissErrorToast()
    try {
      return await work()
    } catch (error) {
      showErrorToast(datingErrorMessage(error))
      return null
    } finally {
      setBusy(null)
    }
  }

  /**
   * The open lead goes in the address with a history entry of its own, so
   * Back closes it rather than leaving the list. The arrow keys replace it,
   * so walking down the list is not a hundred Backs. Opened from Overview,
   * which has no right panel, it goes to Leads.
   */
  const openLead = React.useCallback(
    (id: string | undefined, replace = false) =>
      void navigate({
        search: (previous: DatingSearch) => {
          const next = { ...previous }
          if (next.tab === "overview") delete next.tab
          if (id) next.open = id
          else delete next.open
          return next
        },
        replace,
      }),
    [navigate]
  )

  /** A Dashboards row: the section's list keeps its filters, and a new section opens its first row. */
  const pickSection = (next: LeadTab) =>
    void navigate({
      search: (previous: DatingSearch) => {
        const moved: DatingSearch = { ...previous }
        delete moved.open
        if (next === "all") delete moved.tab
        else moved.tab = next
        return moved
      },
    })

  /** A Leads block row: narrows the list in place, or opens Leads narrowed from Overview; again lets go. */
  const pickGroup = (group: LeadGroup) => {
    if (overview) {
      void navigate({ search: (previous: DatingSearch) => ({ ...previous, tab: undefined, open: undefined, group }) })
      return
    }
    setView({ group: group === view.group ? undefined : group })
  }

  // Back from Google's screen: the ⋮ opens at General, where Google Calendar
  // is, set while rendering so the menu is there on the first paint.
  const [googleSeen, setGoogleSeen] = React.useState<GoogleReturn | undefined>(undefined)
  if (search.google && search.google !== googleSeen) {
    setGoogleSeen(search.google)
    openLeftMenuAt("general")
  }
  // Then how it went is said once, and the word leaves the address.
  const googleSaid = React.useRef<GoogleReturn | null>(null)
  React.useEffect(() => {
    if (!search.google || googleSaid.current === search.google) return
    googleSaid.current = search.google
    const back = GOOGLE_RETURN_WORDS[search.google]
    // A tick later: on a fresh page load the toaster starts listening after this effect.
    if (!back.ok) setTimeout(() => showErrorToast(back.words))
    void navigate({ search: (previous: DatingSearch) => ({ ...previous, google: undefined }), replace: true })
  }, [search.google, navigate])

  // A link naming the chat opens its lead under the lead's own id, so the place
  // kept for next time names a row of the list.
  const leadId = lead?.id
  React.useEffect(() => {
    if (leadId && search.open && leadId !== search.open) openLead(leadId, true)
  }, [leadId, search.open, openLead])

  // Not through `act`: the page loads again at once, so there is nothing to read again here.
  const switchProfile = (accountId: string) =>
    void fetchIt("pick", () => pickProfile(accountId)).then((done) => {
      if (done !== null) openDashboard()
    })

  const swipe = (decision: "like" | "pass") => {
    if (!profileValue) return
    void act("swipe", () => swipeCard(profileValue.id, decision))
  }
  const canSwipe = Boolean(profileValue && profileValue.swipe === "none" && !profileValue.pendingSwipe && profileValue.source !== "weekly" && busy !== "swipe")

  // The newest of each, so the one listener below never goes stale. The
  // arrows walk the rows as the list shows them.
  const order = rowIds ?? shown.map((item) => item.id)
  const openId = lead?.id ?? search.open
  const keys = React.useRef({ order, open: openId, canSwipe, swipe, openLead, overview })
  React.useEffect(() => {
    keys.current = { order, open: openId, canSwipe, swipe, openLead, overview }
  })
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      const { order: list, open, canSwipe: swipeable, swipe: doSwipe, openLead: go, overview: onOverview } = keys.current
      if (onOverview) return
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!list.length) return
        const at = list.indexOf(open ?? "")
        const next = event.key === "ArrowDown" ? Math.min(at + 1, list.length - 1) : Math.max(at - 1, 0)
        const target = list[at < 0 ? 0 : next]
        if (!target || target === open) return
        event.preventDefault()
        go(target, true)
      } else if ((event.key === "l" || event.key === "p") && swipeable) {
        event.preventDefault()
        doSwipe(event.key === "l" ? "like" : "pass")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // The left page, and the Dashboards block's hidden rows and order, each change saved in turn.
  const pageRead = useLoad(loadDatingPage, datingErrorMessage)
  const page = pageRead.data?.page ?? null
  const setPageRead = pageRead.setData
  const setPage = (next: StoredPage) => setPageRead((current) => (current ? { ...current, page: next } : current))
  const storedSections = React.useRef<DatingSections | null>(null)
  React.useEffect(() => {
    if (pageRead.data && !storedSections.current) storedSections.current = pageRead.data.sections
  }, [pageRead.data])
  const sectionsQueue = React.useRef<Promise<void>>(Promise.resolve())
  const saveSections = (change: Partial<DatingSections>, save: () => Promise<Partial<DatingSections>>) => {
    setPageRead((current) => (current ? { ...current, sections: { ...current.sections, ...change } } : current))
    sectionsQueue.current = sectionsQueue.current.then(async () => {
      try {
        const stored = await save()
        if (storedSections.current) storedSections.current = { ...storedSections.current, ...stored }
      } catch (error) {
        const kept = storedSections.current
        if (kept) setPageRead((current) => (current ? { ...current, sections: kept } : current))
        showErrorToast(datingErrorMessage(error))
      }
    })
  }

  const widgets = useWidgetLayout(DATING_WIDGET_STORE, null)

  const blocks: DatingBlocks = {
    data,
    section,
    onPickSection: pickSection,
    widgetCount: widgets.layout ? widgetsShown(widgets.layout) : null,
    sectionCounts: {
      all: shownLeads(data.leads, {}).length,
      matches: shownLeads(data.leads, { tab: "matches" }).length,
      dates: shownLeads(data.leads, { tab: "dates" }).length,
    },
    sections: pageRead.data?.sections ?? null,
    onHiddenSectionsChange: (hidden) => saveSections({ hidden }, async () => ({ hidden: await saveDatingHiddenSectionList(hidden) })),
    onSectionOrderChange: (sectionOrder) =>
      saveSections({ order: sectionOrder as DatingSections["order"] }, async () => ({ order: await saveDatingSectionOrderList(sectionOrder) })),
    group: view.group,
    onGroup: pickGroup,
    openId: lead?.id ?? search.open,
    onOpen: (id) => openLead(id),
    onPickProfile: switchProfile,
    onNewProfile: () => setNewOpen(true),
    onResumeProfile: () => void act("pause", () => setProfilePaused(false)),
    busy,
    onSecondLookLike: (cardId) => void act(`second-look:${cardId}`, () => likeFromSecondLook(cardId)),
  }

  const appName = DATING_APP_WORDS[data.profile.app].name
  const actions: LeadActions = {
    swipe,
    likeFromSecondLook: () => profileValue && void act(`second-look:${profileValue.id}`, () => likeFromSecondLook(profileValue.id)),
    readCardAgain: () => void act("read-again", () => readCardAgain(profileValue?.id ?? "")),
    refresh: () => void act("refresh", () => refreshConversation(matchValue?.id ?? "")),
    unmatch: () => act("unmatch", () => unmatchOnPhone(matchValue?.id ?? "")),
    movedToText: (moved) => void act("moved", () => markMovedToText(matchValue?.id ?? "", moved)),
    notOver: () => void act("not-over", () => markNotOver(matchValue?.id ?? "")),
    send: (text) => act("send", () => sendFromPhone(matchValue?.id ?? "", text)),
    showThree: () => void act("three", () => showThreeDrafts(matchValue?.id ?? "")),
    dismissDraft: () => void act("dismiss", () => dismissAiDraft(matchValue?.id ?? "")),
    tidy: async (text) => (await fetchIt("tidy", () => tidyMyReply(matchValue?.id ?? "", text)))?.text ?? null,
    saveFact: (factId, text) => act("fact", () => saveMatchFact(matchValue?.id ?? "", factId, text)),
    deleteFact: (factId) => act("fact", () => deleteMatchFact(matchValue?.id ?? "", factId)),
    setAiDrafts: (on) => void act("ai-drafts", () => setAiDraftsHere(matchValue?.id ?? "", on)),
    saveNote: async (note) => {
      try {
        await saveMatchNote(matchValue?.id ?? "", note)
        return true
      } catch (error) {
        showErrorToast(datingErrorMessage(error))
        return false
      }
    },
    planDate: () =>
      matchValue &&
      setPlanning({ matchId: matchValue.id, theirName: matchValue.theirName, dateAt: matchValue.dateAt, datePlace: matchValue.datePlace, sample: matchValue.sample }),
    answer: (answer) => act("answer", () => answerAiQuestion(matchValue?.id ?? "", answer)),
    letDraft: () => void act("let-draft", () => letAiDraftAgain(matchValue?.id ?? "")),
    openPicture: setPicture,
    report: () => act("report", () => reportScam(matchValue?.id ?? "")),
  }

  // A row's right-click (part 9), for its chat.
  const rowAction = (action: LeadRowAction, target: LeadListItem) => {
    const matchId = target.matchId
    if (!matchId) return
    if (action === "unmatch") setUnmatching(target)
    else if (action === "read-chat") void act("refresh", () => refreshConversation(matchId))
    else void act("moved", () => markMovedToText(matchId, action === "moved"))
  }

  const sectionLabel = LEAD_TAB_WORDS[section]
  const rightLabel = panelView === "phone" ? "Phone" : panelView === "me" ? "My profile" : "Lead"
  const rightShowLabel = panelView === "phone" ? "Show the phone" : panelView === "me" ? "Show my profile" : "Show the lead"
  let middle: React.ReactNode
  if (overview) {
    middle = widgets.layout ? (
      <DatingOverview
        data={data}
        layout={widgets.layout}
        busy={busy}
        onChange={widgets.change}
        onReadCard={() => void act("read-card", readCardInFront)}
        onReadChats={() => void act("read-matches", readMatchesNow)}
        onChangeHours={() => openLeftMenuAt("rules")}
      />
    ) : widgets.error ? (
      <ErrorRow message={widgets.error} onRetry={widgets.retry} />
    ) : null
  } else {
    middle = (
      <LeadList
        // A section's own list, so it reports its rows the moment it shows.
        key={section}
        data={data}
        leads={shown}
        view={view}
        views={views}
        openId={lead?.id ?? search.open}
        busy={busy}
        heading={<MiddleHeading icon={SECTION_ICONS[section]} label={sectionLabel} />}
        headingEnd={<PanelReopenButton side="right" label={rightShowLabel} />}
        onView={setView}
        onOpen={(id) => openLead(id)}
        onRows={reportRows}
        onPrefetch={prefetch}
        onResume={() => void act("resume", () => resume())}
        onOpenPicture={setPicture}
        onMovedToText={async (ids) => {
          const result = await fetchIt("mass", () => markManyMovedToText(ids))
          if (!result) return false
          await reload().catch(() => {})
          return true
        }}
        onClearDead={(ticked) => setClearing(ticked)}
        onRowAction={rowAction}
        onStartOrStop={(run) => void act("loop", run ? startSwiping : stopSwiping)}
      />
    )
  }

  return (
    // The left page's cover carries on behind the right panel.
    <RightCoverProvider value={page?.coverUrl ?? null}>
      <ManageWidgetsProvider value={manageWidgets}>
        <ThreePanels
          // Overview is two panels, with a layout of its own.
          layoutKey={overview ? DATING_TWO_PANEL_LAYOUT_KEY : DATING_PANEL_LAYOUT_KEY}
          // The phone and My profile go last, so the first lead still opens first, and coming back to either reopens it.
          place={{
            key: `${DATING_PLACE_KEY}:${data.profile.id}`,
            search,
            ids: overview ? [] : [...order, ...PANEL_VIEWS],
            ready: overview || rowIds !== null,
            section,
          }}
          showMiddleFor={`${section}|${view.group ?? ""}`}
          showRightFor={overview ? undefined : search.open}
          reopenInHeader={!overview}
          left={{
            label: "Page",
            showLabel: "Show the page",
            content: (
              <DatingPagePanel
                data={data}
                page={page}
                error={pageRead.error}
                onRetry={pageRead.retry}
                blocks={blocks}
                onPageChange={setPage}
                menu={leftMenu}
                widgetsTab={
                  <WidgetSettings
                    offer={DATING_WIDGET_OFFER}
                    layout={widgets.layout}
                    error={widgets.error}
                    onRetry={widgets.retry}
                    onChange={widgets.change}
                  />
                }
                busy={busy}
                onPickProfile={switchProfile}
                onRenamed={() => void reload().catch(() => {})}
                onPause={(paused) => void act("pause", () => setProfilePaused(paused))}
                onNewProfile={() => {
                  leftMenu.onOpenChange(false)
                  setNewOpen(true)
                }}
                onDelete={() => {
                  leftMenu.onOpenChange(false)
                  void fetchIt("counts", () => loadProfileCounts(data.profile.id)).then((counts) => {
                    if (counts) setDeleting(counts)
                  })
                }}
              />
            ),
          }}
          middle={{
            label: sectionLabel,
            bare: overview,
            content: (
              // The container its table measures, so its columns drop out as the middle narrows.
              <div className={cn("@container flex h-full min-h-0 flex-col overflow-hidden", !overview && cn("bg-card", middleGutterClassName))}>{middle}</div>
            ),
          }}
          right={
            overview
              ? undefined
              : {
                  label: rightLabel,
                  showLabel: rightShowLabel,
                  content:
                    panelView === "phone" ? (
                      <PhonePanel data={data} onChanged={() => void reload().catch(() => {})} />
                    ) : panelView === "me" ? (
                      <MyProfilePanel
                        own={data.own}
                        busy={busy}
                        onReadAgain={() => void act("read-own", readMyProfile)}
                        onReviewAgain={() => void act("review", reviewMyProfile)}
                        onApply={(what) => void act(`apply:${changeKey(what)}`, () => applyProfileSuggestion(what))}
                        onUndo={() => void act("undo", undoProfileApply)}
                        onStartTest={() => void act("photo-test", startFirstPhotoTest)}
                        onStopTest={() => act("photo-test", stopFirstPhotoTest)}
                      />
                    ) : (
                      <LeadPanel
                        app={data.profile.app}
                        lead={lead}
                        missing={Boolean(search.open && !lead)}
                        loading={loading}
                        error={detailError}
                        profile={profileValue}
                        match={matchValue}
                        automate={data.settings.automate}
                        secondLook={Boolean(lead?.profileId && data.secondLook.some((card) => card.id === lead.profileId))}
                        busy={busy}
                        actions={actions}
                      />
                    ),
                }
          }
        >
          <PictureDialog picture={picture} onClose={() => setPicture(null)} />
          <NewProfileDialog open={newOpen} copyFrom={data.profile.name} onClose={() => setNewOpen(false)} onMade={switchProfile} />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => !open && setDeleting(null)}
            title={`Delete ${data.profile.name}?`}
            description={`Its ${countWords(deleting?.leads ?? 0, "lead")} and ${countWords(deleting?.chats ?? 0, "chat")} go with it, with its settings and its Google Calendar link${data.phone ? `, and ${data.phone.name} is unpaired` : ""}. Nothing changes on the app itself. This can't be undone.`}
            confirmLabel="Delete profile"
            loading={busy === "delete"}
            onConfirm={() =>
              void fetchIt("delete", () => deleteProfile(data.profile.id)).then((done) => {
                if (done !== null) openDashboard()
              })
            }
          />
          <ConfirmDialog
            open={unmatching !== null}
            onOpenChange={(open) => !open && setUnmatching(null)}
            title={`Unmatch ${unmatching?.name ?? ""}?`}
            description={
              unmatching?.sample
                ? "This is a sample, so nothing is sent to a phone."
                : `The phone opens your chat with ${unmatching?.name ?? "them"} and unmatches through ${appName}'s own menu. It cannot undo an unmatch.`
            }
            confirmLabel="Unmatch"
            loading={busy === "unmatch"}
            onConfirm={() => {
              const matchId = unmatching?.matchId
              if (!matchId) return
              void act("unmatch", () => unmatchOnPhone(matchId)).then((ok) => ok && setUnmatching(null))
            }}
          />
          <DatePlanDialog
            target={planning}
            busy={busy === "plan"}
            onClose={() => setPlanning(null)}
            onSave={async (plan) => {
              if (!planning) return false
              if (planning.sample) {
                return true
              }
              const saved = await fetchIt("plan", () => saveDatePlan(planning.matchId, plan.dateAt, plan.place))
              if (!saved) return false
              if (saved.googleWords.startsWith("Saved in Date, but")) showErrorToast(saved.googleWords)
              await reload().catch(() => {})
              return true
            }}
          />
          <ConfirmDialog
            open={clearing !== null}
            onOpenChange={(open) => !open && setClearing(null)}
            title={`Unmatch the dead ones of ${clearing?.length ?? 0} ${clearing?.length === 1 ? "chat" : "chats"}?`}
            description={`Only a chat with no message either way in 30 days is unmatched; the rest are left as they are. The phone unmatches each one through ${appName}'s own menu, one at a time. An unmatch cannot be undone.`}
            confirmLabel="Unmatch the dead ones"
            loading={busy === "clear-dead"}
            onConfirm={() => {
              const ids = (clearing ?? []).flatMap((item) => (item.matchId ? [item.matchId] : []))
              void fetchIt("clear-dead", () => clearDeadMatchesNow(ids)).then(async (result) => {
                if (!result) return
                setClearing(null)
                await reload().catch(() => {})
              })
            }}
          >
            <ScrollArea className="max-h-60">
              <ul className="grid gap-1 pr-3 text-sm">
                {(clearing ?? []).map((item) => (
                  <li key={item.id} className="truncate font-medium">
                    {item.name}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </ConfirmDialog>
        </ThreePanels>
      </ManageWidgetsProvider>
    </RightCoverProvider>
  )
}

/**
 * The dashboard from the top, for another profile: the whole page loads
 * again, so it opens on that profile's own last place.
 */
function openDashboard() {
  window.location.assign("/admin/dating")
}

function countWords(count: number, one: string): string {
  return `${count} ${count === 1 ? one : `${one}s`}`
}

/** A key pressed while typing belongs to the box, not to the list. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || Boolean(target.closest("[role='dialog'],[role='menu'],[role='listbox']"))
}

/** A detail's answer or its error, so one lead that is gone never stops the dashboard refreshing. */
async function settle<T>(work: Promise<T>): Promise<Settled<T>> {
  try {
    return { value: await work }
  } catch (error) {
    return { error: datingErrorMessage(error) }
  }
}
