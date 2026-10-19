import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { HeartHandshakeIcon } from "lucide-react"
import { toast } from "sonner"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  askDate,
  clearDeadMatchesNow,
  deleteMatchFact,
  listDeadMatches,
  markMovedToText,
  markNotOver,
  redraftWithTone,
  saveDatePlan,
  saveMatchFact,
  saveMatchNote,
  setAiDraftsHere,
  showThreeDrafts,
  tidyMyReply,
  type DeadMatch,
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
  readMyProfile,
  refreshConversation,
  regenerateDraft,
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
import { resume } from "@/lib/api/dating/phone"
import { datingErrorMessage } from "@/lib/dating/errors"
import type { ListTab, ProfileFilter } from "@/lib/dating/options"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

import { DatingColumns } from "./columns"
import { ConversationView } from "./conversation-view"
import { DatePlanDialog, type DatePlanTarget } from "./date-plan-dialog"
import { DatingList } from "./dating-list"
import { DatingRail } from "./dating-rail"
import { PictureDialog } from "./picture-dialog"
import { ProfileView } from "./profile-view"
import { ScreenWindow } from "./screen-window"
import { whenWords } from "./words"

export type DatingSearch = {
  tab?: ListTab
  filter?: ProfileFilter
  /** The card open in the middle column. */
  profile?: string
  /** The conversation open in the middle column. */
  match?: string
}

/** While the phone or the AI is working, the dashboard looks again this often. */
const BUSY_EVERY_MS = 4_000
/** Otherwise, this often. */
const QUIET_EVERY_MS = 15_000

type Loaded<T> = { id: string; value: T } | { id: string; error: string }

/**
 * The Dating dashboard at /admin/dating, in three columns: cards and matches,
 * the one that is open, and the AI and the phone. What is open lives in the
 * address, so a reload keeps it.
 *
 * It reads everything again every few seconds while the phone or the AI is
 * busy, and every fifteen otherwise, so a swipe, a new message or a draft
 * shows up without a reload.
 */
export function DatingWorkspace({ initial, search }: { initial: DatingDashboard; search: DatingSearch }) {
  const navigate = useNavigate({ from: "/admin/dating" })
  const desktop = useWideScreen()
  const [data, setData] = React.useState(initial)
  const [profile, setProfile] = React.useState<Loaded<ProfileDetail> | null>(null)
  const [match, setMatch] = React.useState<Loaded<MatchDetail> | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [picture, setPicture] = React.useState<{ id: string; title: string; description?: string } | null>(null)
  const [screenOpen, setScreenOpen] = React.useState(false)
  const [planning, setPlanning] = React.useState<DatePlanTarget | null>(null)
  const [dead, setDead] = React.useState<DeadMatch[] | null>(null)
  const failing = React.useRef(false)
  const seen = React.useRef<string | null>(null)

  const openProfileId = search.profile ?? null
  const openMatchId = search.match ?? null
  const tab: ListTab = search.tab ?? (openMatchId ? "matches" : "profiles")
  const filter: ProfileFilter = search.filter ?? "all"

  const reload = React.useCallback(async () => {
    const [next, card, chat] = await Promise.all([
      loadDatingDashboard(),
      openProfileId ? settle(loadDatingProfile(openProfileId)) : null,
      openMatchId ? settle(loadDatingMatch(openMatchId)) : null,
    ])
    setData(next)
    if (openProfileId && card) setProfile({ id: openProfileId, ...card })
    if (openMatchId && chat) setMatch({ id: openMatchId, ...chat })
  }, [openProfileId, openMatchId])

  const profileNow = profile && profile.id === openProfileId ? profile : null
  const matchNow = match && match.id === openMatchId ? match : null
  const profileValue = profileNow && "value" in profileNow ? profileNow.value : null
  const matchValue = matchNow && "value" in matchNow ? matchNow.value : null

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

  // Opening a conversation reads it: its unread count goes back to none.
  React.useEffect(() => {
    if (!matchValue || !matchValue.id || seen.current === matchValue.id || matchValue.sample) return
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

  const go = (next: Partial<DatingSearch>) => void navigate({ search: (previous: DatingSearch) => ({ ...previous, ...next }) })
  const back = desktop ? null : () => go({ profile: undefined, match: undefined })

  const middle = openProfileId ? (
    profileValue ? (
      <ProfileView
        key={profileValue.id}
        profile={profileValue}
        back={back}
        busy={busy === "swipe"}
        onSwipe={(decision) =>
          void act("swipe", () => swipeCard(profileValue.id, decision), decision === "like" ? "Like sent to the phone." : "Pass sent to the phone.")
        }
        onOpenPhoto={setPicture}
      />
    ) : (
      <Missing what="card" error={profileNow && "error" in profileNow ? profileNow.error : null} onBack={() => go({ profile: undefined })} />
    )
  ) : openMatchId ? (
    matchValue ? (
      <ConversationView
        key={matchValue.id}
        match={matchValue}
        back={back}
        busy={busy}
        onRefresh={() => void act("refresh", () => refreshConversation(matchValue.id), "The phone will read this chat again.")}
        onUnmatch={() => act("unmatch", () => unmatchOnPhone(matchValue.id), `Unmatching ${matchValue.theirName} on the phone.`)}
        onMovedToText={(moved) =>
          void act("moved", () => markMovedToText(matchValue.id, moved), moved ? "Moved to text. The AI writes nothing more here." : "Back on Tinder. The AI drafts here again.")
        }
        onNotOver={() => void act("not-over", () => markNotOver(matchValue.id), "Not over. The AI drafts here again on its next pass.")}
      />
    ) : (
      <Missing what="conversation" error={matchNow && "error" in matchNow ? matchNow.error : null} onBack={() => go({ match: undefined })} />
    )
  ) : (
    <Welcome data={data} />
  )

  return (
    <DatingColumns
      open={Boolean(openProfileId || openMatchId)}
      leftLabel="Show the cards and matches"
      rightLabel="Show the AI and the phone"
      left={
        <DatingList
          data={data}
          tab={tab}
          filter={filter}
          openProfileId={openProfileId}
          openMatchId={openMatchId}
          busy={busy}
          onTab={(next) => go({ tab: next })}
          onFilter={(next) => go({ filter: next === "all" ? undefined : next })}
          onOpenProfile={(id) => go({ profile: id, match: undefined, tab: "profiles" })}
          onOpenMatch={(id) => go({ match: id, profile: undefined, tab: tab === "dates" ? "dates" : "matches" })}
          onReadCard={() => void act("read-card", readCardInFront, "The phone will read the profile on screen.")}
          onReadMatches={() => void act("read-matches", readMatchesNow, "The phone will read the chats.")}
          onAsk={(question) => fetchIt("ask", () => askDate(question))}
          onClearDead={() =>
            void fetchIt("dead", listDeadMatches).then((list) => {
              if (!list) return
              if (!list.length) toast.success("No dead matches: every match has had a message in the last 30 days.")
              else setDead(list)
            })
          }
        />
      }
      middle={middle}
      right={
        <DatingRail
          data={data}
          profile={profileValue}
          match={matchValue}
          busy={busy}
          actions={{
            send: (text) => act("send", () => sendFromPhone(matchValue?.id ?? "", text), "Sent to the phone. It types and sends it now."),
            regenerate: () => void act("regenerate", () => regenerateDraft(matchValue?.id ?? ""), "The AI wrote a new draft."),
            showThree: () => void act("three", () => showThreeDrafts(matchValue?.id ?? ""), "Three drafts. Pick one, change it, then Send."),
            tone: (tone) => void act(`tone:${tone}`, () => redraftWithTone(matchValue?.id ?? "", tone), "The AI wrote it again."),
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
            readCardAgain: () => void act("read-again", () => readCardAgain(profileValue?.id ?? ""), "The AI read the card again."),
            readCard: () => void act("read-card", readCardInFront, "The phone will read the profile on screen."),
            startOrStop: (run) => void act("loop", run ? startSwiping : stopSwiping, run ? "Swiping started." : "Swiping stopped."),
            resume: () => void act("resume", () => resume(data.phone?.id ?? ""), "Resumed. The phone looks at Tinder again now."),
            openScreen: () => setScreenOpen(true),
            readMyProfile: () => void act("read-own", readMyProfile, "The phone will read your profile."),
            reviewMyProfile: () => void act("review", reviewMyProfile, "The AI reviewed your profile again."),
            openPicture: setPicture,
          }}
        />
      }
    >
      <PictureDialog picture={picture} onClose={() => setPicture(null)} />
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
        open={dead !== null}
        onOpenChange={(open) => !open && setDead(null)}
        title={`Unmatch ${dead?.length ?? 0} dead ${dead?.length === 1 ? "match" : "matches"}?`}
        description="Nobody has written in these chats for 30 days. The phone unmatches each one through Tinder's own menu, one at a time. Tinder cannot undo an unmatch."
        confirmLabel="Unmatch them all"
        loading={busy === "clear-dead"}
        onConfirm={() => {
          const ids = (dead ?? []).map((match) => match.id)
          void fetchIt("clear-dead", () => clearDeadMatchesNow(ids)).then(async (result) => {
            if (!result) return
            setDead(null)
            toast.success(result.words)
            await reload().catch(() => {})
          })
        }}
      >
        <ScrollArea className="max-h-60">
          <ul className="grid gap-1 pr-3 text-sm">
            {(dead ?? []).map((match) => (
              <li key={match.id} className="flex justify-between gap-3">
                <span className="truncate font-medium">{match.theirName}</span>
                <span className="shrink-0 text-muted-foreground">last {whenWords(match.lastAt)}</span>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </ConfirmDialog>
      {screenOpen && data.phone ? <ScreenWindow phone={data.phone} onClose={() => setScreenOpen(false)} /> : null}
    </DatingColumns>
  )
}

/** A detail's answer or its error, so one card that is gone never stops the dashboard refreshing. */
async function settle<T>(work: Promise<T>): Promise<{ value: T } | { error: string }> {
  try {
    return { value: await work }
  } catch (error) {
    return { error: datingErrorMessage(error) }
  }
}

function Missing({ what, error, onBack }: { what: string; error: string | null; onBack: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardTitleHeader icon={<HeartHandshakeIcon className="size-4" />} title={error ? `This ${what} is not here` : `Opening the ${what}`} />
      {error ? (
        <div className="grid justify-items-start gap-3 p-3 text-sm text-muted-foreground">
          <p>{error}</p>
          <Button type="button" variant="outline" onClick={onBack}>
            Back to the list
          </Button>
        </div>
      ) : (
        <LoadingRow label={`Opening the ${what}`} />
      )}
    </div>
  )
}

function Welcome({ data }: { data: DatingDashboard }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardTitleHeader icon={<HeartHandshakeIcon className="size-4" />} title="Dating" />
      <div className="grid max-w-xl gap-3 p-3 text-sm leading-relaxed text-muted-foreground">
        <p>Pick a card or a conversation on the left. It opens here, and what the AI thinks of it, with the reply it drafted, opens on the right.</p>
        {data.phone?.paired ? (
          <p>
            Start, on the right, lets the AI read cards and like or pass them by your rules, at a person's pace, with the phone in your pocket. It stops at
            Stop, at a limit, or at a Tinder screen that needs you.
          </p>
        ) : (
          <p>No phone is paired yet. The Phone screen, under Dating in the left menu, pairs one and can add sample cards to look around first.</p>
        )}
      </div>
    </div>
  )
}
