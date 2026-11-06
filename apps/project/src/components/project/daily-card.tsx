import * as React from "react"
import { MoonIcon, SunIcon, SunriseIcon } from "lucide-react"
import { toast } from "sonner"

import { burstConfetti } from "@/components/project/confetti"
import { DailyHabits } from "@/components/project/daily-habits"
import { RateYourDayButton, StartDayButton, TomorrowAtAGlance } from "@/components/project/daily-journal"
import { DailySection } from "@/components/project/daily-section"
import { DailySky } from "@/components/project/daily-sky"
import { FoldHeading } from "@/components/project/fold-heading"
import { GraphMorphIcon } from "@/components/project/inbox-morph-icon"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { loadMyWeather, milestoneShown, type DailyCard as DailyCardData, type DailyWeather } from "@/lib/api/project/daily-card"
import {
  DAY_RATING_TOP,
  greetingOf,
  isAfterMidnight,
  partOfDay,
  skyPhase,
  weatherWords,
  type DailySection as DailySectionName,
  type DayPart,
} from "@/lib/project/daily-card"
import { clockIn, fullDayLabel, localNow } from "@/lib/project/days"
import { collapseStorageKey, useRememberedCollapse } from "@/lib/remembered-choice"
import { PANEL_FOOTER_PADDING } from "@/lib/project/panel-gutter"
import { useNow } from "@/lib/project/use-now"
import { cn } from "@/lib/utils"

/** The clock, part of the day, sky and weather, worked out once for the sky behind the panel and the card in it. */
export type DailyNow = {
  nowMs: number
  local: { day: string; time: string }
  part: DayPart
  phase: ReturnType<typeof skyPhase>
  weather: DailyWeather | null
}

export function useDailyNow(daily: DailyCardData): DailyNow {
  const nowMs = useNow(daily.loadedAt)
  const weather = useWeather(daily.settings.city)
  const local = localNow(new Date(nowMs), daily.zone)
  return { nowMs, local, part: partOfDay(local.time, daily.settings.hours), phase: skyPhase(local.time, daily.settings.hours), weather }
}

/**
 * The sky lies faintly behind the left panel's header and its top, and fades
 * into the panel, the way a project's banner does (Tyler, 30 Oct 2026: "I
 * dont want this daily card in a card but more of a permanent fixture like
 * how we built project avatar and background"). The panel holding it is
 * `relative`, and its header goes see-through at the foot.
 */
export function DailySkyBanner({ daily, now }: { daily: DailyCardData; now: DailyNow }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden">
      <div className="absolute inset-0 opacity-45">
        <DailySky
          phase={now.phase}
          part={now.part}
          weather={now.weather?.kind ?? null}
          sky={daily.admin ? daily.settings.sky : "drawn"}
          ownPhoto={daily.settings.ownSkies[now.part]}
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-card/40 to-card" />
    </div>
  )
}

/**
 * The graph in the site admin's panel header, before the pencil (Tyler, 30
 * Oct 2026: "Add another icon here with the graph icon that will open up the
 * look back modal"). It swaps the panel's cards for Look back and back again,
 * the way the inbox does ("put it inline in the left panel like inbox").
 */
export function DailyLookBackButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={open ? "Back to my cards" : "Look back"}
          aria-pressed={open}
          className={cn(open && "bg-muted")}
          onClick={onToggle}
        >
          <GraphMorphIcon open={open} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{open ? "Back to my cards" : "Look back"}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The Daily card at the top of My dashboard (task "Daily card/01", Tyler,
 * 29 Oct 2026: "like a personal assistent"). Everyone has one: a greeting
 * that follows their own hours, today's deep work with Start and the next
 * meeting. The site admin's adds their routines, streaks, tomorrow at night
 * and Rate your day, which nobody else sees,
 * and shows none of it until they press Start day. It sits straight in the
 * panel, under the sky drawn by DailySkyBanner. How it works is in
 * `workspace/docs/daily-card.md`.
 */
export function DailyCard({
  daily,
  now,
  checkin,
  onCheckIn,
  onCheckOut,
  inFooter = false,
}: {
  daily: DailyCardData
  now: DailyNow
  /** An employee's check-in today; null for the site admin, who has none. */
  checkin: { checkedIn: boolean; checkedOut: boolean } | null
  onCheckIn?: () => void
  onCheckOut?: () => void
  /**
   * In the site admin's left panel footer, off the sky (Tyler, 6 Nov 2026: "the
   * footer card now hold greetings and the habit section"), so the greeting
   * needs no room to sit low on it.
   */
  inFooter?: boolean
}) {
  const { nowMs, local, part, weather } = now
  const [open, setOpen, noFlashKey] = useRememberedCollapse(collapseStorageKey.settingsCard("project-daily-card"))
  const cardRef = React.useRef<HTMLElement>(null)
  const greeting = greetingOf(daily.firstName, part, daily.cardDay, isAfterMidnight(local.time, daily.settings.hours))
  useMilestone(daily.admin?.milestone ?? null, cardRef)
  // The day's own parts wait for Start day; an employee's card has no such button.
  const started = !daily.admin || Boolean(daily.admin.today.upAt)

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section ref={cardRef} aria-label="Daily card" className="relative grid min-w-0 grid-cols-[minmax(0,1fr)]">
        {/* On an employee's page, down in the sky's lower half, where the fade has made it
            quiet enough to read on. */}
        <FoldHeading
          title={greeting}
          icon={inFooter ? <PartIcon part={part} /> : undefined}
          band={inFooter}
          open={open}
          foldHint="Fold it to the greeting"
          className={inFooter ? undefined : "mt-6"}
        />
        <CollapsibleContent data-collapse-key={noFlashKey} className={cn(inFooter && PANEL_FOOTER_PADDING, inFooter && "pt-2")}>
          {/* The date and weather fold away with the card, so a folded card is the
              greeting alone (Tyler, 6 Nov 2026: "the date should be inside when
              collapsed"). */}
          <p className="pt-0.5 text-sm text-muted-foreground">
            {fullDayLabel(local.day)}
            {weather ? ` · ${weather.temperature}°, ${weatherWords(weather.kind)} in ${weather.city.split(",")[0]}` : null}
          </p>
          {/* minmax(0, 1fr): a long task title truncates instead of widening the panel.
              15px apart, the same gutter as the panel's cards below and its edges. */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3.75 pt-3.75 empty:hidden">
            {started ? (
              <>
                {daily.admin?.lookBack ? <SundayLookBack daily={daily} /> : null}
                {daily.admin?.monthly ? <MonthlyReview daily={daily} /> : null}
                {daily.dayOff ? <p className="text-sm">{daily.dayOff}. Nothing here needs you today.</p> : null}
                {checkin && !checkin.checkedIn && part !== "night" && !daily.dayOff ? (
                  <Button type="button" className="w-full" onClick={onCheckIn}>
                    Check in to plan your day
                  </Button>
                ) : null}
                {/* In the site admin's own order, dragged in the pencil window (Tyler, 30 Oct
                    2026: "whats the point of dragging the cards in the modal if its not
                    reflected in the panel?"); an employee's card keeps the card's own. A
                    section hidden with the eye there is left out. */}
                {daily.settings.sections.filter((name) => !daily.settings.hidden.includes(name)).map((name) => (
                    <DaySection
                      key={name}
                      name={name}
                      daily={daily}
                      part={part}
                      nowMs={nowMs}
                    />
                ))}
                {checkin?.checkedIn && !checkin.checkedOut && part === "night" && onCheckOut ? (
                  <Button type="button" variant="outline" className="w-full" onClick={onCheckOut}>
                    Check out and plan tomorrow
                  </Button>
                ) : null}
              </>
            ) : null}
            {/* Look back lives in the panel's header (Tyler, 30 Oct 2026: "remove the look back button"). */}
            {daily.admin ? !started ? <StartDayButton /> : part === "night" ? <RateYourDayButton daily={daily} /> : null : null}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}


/** The footer card's icon: the sun rising, the sun, or the moon, by the part of the day. */
function PartIcon({ part }: { part: DayPart }) {
  if (part === "morning") return <SunriseIcon />
  if (part === "afternoon") return <SunIcon />
  return <MoonIcon />
}

/** The weather in the person's city, loaded after the card so the page never waits for it. */
function useWeather(city: string | null) {
  const [weather, setWeather] = React.useState<{ city: string; value: DailyWeather | null } | null>(null)
  React.useEffect(() => {
    if (!city) return
    let live = true
    // Quietly: without an answer the sky just follows the clock.
    loadMyWeather().then(
      (value) => live && setWeather({ city, value }),
      () => live && setWeather({ city, value: null })
    )
    return () => {
      live = false
    }
  }, [city])
  return city && weather?.city === city ? weather.value : null
}

/** A streak milestone's confetti, once: shown, then remembered so it never shows again. */
function useMilestone(milestone: string | null, cardRef: React.RefObject<HTMLElement | null>) {
  const shown = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!milestone || shown.current === milestone || !cardRef.current) return
    shown.current = milestone
    burstConfetti(cardRef.current)
    const days = milestone.split(":").pop()
    toast.success(`${days} days in a row.`)
    void milestoneShown(milestone).catch(() => undefined)
  }, [milestone, cardRef])
}

/**
 * One of the card's sections, or nothing when it has nothing to show at this
 * part of the day. On a day off the next meeting stays away; the routine and
 * tomorrow still show.
 */
function DaySection({
  name,
  daily,
  part,
  nowMs,
}: {
  name: DailySectionName
  daily: DailyCardData
  part: DayPart
  nowMs: number
}) {
  const work = !daily.dayOff
  switch (name) {
    case "meeting":
      return work ? <NextMeeting daily={daily} nowMs={nowMs} /> : null
    case "routine":
      return <DailyHabits daily={daily} />
    case "tomorrow":
      return part === "night" ? <TomorrowAtAGlance daily={daily} /> : null
  }
}

/** "Standup in 25 minutes", "Standup now", or "Standup at 3:00 PM"; nothing once the day's meetings are over. */
function NextMeeting({ daily, nowMs }: { daily: DailyCardData; nowMs: number }) {
  const next = daily.meetings.find((meeting) => Date.parse(meeting.endsAt) > nowMs)
  if (!next) return null
  const minutes = Math.ceil((Date.parse(next.startsAt) - nowMs) / 60_000)
  const when =
    minutes <= 0 ? "now" : minutes < 60 ? `in ${minutes} ${minutes === 1 ? "minute" : "minutes"}` : `at ${clockIn(next.startsAt, daily.zone)}`
  return (
    <DailySection title="Next meeting" foldId="next-meeting">
      <p className="text-sm">
        <span className="font-medium">{next.title}</span> {when}
      </p>
    </DailySection>
  )
}

/** All of Sunday: the week's ratings and wins together, above the usual card. */
function SundayLookBack({ daily }: { daily: DailyCardData }) {
  const days = daily.admin?.lookBack ?? []
  const rated = days.filter((day) => day.rating)
  const wins = days.filter((day) => day.win)
  return (
    <DailySection title="Your week" foldId="your-week">
      <ol className="grid grid-cols-7 gap-1 text-center text-xs" aria-label="This week's ratings">
        {days.map((day) => (
          <li key={day.day} className="grid gap-1">
            <span className="text-muted-foreground">{new Date(`${day.day}T12:00:00Z`).toLocaleDateString("en", { weekday: "short", timeZone: "UTC" })}</span>
            <span className="font-medium">{day.rating ?? ""}</span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">
        {rated.length ? `You rated ${rated.length} of 7 days.` : "No days rated this week."}
      </p>
      {wins.length ? (
        <ul className="grid list-disc gap-1 pl-5 text-sm">
          {wins.map((day) => (
            <li key={day.day}>{day.win}</li>
          ))}
        </ul>
      ) : null}
    </DailySection>
  )
}

/** The first of the month: last month's best habit, typical rating and top wins. */
function MonthlyReview({ daily }: { daily: DailyCardData }) {
  const review = daily.admin?.monthly
  if (!review) return null
  const month = new Date(`${review.month}-15T12:00:00Z`).toLocaleDateString("en", { month: "long", timeZone: "UTC" })
  return (
    <DailySection title={`${month} in review`} foldId="month-in-review">
      <ul className="grid gap-1 text-sm">
        <li>
          {review.bestHabit
            ? `Best habit: ${review.bestHabit.name}, ${review.bestHabit.done} of ${review.bestHabit.of} days.`
            : "No habits were set last month."}
        </li>
        <li>{review.typicalRating ? `A typical day: ${review.typicalRating} out of ${DAY_RATING_TOP}.` : "No days were rated."}</li>
        {review.wins.map((win) => (
          <li key={win}>Win: {win}</li>
        ))}
      </ul>
    </DailySection>
  )
}
