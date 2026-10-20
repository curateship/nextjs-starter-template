import * as React from "react"
import { Link } from "@tanstack/react-router"
import { FlagIcon, Layers3Icon, Loader2Icon, MonitorSmartphoneIcon, PlayIcon, ScanSearchIcon, SendIcon, SparklesIcon, SquareIcon, TriangleAlertIcon, Undo2Icon, WandSparklesIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { InspectorCard, InspectorCollapseAllButton, InspectorCollapseAllProvider, useInspectorCollapseAll } from "@/components/shared/inspector-card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { DatingDashboard, MatchDetail, ProfileDetail } from "@/lib/api/dating/dashboard"
import { CHAT_TREND_WORDS } from "@/lib/dating/chat-trend"
import { BAND_NEEDS_LIKES, CARD_FLAG_WORDS, DRAFT_TONES, MATCH_FLAG_WORDS, OPENER_STYLE_WORDS, STOP_REASON_WORDS, WALK_WORDS, type DraftTone } from "@/lib/dating/options"

import { ChatSettingsCard, DateBriefCard, FactsCard } from "./chat-cards"
import { DatingPicture } from "./picture"
import { dollars, whenWords } from "./words"

export type RailActions = {
  send: (text: string) => Promise<boolean>
  regenerate: () => void
  showThree: () => void
  tone: (tone: DraftTone) => void
  /** The member's words tidied into their voice, or null when it failed (the toast says why). */
  tidy: (text: string) => Promise<string | null>
  saveFact: (factId: string | null, text: string) => Promise<boolean>
  deleteFact: (factId: string) => Promise<boolean>
  setAiDrafts: (on: boolean) => void
  saveNote: (note: string) => Promise<boolean>
  planDate: () => void
  answer: (answer: string) => Promise<boolean>
  letDraft: () => void
  readCardAgain: () => void
  startOrStop: (run: boolean) => void
  readCard: () => void
  resume: () => void
  openScreen: () => void
  readMyProfile: () => void
  reviewMyProfile: () => void
  openPicture: (picture: { id: string; title: string; description?: string }) => void
}

/**
 * The right column: what the AI thinks of the open card or match, the reply
 * box, the phone, the swiping loop, the member's own profile and the daily
 * tally, each a card that shuts and is remembered shut.
 */
export function DatingRail({
  data,
  profile,
  match,
  busy,
  actions,
}: {
  data: DatingDashboard
  profile: ProfileDetail | null
  match: MatchDetail | null
  busy: string | null
  actions: RailActions
}) {
  const collapse = useInspectorCollapseAll()
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardTitleHeader
        icon={<SparklesIcon className="size-4" />}
        title="AI and phone"
        className="@container/rail"
        action={
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={data.phone?.running ? "outline" : "default"}
                  className="px-2 @[24rem]/rail:px-2.5"
                  aria-label={data.phone?.running ? "Stop" : "Start"}
                  disabled={busy === "loop"}
                  onClick={() => actions.startOrStop(!data.phone?.running)}
                >
                  {busy === "loop" ? <Loader2Icon className="animate-spin" /> : data.phone?.running ? <SquareIcon /> : <PlayIcon />}
                  <span className="hidden @[24rem]/rail:inline">{data.phone?.running ? "Stop" : "Start"}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{data.phone?.running ? "Stop the AI swiping" : "Let the AI read cards and like or pass them until Stop or a limit"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="px-2 @[24rem]/rail:px-2.5"
                  aria-label="Read profile"
                  disabled={busy === "read-card"}
                  onClick={actions.readCard}
                >
                  {busy === "read-card" ? <Loader2Icon className="animate-spin" /> : <ScanSearchIcon />}
                  <span className="hidden @[24rem]/rail:inline">Read profile</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reads the one profile on the phone now, without swiping</TooltipContent>
            </Tooltip>
            <InspectorCollapseAllButton nextOpen={collapse.nextOpen} onPress={() => collapse.setAll(collapse.nextOpen)} />
          </div>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <InspectorCollapseAllProvider signal={collapse.signal}>
          <div className="grid gap-3 p-3">
            {profile ? <ProfileThoughts profile={profile} busy={busy} onReadAgain={actions.readCardAgain} /> : null}
            {match ? <DateBriefCard match={match} onPlan={actions.planDate} onOpenPhoto={(id) => actions.openPicture({ id, title: match.theirName })} /> : null}
            {match ? <MatchThoughts match={match} busy={busy} onAnswer={actions.answer} onLetDraft={actions.letDraft} /> : null}
            {match ? (
              <ReplyCard
                key={`${match.id}:${match.draftMadeAt?.getTime() ?? 0}`}
                match={match}
                automate={data.settings.automate}
                drafts={data.drafts}
                busy={busy}
                actions={actions}
              />
            ) : null}
            {match ? <FactsCard key={`facts:${match.id}`} match={match} onSave={actions.saveFact} onDelete={actions.deleteFact} /> : null}
            {match ? <ChatSettingsCard key={`chat:${match.id}`} match={match} onAiDrafts={actions.setAiDrafts} onSaveNote={actions.saveNote} /> : null}
            <PhoneCard data={data} busy={busy} actions={actions} />
            <SwipingCard data={data} />
            <MyProfileCard data={data} busy={busy} actions={actions} />
            <TallyCard data={data} />
          </div>
        </InspectorCollapseAllProvider>
      </ScrollArea>
    </div>
  )
}

function Line({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
}

function ProfileThoughts({ profile, busy, onReadAgain }: { profile: ProfileDetail; busy: string | null; onReadAgain: () => void }) {
  return (
    <InspectorCard storageId="date-rail-ai-card" title="What the AI thinks">
      <div className="mt-3 grid gap-3">
        {profile.score === null ? (
          profile.aiBusy ? (
            <Line>
              <Loader2Icon className="mr-1.5 inline size-4 animate-spin" />
              The AI is reading this card.
            </Line>
          ) : (
            <Line>{profile.sample ? "A sample card the AI has not read." : "Not read by the AI yet. It reads new cards on its next pass."}</Line>
          )
        ) : (
          <>
            <p className="text-2xl font-semibold tabular-nums">
              {profile.score}
              <span className="text-sm font-normal text-muted-foreground"> out of 100{profile.checkedTwice ? ", checked twice" : ""}</span>
            </p>
            <ul className="grid gap-1 text-sm leading-relaxed">
              {profile.read.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {profile.flags.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {profile.flags.map((flag) => (
                  <li key={flag} className="rounded-md border px-2 py-0.5 text-xs">
                    {CARD_FLAG_WORDS[flag]}
                  </li>
                ))}
              </ul>
            ) : null}
            {profile.dealbreakers.length ? <Line>Hits your dealbreakers: {profile.dealbreakers.join("; ")}.</Line> : null}
          </>
        )}
        {profile.aiError ? <p className="text-sm text-destructive">{profile.aiError}</p> : null}
        {profile.sample ? null : (
          <Button type="button" variant="outline" className="justify-self-start" disabled={busy === "read-again"} onClick={onReadAgain}>
            {busy === "read-again" ? <Loader2Icon className="animate-spin" /> : null}
            {profile.score === null ? "Read now" : "Read again"}
          </Button>
        )}
      </div>
    </InspectorCard>
  )
}

function MatchThoughts({
  match,
  busy,
  onAnswer,
  onLetDraft,
}: {
  match: MatchDetail
  busy: string | null
  onAnswer: (answer: string) => Promise<boolean>
  onLetDraft: () => void
}) {
  const [answer, setAnswer] = React.useState("")
  const answerId = React.useId()
  return (
    <InspectorCard storageId="date-rail-ai-match" title="What the AI thinks">
      <div className="mt-3 grid gap-3">
        {match.profile?.score != null ? (
          <>
            <p className="text-sm">
              <span className="font-semibold tabular-nums">{match.profile.score}</span>
              <span className="text-muted-foreground"> out of 100 when the card was read.</span>
            </p>
            <ul className="grid gap-1 text-sm leading-relaxed">
              {match.profile.read.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        ) : (
          <Line>Date did not read {match.theirName}'s card, so the AI has only the conversation.</Line>
        )}
        <Line>
          {match.messagesFromUs} sent by you, {match.messagesFromThem} by {match.theirName}.{" "}
          {match.dateProposedAt ? `A date was suggested ${whenWords(match.dateProposedAt)}.` : "No date suggested yet."}
        </Line>
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
              void onAnswer(answer).then((ok) => ok && setAnswer(""))
            }}
          >
            <Label htmlFor={answerId}>{match.askQuestion || "The AI needs a fact about you."}</Label>
            <Textarea id={answerId} value={answer} onChange={(event) => setAnswer(event.target.value)} rows={1} />
            <p className="text-xs text-muted-foreground">Your answer is added to About me in Settings → Dating, then the AI drafts again.</p>
            <Button type="submit" className="justify-self-start" disabled={busy === "answer"}>
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
            <Button type="button" variant="outline" className="justify-self-start" onClick={onLetDraft}>
              Let the AI draft here again
            </Button>
          </div>
        ) : null}
      </div>
    </InspectorCard>
  )
}

const TONE_WORDS: Record<DraftTone, string> = { shorter: "Shorter", funnier: "Funnier", warmer: "Warmer" }

function draftLabel(match: MatchDetail): string {
  if (!match.draft) return "Your message"
  if (match.draftKind === "opener") return "The AI's first message, yours to change"
  if (match.draftKind === "nudge") return "The AI's one follow-up, yours to change"
  return "The AI's draft, yours to change"
}

/** Why the AI writes nothing here, when it does not. The member can still write and send. */
function quietWords(match: MatchDetail): string | null {
  if (match.aiOff) return "You took this chat over, so the AI writes nothing here."
  if (match.movedToTextAt) return `You moved this chat to text ${whenWords(match.movedToTextAt)}, so the AI writes nothing here.`
  if (match.endedAt) return "The AI read this chat as over, so it writes nothing here."
  return null
}

function ReplyCard({
  match,
  automate,
  drafts,
  busy,
  actions,
}: {
  match: MatchDetail
  automate: boolean
  drafts: DatingDashboard["drafts"]
  busy: string | null
  actions: RailActions
}) {
  const [text, setText] = React.useState(match.draft)
  // The member's own words from before a Tidy, for Undo.
  const [beforeTidy, setBeforeTidy] = React.useState<string | null>(null)
  const boxId = React.useId()
  const lastAi = [...match.messages].reverse().find((message) => message.direction === "out" && message.sentBy === "ai" && message.status === "sent")
  const automated = automate && Boolean(match.draft) && Boolean(match.draftSendAt)
  const quiet = quietWords(match)
  const aiCanWrite = !quiet

  if (match.unmatchedAt) {
    return (
      <InspectorCard storageId="date-rail-reply" title="Reply">
        <div className="mt-3">
          <Line>
            {match.unmatchedBy === "them"
              ? `${match.theirName} unmatched you: the chat is gone from Tinder. Nothing can be sent.`
              : `You unmatched ${match.theirName}, so nothing can be sent.`}
          </Line>
        </div>
      </InspectorCard>
    )
  }

  return (
    <InspectorCard storageId="date-rail-reply" title="Reply">
      <form
        className="mt-3 grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void actions.send(text).then((ok) => {
            if (!ok) return
            setText("")
            setBeforeTidy(null)
          })
        }}
      >
        {quiet ? <Line>{quiet}</Line> : null}
        <Label htmlFor={boxId}>{draftLabel(match)}</Label>
        <Textarea
          id={boxId}
          value={text}
          readOnly={automated}
          onChange={(event) => setText(event.target.value)}
          placeholder={match.aiBusy ? "The AI is writing…" : match.flagged || quiet ? "Write your own reply." : "Write a message, or wait for the AI's draft."}
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          {automated && match.draftSendAt
            ? `The AI sends this by itself at ${whenWords(match.draftSendAt)}. Switch automate off in Settings → Dating to send it yourself.`
            : `${text.trim().length} characters.${match.draftProposesDate && text.trim() === match.draft.trim() ? " This draft suggests meeting up." : ""}`}
        </p>
        {match.draftChoices.length && !automated ? (
          <div className="grid gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Or pick one of these</p>
            {[match.draft, ...match.draftChoices].map((choice, index) => (
              <button
                key={`${index}:${choice}`}
                type="button"
                aria-pressed={text.trim() === choice.trim()}
                className="rounded-md border bg-background px-2.5 py-2 text-left text-sm leading-snug hover:bg-muted/60 aria-pressed:border-primary"
                onClick={() => {
                  setText(choice)
                  setBeforeTidy(null)
                }}
              >
                {choice}
              </button>
            ))}
          </div>
        ) : null}
        {match.aiError ? <p className="text-sm text-destructive">{match.aiError}</p> : null}
        {lastAi && !match.draft ? <Line>Sent by AI at {whenWords(lastAi.sentAt)}.</Line> : null}
        <div className="flex flex-wrap gap-2">
          {automated ? null : (
            <Button type="submit" disabled={busy === "send"}>
              {busy === "send" ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
              Send from phone
            </Button>
          )}
          {automated ? null : beforeTidy !== null ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setText(beforeTidy)
                setBeforeTidy(null)
              }}
            >
              <Undo2Icon /> Undo tidy
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy === "tidy"}
                  onClick={() => {
                    const mine = text
                    void actions.tidy(mine).then((tidied) => {
                      if (tidied === null) return
                      setBeforeTidy(mine)
                      setText(tidied)
                    })
                  }}
                >
                  {busy === "tidy" ? <Loader2Icon className="animate-spin" /> : <WandSparklesIcon />}
                  Tidy
                </Button>
              </TooltipTrigger>
              <TooltipContent>Puts your own words in your voice, keeping what you meant. You see it before Send.</TooltipContent>
            </Tooltip>
          )}
        </div>
        {aiCanWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy === "regenerate"} onClick={actions.regenerate}>
              {busy === "regenerate" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              {match.draft ? "Regenerate" : "Draft with AI"}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" disabled={busy === "three"} onClick={actions.showThree}>
                  {busy === "three" ? <Loader2Icon className="animate-spin" /> : <Layers3Icon />}
                  Show 3
                </Button>
              </TooltipTrigger>
              <TooltipContent>Three different drafts to pick from. Automate only ever sends the first.</TooltipContent>
            </Tooltip>
            {match.draft
              ? DRAFT_TONES.map((tone) => (
                  <Button key={tone} type="button" variant="ghost" disabled={busy === `tone:${tone}`} onClick={() => actions.tone(tone)}>
                    {busy === `tone:${tone}` ? <Loader2Icon className="animate-spin" /> : null}
                    {TONE_WORDS[tone]}
                  </Button>
                ))
              : null}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {drafts.of
            ? `${drafts.unchanged} of your last ${drafts.of} drafts sent unchanged.`
            : "None of the AI's drafts sent yet. This counts how many go unchanged."}
        </p>
      </form>
    </InspectorCard>
  )
}

function PhoneCard({ data, busy, actions }: { data: DatingDashboard; busy: string | null; actions: RailActions }) {
  const phone = data.phone
  return (
    <InspectorCard storageId="date-rail-phone" title="Phone">
      <div className="mt-3 grid gap-3">
        {!phone ? (
          <Line>
            No phone is paired.{" "}
            <Link to="/admin/dating/phone" className="font-medium text-foreground underline underline-offset-4">
              Pair one on the Phone screen
            </Link>
            .
          </Line>
        ) : (
          <>
            <div className="grid gap-1 text-sm">
              <p className="font-medium">{phone.name}</p>
              <Line>
                {!phone.paired
                  ? "Unpaired."
                  : phone.here
                    ? `Here now${phone.batteryPercent !== null ? `, battery ${phone.batteryPercent}%` : ""}.`
                    : phone.lastSeenAt
                      ? `Away since ${whenWords(phone.lastSeenAt)}.`
                      : "Not heard from yet. Open the Date app on the phone."}
              </Line>
              <Line>
                {phone.inControl ? "Date is in control." : "Date is switched off on the Phone screen."}
                {phone.paired && !phone.phoneSwitchOn ? " Switched off on the phone itself." : ""}
              </Line>
              {phone.paired && !phone.tinderVersion && phone.lastSeenAt ? <Line>Tinder is not installed on it.</Line> : null}
            </div>
            {phone.stoppedReason ? (
              <div className="grid gap-2 rounded-md border bg-background p-3">
                <p className="flex gap-2 text-sm font-medium">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                  {STOP_REASON_WORDS[phone.stoppedReason]}.
                </p>
                {phone.stoppedWords ? <Line>{phone.stoppedWords}</Line> : null}
                {phone.stoppedPictureId ? (
                  <button
                    type="button"
                    className="justify-self-start overflow-hidden rounded-md border"
                    aria-label="See what Tinder showed"
                    onClick={() => actions.openPicture({ id: phone.stoppedPictureId as string, title: "What Tinder showed", description: STOP_REASON_WORDS[phone.stoppedReason as keyof typeof STOP_REASON_WORDS] })}
                  >
                    <DatingPicture pictureId={phone.stoppedPictureId} alt="" className="h-24 w-14" />
                  </button>
                ) : null}
                <Line>Nothing runs on the phone until you sort it out on the phone and press Resume.</Line>
                <Button type="button" className="justify-self-start" disabled={busy === "resume"} onClick={actions.resume}>
                  {busy === "resume" ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
                  Resume
                </Button>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={actions.openScreen}>
                <MonitorSmartphoneIcon /> Open screen window
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link to="/admin/dating/phone">Phone screen</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </InspectorCard>
  )
}

function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`
}

/** "$4.20 for 3 matches, $1.40 a match", or "no matches yet". */
function costWords(dollarsSpent: number, count: number, each: number | null, word: string, many: string): string {
  if (each === null) return `no ${many} yet`
  return `${dollars(dollarsSpent)} for ${plural(count, word, many)}, ${dollars(each)} a ${word}`
}

function discoveryWords(data: DatingDashboard): string {
  const { discovery, settings } = data
  const wanted = `${settings.maxDistanceKm} km, ages ${settings.ageMin} to ${settings.ageMax}`
  if (discovery.state === "setting") return `Setting Tinder to ${wanted} now.`
  if (discovery.state === "owed") return `Tinder is set to ${wanted} once the phone is free.`
  if (discovery.state === "set") return `Tinder set to ${discovery.distance}, ages ${discovery.ageMin} to ${discovery.ageMax}${discovery.at ? `, ${whenWords(discovery.at)}` : ""}.`
  if (discovery.state === "failed") return `Setting Tinder's distance and ages failed${discovery.at ? ` ${whenWords(discovery.at)}` : ""}: ${discovery.error} Change a setting or press Resume to try again.`
  return `Not set on Tinder yet. The phone sets ${wanted} once it is paired.`
}

function SwipingCard({ data }: { data: DatingDashboard }) {
  const phone = data.phone
  const { settings, hour, matchCost } = data
  const current = data.walks.current
  const lastFailed = data.walks.recent.find((walk) => walk.status === "failed")
  const scheduled = settings.scheduleStart !== null && settings.scheduleEnd !== null
  return (
    <InspectorCard storageId="date-rail-swiping" title="Swiping">
      <div className="mt-3 grid gap-3">
        {phone?.running ? (
          <Line>
            Running since {whenWords(phone.runningSince)}
            {phone.startedBy === "schedule" ? ", started by the schedule" : ""}. The AI swipes and drafts with the phone in your pocket until{" "}
            {phone.startedBy === "schedule" ? `${settings.scheduleEnd}:00, Stop or a limit` : "Stop or a limit"}.
          </Line>
        ) : phone?.stopWhy ? (
          <Line>
            Stopped{phone.stopWhyAt ? ` at ${whenWords(phone.stopWhyAt)}` : ""}: {phone.stopWhy}
          </Line>
        ) : (
          <Line>Start lets the AI read cards and like or pass them, at a person's pace, until Stop or a limit.</Line>
        )}
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Swipes today</dt>
          <dd className="tabular-nums">
            {hour.swipesToday} of {settings.swipesPerDay}
          </dd>
          <dt className="text-muted-foreground">Swipes this hour</dt>
          <dd className="tabular-nums">
            {hour.swipes} of {settings.swipesPerHour}
          </dd>
          <dt className="text-muted-foreground">Messages this hour</dt>
          <dd className="tabular-nums">
            {hour.messages} of {settings.messagesPerHour}
          </dd>
          <dt className="text-muted-foreground">AI spend this month</dt>
          <dd className="tabular-nums">
            {dollars(data.spendDollars)} of ${settings.spendCapDollars}
          </dd>
          <dt className="text-muted-foreground">Likes</dt>
          <dd>score {settings.likeAbove} or more</dd>
          <dt className="text-muted-foreground">Replies</dt>
          <dd>{settings.automate ? "the AI sends" : "you press Send"}</dd>
          <dt className="text-muted-foreground">Schedule</dt>
          <dd className="tabular-nums">{scheduled ? `${settings.scheduleStart}:00 to ${settings.scheduleEnd}:00` : "none"}</dd>
          <dt className="text-muted-foreground">Quiet hours</dt>
          <dd className="tabular-nums">
            {settings.quietStart === settings.quietEnd ? "none" : `${settings.quietStart}:00 to ${settings.quietEnd}:00`}
          </dd>
          <dt className="text-muted-foreground">A match costs</dt>
          <dd className="text-right tabular-nums">{costWords(matchCost.dollars, matchCost.matches, matchCost.perMatch, "match", "matches")}</dd>
          <dt className="text-muted-foreground">A date costs</dt>
          <dd className="text-right tabular-nums">{costWords(matchCost.dollars, matchCost.dates, matchCost.perDate, "date", "dates")}</dd>
        </dl>
        <Line>
          {data.learningFrom
            ? `Learning from ${data.learningFrom} of your swipes: the cards where you liked or passed against the AI's score.`
            : "Not learning from your swipes yet. Like or pass a card against the AI's score and it is shown as an example next time."}
        </Line>
        <Line>{discoveryWords(data)}</Line>
        {current ? (
          <Line>
            <Loader2Icon className="mr-1.5 inline size-4 animate-spin" />
            On the phone now: {WALK_WORDS[current.kind].toLowerCase()}
            {data.walks.waiting ? `, then ${data.walks.waiting} more` : ""}.
          </Line>
        ) : data.walks.waiting ? (
          <Line>{data.walks.waiting} waiting for the phone.</Line>
        ) : null}
        {lastFailed && !current ? (
          <p className="text-sm text-muted-foreground">
            Last problem, {whenWords(lastFailed.finishedAt)}: {WALK_WORDS[lastFailed.kind].toLowerCase()} failed. {lastFailed.error}
          </p>
        ) : null}
      </div>
    </InspectorCard>
  )
}

function MyProfileCard({ data, busy, actions }: { data: DatingDashboard; busy: string | null; actions: RailActions }) {
  const own = data.own
  return (
    <InspectorCard storageId="date-rail-my-profile" title="My profile">
      <div className="mt-3 grid gap-3">
        {!own ? (
          <Line>Your own Tinder profile has not been read yet. Reading it lets the AI suggest a photo order and a bio. Nothing on the profile is changed.</Line>
        ) : (
          <>
            <Line>Read {whenWords(own.readAt)}.</Line>
            {own.review ? (
              <>
                <div className="grid gap-2">
                  <p className="text-sm font-medium">Suggested photo order</p>
                  <ol className="grid gap-2">
                    {own.review.photoOrder.map((item, place) => {
                      const id = own.photoIds[item.photo - 1] ?? null
                      return (
                        <li key={`${item.photo}-${place}`} className="flex items-start gap-2 text-sm">
                          <DatingPicture pictureId={id} alt={`Your photo ${item.photo}`} className="h-14 w-10 shrink-0 rounded" />
                          <span>
                            <span className="font-medium">
                              {place + 1}. Now photo {item.photo}.
                            </span>{" "}
                            {item.why}
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                </div>
                <div className="grid gap-1">
                  <p className="text-sm font-medium">Suggested bio</p>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{own.review.bio}</p>
                </div>
                {own.review.notes.length ? (
                  <ul className="grid list-disc gap-1 pl-4 text-sm">
                    {own.review.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : own.aiError ? null : (
              <Line>The AI reviews it on its next pass.</Line>
            )}
            {own.aiError ? <p className="text-sm text-destructive">{own.aiError}</p> : null}
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy === "read-own"} onClick={actions.readMyProfile}>
            {busy === "read-own" ? <Loader2Icon className="animate-spin" /> : null}
            {own ? "Read it again" : "Read my profile"}
          </Button>
          {own ? (
            <Button type="button" variant="ghost" disabled={busy === "review"} onClick={actions.reviewMyProfile}>
              {busy === "review" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              Review again
            </Button>
          ) : null}
        </div>
      </div>
    </InspectorCard>
  )
}

function dayName(day: string, index: number): string {
  if (index === 0) return "Today"
  if (index === 1) return "Yesterday"
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
}

function TallyCard({ data }: { data: DatingDashboard }) {
  const [today, ...earlier] = data.tally
  return (
    <InspectorCard storageId="date-rail-tally" title="Daily tally">
      <Tabs defaultValue="days" className="mt-3 gap-3">
        <TabsList className="justify-start">
          <TabsTrigger value="days" className="flex-none">
            Days
          </TabsTrigger>
          <TabsTrigger value="openers" className="flex-none">
            Openers
          </TabsTrigger>
          <TabsTrigger value="working" className="flex-none">
            What's working
          </TabsTrigger>
        </TabsList>
        <TabsContent value="days" className="grid gap-3">
          {today ? (
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Swipes today</dt>
              <dd className="tabular-nums">{today.swipes}</dd>
              <dt className="text-muted-foreground">Likes</dt>
              <dd className="tabular-nums">{today.likes}</dd>
              <dt className="text-muted-foreground">Matches</dt>
              <dd className="tabular-nums">{today.matches}</dd>
              <dt className="text-muted-foreground">Messages sent</dt>
              <dd className="tabular-nums">{today.messages}</dd>
              <dt className="text-muted-foreground">Dates suggested</dt>
              <dd className="tabular-nums">{today.datesProposed}</dd>
            </dl>
          ) : null}
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {earlier.map((day, index) => (
              <li key={day.day}>
                <span className="font-medium text-foreground">{dayName(day.day, index + 1)}</span>: {day.swipes} swipes, {day.likes} likes, {day.matches} matches,{" "}
                {day.messages} sent, {day.datesProposed} dates
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Sample cards and chats are not counted.</p>
        </TabsContent>
        <TabsContent value="openers" className="grid gap-3">
          {data.openers.length ? (
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
              {data.openers.map((row) => (
                <React.Fragment key={row.style}>
                  <dt className="text-muted-foreground">{OPENER_STYLE_WORDS[row.style]}</dt>
                  <dd className="tabular-nums">
                    {row.replied} of {row.sent} replied
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          ) : (
            <Line>No first messages sent yet. Each one the AI writes is counted here by kind.</Line>
          )}
          <p className="text-xs text-muted-foreground">
            A reply means an answer within three days. Based on {data.openers.reduce((sum, row) => sum + row.sent, 0)} openers so far; a few dozen are needed before the
            numbers mean much.
          </p>
        </TabsContent>
        <TabsContent value="working" className="grid gap-3">
          {data.bands.length ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {data.bands.map((band) => (
                <React.Fragment key={band.from}>
                  <dt className="text-muted-foreground tabular-nums">
                    {band.from} to {band.to}
                  </dt>
                  <dd className="text-right tabular-nums">
                    {band.likes < BAND_NEEDS_LIKES
                      ? `${plural(band.likes, "like")}, not enough yet`
                      : `${plural(band.matches, "match", "matches")} out of ${plural(band.likes, "like")}, ${band.replied} replied`}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          ) : (
            <Line>No liked cards with a score yet. Each like is counted here by its score, with whether it became a match.</Line>
          )}
          <p className="text-xs text-muted-foreground">
            Scores in bands of 10. A band needs {BAND_NEEDS_LIKES} likes before its numbers show, so this takes a few weeks. Sample cards are not counted.
          </p>
        </TabsContent>
      </Tabs>
    </InspectorCard>
  )
}
