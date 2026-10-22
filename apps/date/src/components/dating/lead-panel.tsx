import * as React from "react"
import {
  BadgeCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FlagIcon,
  HeartIcon,
  ImageIcon,
  Loader2Icon,
  MessageSquareShareIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  ScanSearchIcon,
  ShieldAlertIcon,
  UserRoundIcon,
  UserRoundXIcon,
  XIcon,
} from "lucide-react"

import { DashboardCardHeader, DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import type { MatchDetail, ProfileDetail } from "@/lib/api/dating/dashboard"
import { formatClockTime } from "@/lib/format/format-time"
import { CHAT_TREND_WORDS } from "@/lib/dating/chat-trend"
import type { LeadListItem } from "@/lib/dating/leads"
import { CARD_FLAG_WORDS, DATING_APP_WORDS, MATCH_FLAG_WORDS, MESSAGE_STATUS_WORDS, WALK_WORDS, type DatingApp } from "@/lib/dating/options"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

import { DateBriefCard, FactTags } from "./chat-cards"
import { LeadAvatar } from "./lead-avatar"
import { StatusPill } from "./lead-status"
import { DatingPicture } from "./picture"
import { ReplyBox, type ReplyActions } from "./reply-box"
import { nameAndAge, swipeWords, whenWords } from "./words"

export type LeadActions = ReplyActions & {
  swipe: (decision: "like" | "pass") => void
  readCardAgain: () => void
  refresh: () => void
  /** Resolves true when the unmatch was put on the phone's list. */
  unmatch: () => Promise<boolean>
  /** Moved to text, or its Undo. */
  movedToText: (moved: boolean) => void
  notOver: () => void
  saveFact: (factId: string | null, text: string) => Promise<boolean>
  deleteFact: (factId: string) => Promise<boolean>
  planDate: () => void
  answer: (answer: string) => Promise<boolean>
  letDraft: () => void
  openPicture: (picture: { id: string; title: string; description?: string }) => void
  /** Resolves true when the report was put on the phone's list. */
  report: () => Promise<boolean>
}

/**
 * The Dating dashboard's right panel: the open lead, with the profile on top
 * and the chat below it (Tyler, 20 Oct 2026: "right shows the profile and the
 * chatbox is below it"), since split into three tabs in its header: Chat, for
 * a lead with a chat, then Profile and AI analysis (Tyler, the same day: "Put
 * profile and ai into its own tab", "dont need the chat in ai tab", "put
 * profile on its own trab", "chat tab first"). The tabs are drawn the way
 * Settings → Styling → Dashboard tabs says, then comes a "…" menu with the
 * chat's own changes. There is no ×: the right panel always shows something.
 *
 * Under the header: the lead's mini profile on a light grey band (letter,
 * name, age, when the card was read, the status pill, and Like and Pass while
 * the card is not swiped), then the tab picked. Profile holds Before your date
 * once they said yes, their photos, every line Tinder showed and what they
 * told you. AI analysis holds the score, the AI's read and its view of the
 * chat. Chat holds the conversation with the reply area pinned under it. The
 * tab picked stays while other leads are opened; Chat picked on a lead with no
 * chat shows Profile.
 */
export function LeadPanel({
  app,
  lead,
  missing,
  loading,
  error,
  profile,
  match,
  automate,
  busy,
  actions,
}: {
  /** The open profile's app, for its name in words. */
  app: DatingApp
  lead: LeadListItem | null
  /** The address names a lead that is not in the list any more. */
  missing: boolean
  loading: boolean
  error: string | null
  profile: ProfileDetail | null
  match: MatchDetail | null
  automate: boolean
  busy: string | null
  actions: LeadActions
}) {
  const [tab, setTab] = React.useState<LeadTab>("chat")
  if (!lead) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <DashboardCardTitleHeader icon={<UserRoundIcon className="size-4" />} title={missing ? "This lead is not here" : "Lead"} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <UserRoundIcon className="size-6" aria-hidden />
          <p>{missing ? "It may have been cleared. Pick another lead in the list." : "Click a lead to see their profile and chat here."}</p>
        </div>
      </div>
    )
  }

  // Chat comes first and opens first (Tyler, 20 Oct 2026: "chat tab first"). It
  // is only there for a lead with a chat; on a card, Profile shows instead.
  const shownTab: LeadTab = tab === "chat" && !match ? "profile" : tab
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LeadHeader app={app} lead={lead} profile={profile} match={match} tab={shownTab} onTab={setTab} busy={busy} actions={actions} />
      {error ? (
        <div className="grid justify-items-start gap-3 p-3 text-sm text-muted-foreground">
          <p>{error}</p>
        </div>
      ) : loading ? (
        <LoadingRow label={`Opening ${lead.name}`} />
      ) : (
        <>
          <OpeningRow lead={lead} profile={profile} busy={busy} actions={actions} />
          <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4">
              {shownTab === "profile" ? (
                <>
                  {match ? (
                    <DateBriefCard
                      match={match}
                      onPlan={actions.planDate}
                      onOpenPhoto={(id) => actions.openPicture({ id, title: match.theirName })}
                    />
                  ) : null}
                  <ProfileBox key={lead.id} app={app} lead={lead} profile={profile} match={match} actions={actions} />
                </>
              ) : shownTab === "ai" ? (
                <AiAnalyzed app={app} profile={profile} match={match} busy={busy} actions={actions} />
              ) : match ? (
                <Chat app={app} match={match} busy={busy} actions={actions} />
              ) : null}
            </div>
          </ScrollArea>
          {match ? (
            // Hidden rather than gone on the other tabs, so words typed but not sent are still there back on Chat.
            <div className={shownTab === "chat" ? undefined : "hidden"}>
              <ReplyBox key={match.id} match={match} automate={automate} busy={busy} actions={actions} />
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

type LeadTab = "profile" | "ai" | "chat"

function LeadHeader({
  app,
  lead,
  profile,
  match,
  tab,
  onTab,
  busy,
  actions,
}: {
  app: DatingApp
  lead: LeadListItem
  profile: ProfileDetail | null
  match: MatchDetail | null
  tab: LeadTab
  onTab: (tab: LeadTab) => void
  busy: string | null
  actions: LeadActions
}) {
  const [confirming, setConfirming] = React.useState(false)
  const live = match && !match.unmatchedAt
  return (
    <>
      <DashboardCardHeader>
        <DashboardTabs
          value={tab}
          onValueChange={(next) => onTab(next === "ai" || next === "chat" ? next : "profile")}
          tabs={[
            ...(match ? [{ value: "chat", label: "Chat" }] : []),
            { value: "profile", label: "Profile" },
            { value: "ai", label: "AI analysis" },
          ]}
        />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {profile || match ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label={`More for ${lead.name}`}>
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {profile && !profile.sample ? (
                  <DropdownMenuItem onSelect={actions.readCardAgain}>
                    <ScanSearchIcon />
                    {profile.score === null ? "Have the AI read the card" : "Have the AI read the card again"}
                  </DropdownMenuItem>
                ) : null}
                {match ? (
                  <DropdownMenuItem onSelect={actions.refresh}>
                    <RefreshCwIcon /> Read the chat again from the phone
                  </DropdownMenuItem>
                ) : null}
                {live ? (
                  <DropdownMenuItem onSelect={() => actions.movedToText(!match.movedToTextAt)}>
                    <MessageSquareShareIcon />
                    {match.movedToTextAt ? `Back on ${DATING_APP_WORDS[app].name}` : "Moved to text"}
                  </DropdownMenuItem>
                ) : null}
                {live ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
                      <UserRoundXIcon /> Unmatch
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </DashboardCardHeader>
      {match ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Unmatch ${match.theirName}?`}
          description={
            match.sample
              ? "This is a sample, so nothing is sent to a phone."
              : `The phone opens your chat with ${match.theirName} and unmatches through ${DATING_APP_WORDS[app].name}'s own menu. It cannot undo an unmatch.`
          }
          confirmLabel="Unmatch"
          loading={busy === "unmatch"}
          onConfirm={() => {
            void actions.unmatch().then((ok) => ok && setConfirming(false))
          }}
        />
      ) : null}
    </>
  )
}

/**
 * The lead's mini profile under the tabs, as Tyler's mock of 20 Oct 2026 has
 * it, on a light grey band (Tyler, the same day: "the mini profile up top
 * needs to have light gray bg"): their letter, name and age, when the card
 * was read, and the status pill on the right. Like and Pass sit under it while the card is not
 * swiped. It stays put while the tab below scrolls.
 */
function OpeningRow({ lead, profile, busy, actions }: { lead: LeadListItem; profile: ProfileDetail | null; busy: string | null; actions: LeadActions }) {
  // Facebook's weekly surprise match is a match already, never swiped.
  const swipeable = Boolean(profile && profile.swipe === "none" && !profile.pendingSwipe && profile.source !== "weekly")
  const line = profile ? `Read ${whenWords(profile.readAt)}` : `Matched ${whenWords(lead.changedAt)}`
  return (
    <div className="grid gap-3 border-b bg-muted/50 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <LeadAvatar name={lead.name} />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="truncate font-semibold">{nameAndAge(lead.name, lead.age ?? profile?.age ?? null)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {line}
            {lead.sample ? " · Sample" : ""}
          </p>
        </div>
        <StatusPill status={lead.status} />
      </div>
      {swipeable ? (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="flex-1" disabled={busy === "swipe"} onClick={() => actions.swipe("pass")} aria-keyshortcuts="P">
            <XIcon /> Pass
          </Button>
          <Button type="button" size="sm" className="flex-1" disabled={busy === "swipe"} onClick={() => actions.swipe("like")} aria-keyshortcuts="L">
            {busy === "swipe" ? <Loader2Icon className="animate-spin" /> : <HeartIcon />} Like
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The Profile tab: photos, every line Tinder showed, and what they told you.
 * The profile has the tab to itself (Tyler, 20 Oct 2026: "put profile on its
 * own trab"), so it always shows whole.
 */
function ProfileBox({
  app,
  lead,
  profile,
  match,
  actions,
}: {
  app: DatingApp
  lead: LeadListItem
  profile: ProfileDetail | null
  match: MatchDetail | null
  actions: LeadActions
}) {
  const [index, setIndex] = React.useState(0)
  const photos = profile?.photoIds.length ? profile.photoIds : match?.profile?.photoIds.length ? match.profile.photoIds : match?.photoId ? [match.photoId] : []
  const count = photos.length
  const shown = Math.min(index, Math.max(count - 1, 0))
  const open = (photo: number) => actions.openPicture({ id: photos[photo], title: `${lead.name}'s photo ${photo + 1} of ${count}` })
  const lines = profile
    ? [
        profile.distance,
        profile.job,
        profile.school,
        profile.livesIn ? `Lives in ${profile.livesIn}` : "",
        profile.handles.instagram ? `Instagram ${profile.handles.instagram}` : "",
        profile.handles.anthem ? `Anthem: ${profile.handles.anthem}` : "",
        profile.handles.spotifyArtists?.length ? `Top Spotify artists: ${profile.handles.spotifyArtists.join(", ")}` : "",
      ].filter(Boolean)
    : []
  const sections = profile?.sections.filter((section) => section.heading !== "About me" && section.items.length) ?? []

  return (
    <Shrinks>
      {count ? (
        <div className="grid gap-2">
          <div className="relative">
            <button
              type="button"
              className={cn("block w-full overflow-hidden rounded-lg", focusRing)}
              onClick={() => open(shown)}
              aria-label={`Open ${lead.name}'s photo ${shown + 1} of ${count} full size`}
            >
              <DatingPicture pictureId={photos[shown]} alt={`${lead.name}, photo ${shown + 1}`} className="aspect-[3/4] w-full" />
            </button>
            {count > 1 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="absolute top-1/2 left-2 -translate-y-1/2 bg-background/80"
                  aria-label="Previous photo"
                  onClick={() => setIndex((shown - 1 + count) % count)}
                >
                  <ChevronLeftIcon />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="absolute top-1/2 right-2 -translate-y-1/2 bg-background/80"
                  aria-label="Next photo"
                  onClick={() => setIndex((shown + 1) % count)}
                >
                  <ChevronRightIcon />
                </Button>
                <span className="absolute right-2 bottom-2 rounded-md bg-background/80 px-1.5 text-xs tabular-nums">
                  {shown + 1} of {count}
                </span>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{profile?.photosForgotten ? "Photos deleted after 30 days." : "No photos were kept."}</p>
      )}

      {profile ? (
        <div className="grid gap-2 text-sm">
          {profile.verified ? (
            <Badge variant="secondary" className="justify-self-start">
              <BadgeCheckIcon /> Photo verified
            </Badge>
          ) : null}
          {lines.length ? (
            <ul className="grid gap-1 text-muted-foreground">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {profile.bio ? <p className="leading-relaxed whitespace-pre-line">{profile.bio}</p> : <p className="text-muted-foreground">No bio.</p>}
          {sections.length ? (
            <dl className="grid gap-3">
              {sections.map((section) => (
                <div key={section.heading} className="grid gap-0.5">
                  <dt className="text-xs font-medium text-muted-foreground">{section.heading}</dt>
                  <dd>{section.items.join(" · ")}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Date did not read {lead.name}'s card, so there is only the chat, on the Chat tab.</p>
      )}

      {profile ? <FacebookExtras app={app} name={lead.name} profile={profile} onOpenPicture={actions.openPicture} /> : null}

      {match ? <FactTags key={`facts:${match.id}`} match={match} onSave={actions.saveFact} onDelete={actions.deleteFact} /> : null}

      {profile ? <SwipeLine profile={profile} /> : null}
    </Shrinks>
  )
}

/**
 * What Facebook Dating shows beside the profile (task "facebook/01"): the
 * comment they sent with their like and the one ours carried, the weekly
 * match, Second Look, mutual friends and shared groups, Instagram pictures,
 * and the same person met on another of the member's profiles. Each line
 * shows only when there is something to say, so a Tinder card shows none.
 */
function FacebookExtras({
  app,
  name,
  profile,
  onOpenPicture,
}: {
  app: DatingApp
  name: string
  profile: ProfileDetail
  onOpenPicture: LeadActions["openPicture"]
}) {
  const lines = [
    profile.source === "likes_you" ? (profile.theirComment ? `Liked you first, and wrote on your ${profile.theirCommentOn || "profile"}: "${profile.theirComment}"` : "Liked you first.") : "",
    profile.source === "weekly" ? `${DATING_APP_WORDS[app].name}'s weekly surprise match.` : "",
    profile.likeComment ? `Your like said: "${profile.likeComment}"${profile.likeCommentOn && profile.likeCommentOn !== "photo" ? `, on "${profile.likeCommentOn}"` : ", on a photo"}.` : "",
    profile.secondLookAt ? `Liked from Second Look ${whenWords(profile.secondLookAt)}, after the AI passed.` : "",
    profile.mutualFriends ? `${profile.mutualFriends} mutual friend${profile.mutualFriends === 1 ? "" : "s"}${profile.mutualNames.length ? `: ${profile.mutualNames.join(", ")}` : ""}.` : "",
    profile.sharedGroups.length ? `Groups you share: ${profile.sharedGroups.join(", ")}.` : "",
  ].filter(Boolean)
  const seen = profile.seenOn
  if (!lines.length && !profile.instagramPhotoIds.length && !seen) return null
  return (
    <div className="grid gap-2 text-sm">
      {seen ? (
        <p className={cn("rounded-md border px-3 py-2", (seen.outcome === "matched" || seen.outcome === "chatted") && profile.swipe === "none" && "font-medium")}>
          {`You met ${name} on ${seen.profileName}: ${SEEN_WORDS[seen.outcome]}.`}
          {seen.outcome === "matched" || seen.outcome === "chatted" ? (profile.swipe === "none" ? " Like or Pass is yours; the AI leaves it." : "") : seen.outcome === "passed" ? " The AI passes here too." : ""}
        </p>
      ) : null}
      {lines.length ? (
        <ul className="grid gap-1 text-muted-foreground">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {profile.instagramPhotoIds.length ? (
        <div className="grid gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">From their Instagram</p>
          <div className="grid grid-cols-3 gap-1.5">
            {profile.instagramPhotoIds.map((id, index) => (
              <button
                key={id}
                type="button"
                className={cn("block overflow-hidden rounded-md", focusRing)}
                aria-label={`Open ${name}'s Instagram picture ${index + 1} full size`}
                onClick={() => onOpenPicture({ id, title: `${name}'s Instagram picture ${index + 1}` })}
              >
                <DatingPicture pictureId={id} alt="" className="aspect-square w-full" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

const SEEN_WORDS = { passed: "you passed them there", liked: "you liked them there", matched: "you matched there", chatted: "you chatted there" } as const

/**
 * A box's contents in one column that may shrink. A grid grows to its
 * widest child, so a long line would otherwise push the box past the
 * panel's edge.
 */
function Shrinks({ children }: { children: React.ReactNode }) {
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">{children}</div>
}

/** Who swiped the card and when, a swipe on its way, or that a sample's swipe sends nothing. */
function SwipeLine({ profile }: { profile: ProfileDetail }) {
  if (profile.swipe !== "none") {
    return (
      <p className="text-xs text-muted-foreground">
        {swipeWords(profile.swipe, profile.swipedBy)}
        {profile.swipedAt ? ` at ${whenWords(profile.swipedAt)}` : ""}.
      </p>
    )
  }
  if (profile.pendingSwipe) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" />
        {profile.pendingSwipe === "super" ? "Super Like" : profile.pendingSwipe === "like" ? "Like" : "Pass"} sent to the phone. It swipes once it has checked {profile.name} is
        still in front.
      </p>
    )
  }
  return (
    <p className="text-xs text-muted-foreground">
      {profile.sample ? "A sample card: Like and Pass send nothing." : "Not swiped. Like and Pass sit under the name, or press L or P."}
    </p>
  )
}

/** The Ai analyzed tab: what the AI thinks of the card, and of the chat once there is one. */
function AiAnalyzed({
  app,
  profile,
  match,
  busy,
  actions,
}: {
  app: DatingApp
  profile: ProfileDetail | null
  match: MatchDetail | null
  busy: string | null
  actions: LeadActions
}) {
  const [answer, setAnswer] = React.useState("")
  const [reporting, setReporting] = React.useState(false)
  const answerId = React.useId()
  const score = profile?.score ?? match?.profile?.score ?? null
  const read = profile?.read ?? match?.profile?.read ?? []
  const flags = profile?.flags ?? match?.profile?.flags ?? []
  return (
    <Shrinks>
      {score === null ? null : (
        <p className="text-2xl font-semibold tabular-nums">
          {score}
          <span className="text-sm font-normal text-muted-foreground"> out of 100{profile?.checkedTwice ? ", checked twice" : ""}</span>
        </p>
      )}
      {score === null ? (
        profile?.aiBusy ? (
          <p className="text-sm text-muted-foreground">
            <Loader2Icon className="mr-1.5 inline size-4 animate-spin" />
            The AI is reading this card.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {profile?.sample || match?.sample ? "A sample the AI has not read." : profile ? "Not read by the AI yet. It reads new cards on its next pass." : "The AI has only the chat."}
          </p>
        )
      ) : (
        <ul className="grid gap-1 text-sm leading-relaxed">
          {read.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {flags.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {flags.map((flag) => (
            <li key={flag} className="rounded-md border px-2 py-0.5 text-xs">
              {CARD_FLAG_WORDS[flag]}
            </li>
          ))}
        </ul>
      ) : null}
      {profile?.dealbreakers.length ? <p className="text-sm text-muted-foreground">Hits your dealbreakers: {profile.dealbreakers.join("; ")}.</p> : null}
      {profile?.aiError ? <p className="text-sm text-destructive">{profile.aiError}</p> : null}
      {match ? (
        <>
          <p className="text-sm text-muted-foreground">
            {match.messagesFromUs} sent by you, {match.messagesFromThem} by {match.theirName}.{" "}
            {match.dateProposedAt ? `A date was suggested ${whenWords(match.dateProposedAt)}.` : "No date suggested yet."}
          </p>
          <div className="grid gap-0.5 text-sm">
            <p className="font-medium">{CHAT_TREND_WORDS[match.trend.trend]}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {match.trend.reason.replace(/^[^:]+:\s*/, "")}
              {match.trend.trend === "too_early" ? "" : " Times are when Date saw each message."}
            </p>
          </div>
          {match.flagged === "missing_fact" ? (
            <form
              className="grid gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                void actions.answer(answer).then((ok) => ok && setAnswer(""))
              }}
            >
              <Label htmlFor={answerId}>{match.askQuestion || "The AI needs a fact about you."}</Label>
              <Textarea id={answerId} value={answer} onChange={(event) => setAnswer(event.target.value)} rows={1} />
              <p className="text-xs text-muted-foreground">Your answer is added to About me in the Dating settings, then the AI drafts again.</p>
              <Button type="submit" size="sm" className="justify-self-start" disabled={busy === "answer"}>
                {busy === "answer" ? <Loader2Icon className="animate-spin" /> : null}
                Answer
              </Button>
            </form>
          ) : match.flagged ? (
            <div className="grid gap-2">
              <p className="flex gap-2 text-sm">
                <FlagIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {MATCH_FLAG_WORDS[match.flagged]}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={actions.letDraft}>
                  Let the AI draft here again
                </Button>
                {match.canReport ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setReporting(true)}>
                    <ShieldAlertIcon /> Report and unmatch
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {match.reportedAt ? <p className="text-sm text-muted-foreground">Reported to {DATING_APP_WORDS[app].name} as a scam {whenWords(match.reportedAt)}.</p> : null}
          <ConfirmDialog
            open={reporting}
            onOpenChange={setReporting}
            title={`Report ${match.theirName} as a scam?`}
            description={
              match.sample
                ? "This is a sample, so nothing is sent to a phone."
                : `The phone reports ${match.theirName} to ${DATING_APP_WORDS[app].name} as a scam, then unmatches. Neither can be undone.`
            }
            confirmLabel="Report and unmatch"
            loading={busy === "report"}
            onConfirm={() => {
              void actions.report().then((ok) => ok && setReporting(false))
            }}
          />
        </>
      ) : null}
    </Shrinks>
  )
}

/**
 * The chat, as Tyler's mock of 20 Oct 2026 draws it: a line for each day,
 * theirs on the left with the time under it, ours on the right with "You" or
 * "AI" and the time, newest at the bottom.
 */
function Chat({ app, match, busy, actions }: { app: DatingApp; match: MatchDetail; busy: string | null; actions: LeadActions }) {
  const end = React.useRef<HTMLDivElement | null>(null)
  const newest = match.messages[match.messages.length - 1]?.id

  // The newest message in view whenever one arrives.
  React.useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
  }, [newest])

  return (
    <section className="grid gap-3" aria-label="Chat">
      {match.messages.length ? null : (
        <p className="text-sm text-muted-foreground">No messages yet. {match.sample ? "" : "The … menu reads the chat from the phone again."}</p>
      )}
      {match.messages.map((message, index) => {
        const ours = message.direction === "out"
        const at = message.sentAt ?? message.createdAt
        const before = match.messages[index - 1]
        const newDay = !before || dayWords(before.sentAt ?? before.createdAt) !== dayWords(at)
        return (
          <React.Fragment key={message.id}>
          {newDay ? <p className="text-center text-xs text-muted-foreground">{dayWords(at)}</p> : null}
          <div className={cn("flex flex-col gap-1", ours ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-line",
                ours ? "bg-foreground text-background" : "bg-muted",
                ours && message.status !== "sent" && "opacity-70"
              )}
            >
              {message.kind === "text" ? (
                message.text
              ) : (
                // A photo, voice note and the like: Date keeps that one came, not what it was.
                <span className="flex items-center gap-1.5 italic">
                  <ImageIcon className="size-3.5 shrink-0" aria-hidden />
                  {message.text}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span>
                {ours ? `${message.sentBy === "ai" ? "AI" : "You"} · ` : ""}
                {formatClockTime(at)}
              </span>
              {ours && message.status !== "sent" ? (
                <span className={cn(message.status === "failed" && "text-destructive")}>
                  · {MESSAGE_STATUS_WORDS[message.status]}
                  {message.error ? `. ${message.error}` : ""}
                </span>
              ) : null}
            </div>
          </div>
          </React.Fragment>
        )
      })}
      {match.unmatchedAt ? (
        <p className="text-center text-sm text-muted-foreground">
          {match.unmatchedBy === "them"
            ? `${match.theirName} unmatched you: ${DATING_APP_WORDS[app].name} showed them gone by ${whenWords(match.unmatchedAt)}.`
            : `You unmatched ${match.theirName} ${whenWords(match.unmatchedAt)}.`}
        </p>
      ) : null}
      {match.endedAt && !match.unmatchedAt ? (
        <Notice
          words={`The AI read this chat as over ${whenWords(match.endedAt)}${match.endedLine ? `, from "${match.endedLine}"` : ""}. It writes nothing here. Unmatching stays yours.`}
          action={{ label: "Not over", busy: busy === "not-over", onClick: actions.notOver }}
        />
      ) : null}
      {match.movedToTextAt && !match.unmatchedAt ? (
        <Notice
          words={`Moved to text ${whenWords(match.movedToTextAt)}. The AI writes nothing here, and the chat stays.`}
          action={{ label: "Undo", busy: busy === "moved", onClick: () => actions.movedToText(false) }}
        />
      ) : null}
      {match.pending.length ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          On the phone: {match.pending.map((kind) => WALK_WORDS[kind].toLowerCase()).join(", then ")}.
        </p>
      ) : null}
      <div ref={end} />
    </section>
  )
}

/** "Sat, 18 Oct", the day a message came, in the reader's own time zone. */
function dayWords(value: Date): string {
  return new Date(value).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(/^(\w+) /, "$1, ")
}

/** A line in the chat about its state, with the one button that changes it. */
function Notice({ words, action }: { words: string; action: { label: string; busy: boolean; onClick: () => void } }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-center text-sm text-muted-foreground">
      <span>{words}</span>
      <Button type="button" variant="outline" size="sm" disabled={action.busy} onClick={action.onClick}>
        {action.busy ? <Loader2Icon className="animate-spin" /> : null}
        {action.label}
      </Button>
    </div>
  )
}
