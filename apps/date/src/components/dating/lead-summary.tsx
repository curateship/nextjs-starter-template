import { Fragment } from "react"
import type * as React from "react"
import { HeartIcon, Loader2Icon, PauseIcon, PlayIcon, SettingsIcon, SquareIcon, TriangleAlertIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Meter } from "@/components/ui/meter"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { DatingDashboard } from "@/lib/api/dating/dashboard"
import { LEAD_GROUP_WORDS, leadGroupCounts, type LeadGroup } from "@/lib/dating/leads"
import { BAND_NEEDS_LIKES, DATING_APP_WORDS, OPENER_STYLE_WORDS, SECOND_LOOK_POINTS, stopReasonWords } from "@/lib/dating/options"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

import { FlatSection } from "./flat-section"
import { LEAD_DOT } from "./lead-status-style"
import { ProfilePicker, ProfilesSection } from "./profiles"
import { dollars, whenWords } from "./words"

/** The groups the left panel lists, in the order a lead needs the member. */
const GROUPS: LeadGroup[] = ["waiting", "new", "liked", "matched", "chatting", "date"]

/**
 * The Dating dashboard's left panel, which summarizes (Tyler, 20 Oct 2026),
 * drawn as his mock of the same day has it
 * (`workspace/docs/assets/pasted-image-1792550342758871000.png`): flat
 * sections split by lines, no grey boxes. The phone's line with Pair one;
 * Today, with the day's swipes against their limit, its counts, and Start,
 * Profiles (read the card on Tinder's screen) and Chats (read the chat list);
 * AI spend; and Leads, whose groups each show their leads in the middle list.
 * The header's cog opens every Dating setting in a window.
 *
 * Since profiles (task "features/06-profiles", 20 Oct 2026) the header's
 * title is the open profile, which switches to another, and a Profiles
 * section lists them all. A paused profile says so at the top, with Resume.
 *
 * Since Tyler's "We dont need 4 seperate pages. Condense them all into the 3
 * col dashboard" (20 Oct 2026) it also holds what the Stats screen did (the
 * last 7 days, Openers and What's working), and the phone's line and My
 * profile open the phone and the member's own profile in the right panel.
 *
 * A Facebook Dating profile (task "facebook/01") adds Second Look, the AI's
 * near misses to like after all, and has no My profile: Date does not change
 * a Facebook Dating profile. A member with two or more profiles gets Compare
 * apps, with the suggestion to move swiping hours when one app clearly does
 * better.
 */
export function LeadSummary({
  data,
  group,
  busy,
  onGroup,
  onStartOrStop,
  onReadCard,
  onReadChats,
  openId,
  onOpen,
  onOpenSettings,
  onPickProfile,
  onNewProfile,
  onResumeProfile,
  onSecondLookLike,
  onChangeHours,
}: {
  data: DatingDashboard
  group: LeadGroup | undefined
  /** Which button is waiting on the server. */
  busy: string | null
  onGroup: (group: LeadGroup) => void
  onStartOrStop: (run: boolean) => void
  onReadCard: () => void
  onReadChats: () => void
  /** What the right panel shows, to mark the phone or My profile as open. */
  openId: string | undefined
  onOpen: (id: "phone" | "me") => void
  /** The cog: every Dating setting of the open profile in a window. */
  onOpenSettings: () => void
  onPickProfile: (accountId: string) => void
  onNewProfile: () => void
  onResumeProfile: () => void
  /** Like on a Second Look row (part 14). */
  onSecondLookLike: (profileId: string, name: string) => void
  /** The suggestion's button: the open profile's settings, where its swiping hours are (part 24). */
  onChangeHours: () => void
}) {
  const facebook = data.profile.app === "facebook"
  const today = data.tally[0]
  const counts = leadGroupCounts(data.leads)
  const running = Boolean(data.phone?.running)
  const live = data.leads.filter((lead) => lead.status !== "over").length
  const openersSent = data.openers.reduce((sum, row) => sum + row.sent, 0)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardTitleHeader
        title={<ProfilePicker data={data} onPick={onPickProfile} onNew={onNewProfile} />}
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Dating settings" onClick={onOpenSettings}>
                <SettingsIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Dating settings</TooltipContent>
          </Tooltip>
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid grid-cols-[minmax(0,1fr)]">
          {data.profile.paused ? <PausedLine busy={busy === "pause"} onResume={onResumeProfile} /> : null}
          <PhoneLine data={data} open={openId === "phone"} onOpen={() => onOpen("phone")} />
          <ProfilesSection data={data} onPick={onPickProfile} onNew={onNewProfile} />
          <FlatSection storageId="date-summary-today" title="Today" meta={`${data.hour.swipesToday} of ${data.settings.swipesPerDay} swipes`}>
            <Meter
              size="sm"
              value={data.hour.swipesToday}
              max={data.settings.swipesPerDay}
              label="Swipes today"
              valueText={`${data.hour.swipesToday} of ${data.settings.swipesPerDay} swipes`}
            />
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-sm">
              <Row label="Likes" value={today?.likes ?? 0} />
              <Row label="Matches" value={today?.matches ?? 0} />
              <Row label="Messages sent" value={today?.messages ?? 0} />
              <Row label="Dates suggested" value={today?.datesProposed ?? 0} />
            </dl>
            <div className="flex gap-2">
              <Button type="button" className="flex-1" disabled={busy === "loop"} onClick={() => onStartOrStop(!running)}>
                {busy === "loop" ? <Loader2Icon className="animate-spin" /> : running ? <SquareIcon /> : <PlayIcon />}
                {running ? "Stop" : "Start"}
              </Button>
              <ReadButton label="Profiles" hint="Read the profile on the phone's screen now, without swiping" busy={busy === "read-card"} onClick={onReadCard} />
              <ReadButton label="Chats" hint={`Read ${DATING_APP_WORDS[data.profile.app].name}'s chat list on the phone now`} busy={busy === "read-matches"} onClick={onReadChats} />
            </div>
          </FlatSection>
          <FlatSection storageId="date-summary-spend" title="AI spend" meta="this month">
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Spent</dt>
              <dd className="text-right tabular-nums">
                {dollars(data.spendDollars)} <span className="text-muted-foreground">of ${data.settings.spendCapDollars}</span>
              </dd>
              <dt className="text-muted-foreground">Cost per match</dt>
              <dd className="text-right tabular-nums">{data.matchCost.perMatch === null ? "None yet" : dollars(data.matchCost.perMatch)}</dd>
              <dt className="text-muted-foreground">Cost per date</dt>
              <dd className="text-right tabular-nums">{data.matchCost.perDate === null ? "None yet" : dollars(data.matchCost.perDate)}</dd>
            </dl>
          </FlatSection>
          <FlatSection storageId="date-summary-groups" title="Leads" meta={live}>
            <ul className="-mx-2 grid grid-cols-[minmax(0,1fr)]">
              {GROUPS.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    aria-pressed={group === item}
                    onClick={() => onGroup(item)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60",
                      group === item && "bg-muted font-medium",
                      focusRingInset
                    )}
                  >
                    <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", LEAD_DOT[item])} />
                    <span className="min-w-0 flex-1 truncate">{LEAD_GROUP_WORDS[item]}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">{counts[item]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </FlatSection>
          {facebook ? <SecondLook data={data} busy={busy} onLike={onSecondLookLike} /> : null}
          <FlatSection storageId="date-summary-week" title="Last 7 days">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-1 font-normal">Day</th>
                  <th className="pb-1 text-right font-normal">Swipes</th>
                  <th className="pb-1 text-right font-normal">Likes</th>
                  <th className="pb-1 text-right font-normal">Matches</th>
                </tr>
              </thead>
              <tbody>
                {data.tally.map((day, index) => (
                  <tr key={day.day}>
                    <td className="py-0.5 text-muted-foreground">{dayName(day.day, index)}</td>
                    <td className="py-0.5 text-right">{day.swipes}</td>
                    <td className="py-0.5 text-right">{day.likes}</td>
                    <td className="py-0.5 text-right">{day.matches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </FlatSection>
          <FlatSection storageId="date-summary-openers" title="Openers" meta={`${openersSent} sent`}>
            {data.openers.length ? (
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-sm">
                {data.openers.map((row) => (
                  <Fragment key={row.style}>
                    <dt className="text-muted-foreground">{OPENER_STYLE_WORDS[row.style]}</dt>
                    <dd className="text-right tabular-nums">
                      {row.replied} of {row.sent} replied
                    </dd>
                  </Fragment>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No first messages sent yet.</p>
            )}
            <p className="text-xs text-muted-foreground">A reply means an answer within three days. A few dozen openers are needed before this means much.</p>
          </FlatSection>
          <FlatSection storageId="date-summary-working" title="What's working">
            {data.bands.length ? (
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                {data.bands.map((band) => (
                  <Fragment key={band.from}>
                    <dt className="text-muted-foreground tabular-nums">
                      {band.from} to {band.to}
                    </dt>
                    <dd className="text-right tabular-nums">
                      {band.likes < BAND_NEEDS_LIKES ? `${band.likes} likes, not enough yet` : `${band.matches} of ${band.likes} likes matched, ${band.replied} replied`}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No liked cards with a score yet.</p>
            )}
            <p className="text-xs text-muted-foreground">Liked cards by score, in bands of 10. A band needs {BAND_NEEDS_LIKES} likes before its numbers show. Samples are not counted.</p>
          </FlatSection>
          {data.compare.rows.length > 1 ? <CompareApps data={data} onChangeHours={onChangeHours} /> : null}
          {facebook ? null : (
            <OpenRow
              title="My profile"
              words={data.own ? `Read ${whenWords(data.own.readAt)}${data.own.review ? ", with the AI's suggestions" : ""}` : "Not read yet"}
              open={openId === "me"}
              onOpen={() => onOpen("me")}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * Second Look (part 14 of "facebook/01", Tyler's "You decide"): the cards
 * the AI passed by 5 points or fewer in the last two weeks. Like has the
 * phone open Facebook's Second Look and like them there.
 */
function SecondLook({ data, busy, onLike }: { data: DatingDashboard; busy: string | null; onLike: (profileId: string, name: string) => void }) {
  return (
    <FlatSection storageId="date-summary-second-look" title="Second Look" meta={data.secondLook.length}>
      {data.secondLook.length ? (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5 text-sm">
          {data.secondLook.map((card) => (
            <li key={card.id} className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                {card.name}
                {card.age ? `, ${card.age}` : ""}
                <span className="text-muted-foreground tabular-nums"> · {card.score}</span>
              </span>
              <Button type="button" variant="outline" size="sm" disabled={busy === `second-look:${card.id}`} onClick={() => onLike(card.id, card.name)}>
                {busy === `second-look:${card.id}` ? <Loader2Icon className="animate-spin" /> : <HeartIcon />}
                Like
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No near misses in the last two weeks.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Cards the AI passed by {SECOND_LOOK_POINTS} points or fewer under your line of {data.settings.likeAbove}. Nothing is liked until you press Like.
      </p>
    </FlatSection>
  )
}

/**
 * Compare apps (part 23): each profile's month side by side, and the
 * suggestion to move swiping hours when one app clearly does better (part
 * 24). The button opens the open profile's settings, where its hours are;
 * nothing changes by itself.
 */
function CompareApps({ data, onChangeHours }: { data: DatingDashboard; onChangeHours: () => void }) {
  return (
    <FlatSection storageId="date-summary-compare" title="Compare apps" meta="this month">
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 text-sm">
        {data.compare.rows.map((row) => (
          <li key={row.accountId} className="grid gap-0.5">
            <span className="truncate font-medium">
              {DATING_APP_WORDS[row.app].name}{" "}
              <span className="font-normal text-muted-foreground">
                ({row.name}){row.accountId === data.profile.id ? ", open now" : ""}
              </span>
            </span>
            <span className="text-muted-foreground tabular-nums">
              {row.perHundred === null ? `${row.likes} likes, not enough yet` : `${row.perHundred} matches out of 100 likes`}
              {` · ${row.replied} replied · ${row.dates} ${row.dates === 1 ? "date" : "dates"} · ${row.perMatch === null ? "no matches yet" : `${dollars(row.perMatch)} a match`}`}
            </span>
          </li>
        ))}
      </ul>
      {data.compare.moveHours ? (
        <div className="grid gap-2">
          <p className="text-sm">{data.compare.words}</p>
          {/* The settings window holds the open profile's hours, so the button shows only when the suggestion is about it. */}
          {[data.compare.moveHours.better.accountId, data.compare.moveHours.worse.accountId].includes(data.profile.id) ? (
            <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={onChangeHours}>
              Change hours
            </Button>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">Likes and matches since the 1st, and what the AI cost. Samples are not counted.</p>
    </FlatSection>
  )
}

function dayName(day: string, index: number): string {
  if (index === 0) return "Today"
  if (index === 1) return "Yesterday"
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
}

/** A line of the panel that opens something in the right panel, such as My profile. */
function OpenRow({ title, words, open, onOpen }: { title: string; words: string; open: boolean; onOpen: () => void }) {
  return (
    <div className={cn("flex min-h-14 items-center gap-2.5 border-b px-4 py-3 text-sm", open && "bg-muted/60")}>
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-[15px] font-semibold">{title}</span>
        <span className="truncate text-muted-foreground">{words}</span>
      </span>
      <Button type="button" variant="outline" size="sm" aria-pressed={open} onClick={onOpen}>
        Open
      </Button>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </>
  )
}

/**
 * The one line about the phone: not paired with Pair one, here or away,
 * swiping, or the screen that stopped it. Its button opens the phone in the
 * right panel: pairing, the switch, Resume, the screen window and its log.
 */
function PhoneLine({ data, open, onOpen }: { data: DatingDashboard; open: boolean; onOpen: () => void }) {
  const phone = data.phone
  let dot: string | null = "bg-muted-foreground/50"
  let words: React.ReactNode
  if (!phone?.paired) {
    words = "No phone paired"
  } else if (phone.stoppedReason) {
    dot = null
    words = (
      <span className="flex items-center gap-1.5 text-foreground">
        <TriangleAlertIcon className="size-3.5 shrink-0 text-destructive" aria-hidden />
        Stopped: {stopReasonWords(phone.stoppedReason, data.profile.app).toLowerCase()}
      </span>
    )
  } else {
    if (phone.here) dot = "bg-emerald-500"
    words = [phone.here ? "Phone here" : phone.lastSeenAt ? `Away since ${whenWords(phone.lastSeenAt)}` : "Not heard from", phone.running ? "swiping" : null]
      .filter(Boolean)
      .join(" · ")
  }
  return (
    <div className={cn("flex min-h-14 items-center gap-2.5 border-b px-4 py-3 text-sm text-muted-foreground", open && "bg-muted/60")}>
      {dot ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dot)} /> : null}
      <span className="min-w-0 flex-1 truncate">{words}</span>
      <Button type="button" variant="outline" size="sm" aria-pressed={open} onClick={onOpen}>
        {phone?.paired ? "Phone" : "Pair one"}
      </Button>
    </div>
  )
}

/** A paused profile's line: nothing runs on it until Resume. */
function PausedLine({ busy, onResume }: { busy: boolean; onResume: () => void }) {
  return (
    <div className="flex min-h-14 items-center gap-2.5 border-b px-4 py-3 text-sm">
      <PauseIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate">Paused. Nothing runs until Resume.</span>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onResume}>
        {busy ? <Loader2Icon className="animate-spin" /> : null}
        Resume
      </Button>
    </div>
  )
}

function ReadButton({ label, hint, busy, onClick }: { label: string; hint: string; busy: boolean; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={onClick}>
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}
