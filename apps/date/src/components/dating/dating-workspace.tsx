import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { ThreePanels } from "@/components/shared/three-panels"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  loadDatingDashboard,
  loadDatingMatch,
  loadDatingProfile,
  markDatingMatchSeen,
  readCardAgain,
  readCardInFront,
  readMatchesNow,
  likeFromSecondLook,
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
import { resume } from "@/lib/api/dating/phone"
import { deleteProfile, loadProfileCounts, pickProfile, setProfilePaused } from "@/lib/api/dating/profiles"
import type { SavedView } from "@/lib/api/saved-views"
import { datingErrorMessage } from "@/lib/dating/errors"
import { changeKey } from "@/lib/dating/own-profile"
import { readLeadView, shownLeads, type LeadListItem, type LeadView } from "@/lib/dating/leads"
import { DATING_APP_WORDS, DATING_PANEL_LAYOUT_KEY, DATING_PLACE_KEY, GOOGLE_RETURN_WORDS, type GoogleReturn } from "@/lib/dating/options"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

import { DatePlanDialog, type DatePlanTarget } from "./date-plan-dialog"
import { DatingSettingsDialog } from "./dating-settings-dialog"
import { LeadList } from "./lead-list"
import { LeadPanel, type LeadActions } from "./lead-panel"
import { LeadSummary } from "./lead-summary"
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
  /** How coming back from Google Calendar's screen went; it opens the settings window once. */
  google?: GoogleReturn
}

/** The right panel's two views that are not a lead, opened from the left panel. */
const PANEL_VIEWS = ["phone", "me"] as const

/** While the phone or the AI is working, the dashboard looks again this often. */
const BUSY_EVERY_MS = 4_000
/** Otherwise, this often. */
const QUIET_EVERY_MS = 15_000

type Loaded<T> = { id: string; value: T } | { id: string; error: string }

/**
 * The Dating dashboard at /admin/dating, on the shell's three panels (Tyler,
 * 20 Oct 2026: "the left panel summarizes, middle is a list of all the leads
 * and its status and right shows the profile and the chatbox is below it").
 * The list's view and the open lead live in the address, so a reload keeps
 * them, and the dashboard goes back to where it was and opens the first lead
 * on arrival ("RIght panel always has something").
 *
 * It reads everything again every few seconds while the phone or the AI is
 * busy, and every fifteen otherwise, so a swipe, a new message or a draft
 * shows up without a reload. The up and down arrows move through the list,
 * and L or P likes or passes the open lead while it is not swiped yet.
 *
 * It shows one profile (task "features/06-profiles"), and each profile
 * remembers its own place. Switching profile loads the whole page again, the
 * way the shell's site switcher does, so nothing of the last profile stays on
 * screen; so does a switch made on another device or tab, because the server
 * acts on the profile picked.
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
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [newOpen, setNewOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState<{ leads: number; chats: number } | null>(null)
  const failing = React.useRef(false)
  const seen = React.useRef<string | null>(null)

  const view = readLeadView(search)
  const shown = shownLeads(data.leads, view)
  // A link from the Calendar screen or Ask Date names the chat, which is the same lead as its card.
  // A Facebook Dating profile has no My profile (left out on 22 Oct 2026), so a link to it opens the lead list's first lead instead.
  const panelView = PANEL_VIEWS.find((item) => item === search.open && !(item === "me" && data.profile.app === "facebook")) ?? null
  const lead = search.open && !panelView ? (data.leads.find((item) => item.id === search.open || item.matchId === search.open) ?? null) : null
  const openProfileId = lead?.profileId ?? null
  const openMatchId = lead?.matchId ?? null

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

  const profileNow = profile && profile.id === openProfileId ? profile : null
  const matchNow = match && match.id === openMatchId ? match : null
  const profileValue = profileNow && "value" in profileNow ? profileNow.value : null
  const matchValue = matchNow && "value" in matchNow ? matchNow.value : null
  const detailError = (profileNow && "error" in profileNow ? profileNow.error : null) ?? (matchNow && "error" in matchNow ? matchNow.error : null)
  const loading = Boolean(lead && ((openProfileId && !profileNow) || (openMatchId && !matchNow)))

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
      reload().then(
        () => {
          failing.current = false
        },
        (error: unknown) => {
          // Said once, not every few seconds while the server is away.
          if (live && !failing.current) showErrorToast(datingErrorMessage(error))
          failing.current = true
        }
      ).finally(() => {
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

  async function act(key: string, work: () => Promise<unknown>, success?: string): Promise<boolean> {
    setBusy(key)
    dismissErrorToast()
    try {
      await work()
      if (success) toast.success(success)
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
   * so walking down the list is not a hundred Backs.
   */
  const openLead = React.useCallback(
    (id: string | undefined, replace = false) =>
      void navigate({
        search: (previous: DatingSearch) => {
          const next = { ...previous }
          if (id) next.open = id
          else delete next.open
          return next
        },
        replace,
      }),
    [navigate]
  )

  // Back from Google's screen: the settings open where Google Calendar is,
  // set while rendering so the window is there on the first paint.
  const [googleSeen, setGoogleSeen] = React.useState<GoogleReturn | undefined>(undefined)
  if (search.google && search.google !== googleSeen) {
    setGoogleSeen(search.google)
    setSettingsOpen(true)
  }
  // Then how it went is said once, and the word leaves the address.
  const googleSaid = React.useRef<GoogleReturn | null>(null)
  React.useEffect(() => {
    if (!search.google || googleSaid.current === search.google) return
    googleSaid.current = search.google
    const back = GOOGLE_RETURN_WORDS[search.google]
    // A tick later: on a fresh page load the toaster starts listening after this effect.
    setTimeout(() => (back.ok ? toast.success(back.words) : showErrorToast(back.words)))
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
    void act("swipe", () => swipeCard(profileValue.id, decision), decision === "like" ? "Like sent to the phone." : "Pass sent to the phone.")
  }
  const canSwipe = Boolean(profileValue && profileValue.swipe === "none" && !profileValue.pendingSwipe && profileValue.source !== "weekly" && busy !== "swipe")

  // The newest of each, so the one listener below never goes stale.
  const openId = lead?.id ?? search.open
  const keys = React.useRef({ shown, open: openId, canSwipe, swipe, openLead })
  React.useEffect(() => {
    keys.current = { shown, open: openId, canSwipe, swipe, openLead }
  })
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      const { shown: list, open, canSwipe: swipeable, swipe: doSwipe, openLead: go } = keys.current
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!list.length) return
        const at = list.findIndex((item) => item.id === open)
        const next = event.key === "ArrowDown" ? Math.min(at + 1, list.length - 1) : Math.max(at - 1, 0)
        const target = list[at < 0 ? 0 : next]
        if (!target || target.id === open) return
        event.preventDefault()
        go(target.id, true)
      } else if ((event.key === "l" || event.key === "p") && swipeable) {
        event.preventDefault()
        doSwipe(event.key === "l" ? "like" : "pass")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const appName = DATING_APP_WORDS[data.profile.app].name
  const actions: LeadActions = {
    swipe,
    readCardAgain: () => void act("read-again", () => readCardAgain(profileValue?.id ?? ""), "The AI read the card again."),
    refresh: () => void act("refresh", () => refreshConversation(matchValue?.id ?? ""), "The phone will read this chat again."),
    unmatch: () => act("unmatch", () => unmatchOnPhone(matchValue?.id ?? ""), `Unmatching ${matchValue?.theirName ?? ""} on the phone.`),
    movedToText: (moved) =>
      void act("moved", () => markMovedToText(matchValue?.id ?? "", moved), moved ? "Moved to text. The AI writes nothing more here." : `Back on ${appName}. The AI drafts here again.`),
    notOver: () => void act("not-over", () => markNotOver(matchValue?.id ?? ""), "Not over. The AI drafts here again on its next pass."),
    send: (text) => act("send", () => sendFromPhone(matchValue?.id ?? "", text), "Sent to the phone. It types and sends it now."),
    showThree: () => void act("three", () => showThreeDrafts(matchValue?.id ?? ""), "Three drafts. Step through them with Next, then Use this."),
    dismissDraft: () => void act("dismiss", () => dismissAiDraft(matchValue?.id ?? ""), "Draft dismissed. The AI writes another once they send something new."),
    tidy: async (text) => (await fetchIt("tidy", () => tidyMyReply(matchValue?.id ?? "", text)))?.text ?? null,
    saveFact: (factId, text) => act("fact", () => saveMatchFact(matchValue?.id ?? "", factId, text)),
    deleteFact: (factId) => act("fact", () => deleteMatchFact(matchValue?.id ?? "", factId)),
    setAiDrafts: (on) =>
      void act("ai-drafts", () => setAiDraftsHere(matchValue?.id ?? "", on), on ? "The AI drafts here again." : "You have this chat. The AI writes nothing here."),
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
    answer: (answer) => act("answer", () => answerAiQuestion(matchValue?.id ?? "", answer), "Added to About me. The AI drafted again."),
    letDraft: () => void act("let-draft", () => letAiDraftAgain(matchValue?.id ?? ""), "The AI drafts here again on its next pass."),
    openPicture: setPicture,
    report: () => act("report", () => reportScam(matchValue?.id ?? ""), `Reporting ${matchValue?.theirName ?? ""} and unmatching on the phone.`),
  }

  return (
    <ThreePanels
      layoutKey={DATING_PANEL_LAYOUT_KEY}
      // The phone and My profile go last, so the first lead still opens first, and coming back to either reopens it.
      place={{ key: `${DATING_PLACE_KEY}:${data.profile.id}`, search, ids: [...shown.map((item) => item.id), ...PANEL_VIEWS] }}
      showMiddleFor={`${view.tab ?? ""}|${view.group ?? ""}`}
      showRightFor={search.open}
      left={{
        label: "Summary",
        showLabel: "Show the summary",
        content: (
          <LeadSummary
            data={data}
            group={view.group}
            busy={busy}
            onGroup={(group) => setView({ group: group === view.group ? undefined : group })}
            onStartOrStop={(run) => void act("loop", run ? startSwiping : stopSwiping, run ? "Swiping started." : "Swiping stopped.")}
            onReadCard={() => void act("read-card", readCardInFront, "The phone will read the profile on screen.")}
            onReadChats={() => void act("read-matches", readMatchesNow, "The phone will read the chats.")}
            openId={search.open}
            onOpen={(id) => openLead(id)}
            onOpenSettings={() => setSettingsOpen(true)}
            onPickProfile={switchProfile}
            onNewProfile={() => setNewOpen(true)}
            onResumeProfile={() => void act("pause", () => setProfilePaused(false), "Resumed. The profile runs again; Start or its schedule starts swiping.")}
            onSecondLookLike={(id, name) => void act(`second-look:${id}`, () => likeFromSecondLook(id), `The phone opens Second Look and likes ${name}.`)}
            onChangeHours={() => setSettingsOpen(true)}
          />
        ),
      }}
      middle={{
        label: "Leads",
        content: (
          <LeadList
            data={data}
            leads={shown}
            view={view}
            views={views}
            openId={lead?.id ?? search.open}
            busy={busy}
            onView={setView}
            onOpen={(id) => openLead(id)}
            onResume={() => void act("resume", () => resume(), `Resumed. The phone looks at ${appName} again now.`)}
            onOpenPicture={setPicture}
            onMovedToText={async (ids) => {
              const result = await fetchIt("mass", () => markManyMovedToText(ids))
              if (!result) return false
              toast.success(result.words)
              await reload().catch(() => {})
              return true
            }}
            onClearDead={(ticked) => setClearing(ticked)}
          />
        ),
      }}
      right={{
        label: "Lead",
        showLabel: "Show the lead",
        content: panelView === "phone" ? (
          <PhonePanel data={data} onChanged={() => void reload().catch(() => {})} />
        ) : panelView === "me" ? (
          <MyProfilePanel
            own={data.own}
            busy={busy}
            onReadAgain={() => void act("read-own", readMyProfile, "The phone will read your profile.")}
            onReviewAgain={() => void act("review", reviewMyProfile, "The AI reviewed your profile again.")}
            onApply={(what) => void act(`apply:${changeKey(what)}`, () => applyProfileSuggestion(what), "The phone will make this change, then read your profile back to check it.")}
            onUndo={() => void act("undo", undoProfileApply, "The phone will put back what was there before.")}
            onStartTest={() => void act("photo-test", startFirstPhotoTest, "The test has started. The phone puts photo 1 first to begin week 1.")}
            onStopTest={() => act("photo-test", stopFirstPhotoTest, "The test is stopped. The phone puts your old order back.")}
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
            busy={busy}
            actions={actions}
          />
        ),
      }}
    >
      <PictureDialog picture={picture} onClose={() => setPicture(null)} />
      <DatingSettingsDialog
        open={settingsOpen}
        profile={data.profile}
        busy={busy}
        onClose={() => setSettingsOpen(false)}
        onRenamed={() => void reload().catch(() => {})}
        onPause={(paused) =>
          void act(
            "pause",
            () => setProfilePaused(paused),
            paused ? "Paused. No swiping, replies or AI on this profile until Resume." : "Resumed. The profile runs again; Start or its schedule starts swiping."
          )
        }
        onDelete={() =>
          void fetchIt("counts", () => loadProfileCounts(data.profile.id)).then((counts) => {
            if (!counts) return
            setSettingsOpen(false)
            setDeleting(counts)
          })
        }
      />
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
      <DatePlanDialog
        target={planning}
        busy={busy === "plan"}
        onClose={() => setPlanning(null)}
        onSave={async (plan) => {
          if (!planning) return false
          if (planning.sample) {
            toast.success("This is a sample, so nothing was saved.")
            return true
          }
          const saved = await fetchIt("plan", () => saveDatePlan(planning.matchId, plan.dateAt, plan.place))
          if (!saved) return false
          if (saved.googleWords.startsWith("Saved in Date, but")) showErrorToast(saved.googleWords)
          else toast.success([plan.dateAt ? "Date saved." : "Time cleared.", saved.googleWords].filter(Boolean).join(" "))
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
            toast.success(result.words)
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
async function settle<T>(work: Promise<T>): Promise<{ value: T } | { error: string }> {
  try {
    return { value: await work }
  } catch (error) {
    return { error: datingErrorMessage(error) }
  }
}
