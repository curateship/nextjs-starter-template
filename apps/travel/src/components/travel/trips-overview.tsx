import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ArrowUpRightIcon, PlaneTakeoffIcon } from "lucide-react"

import { WidgetCard } from "@/components/shared/widgets/widget-card"
import { WidgetGrid } from "@/components/shared/widgets/widget-grid"
import { WidgetMenu } from "@/components/shared/widgets/widget-menus"
import { RatingValue } from "@/components/travel/stars"
import { CoverImage } from "@/components/travel/cover-image"
import { DayWeatherLine, TypicalWeatherLine, useTripWeatherRead } from "@/components/travel/day-weather"
import { TripsMap } from "@/components/travel/trips-map"
import { TripsYearView } from "@/components/travel/trips-year-view"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import {
  loadTripPlaces,
  loadTripsOverviewFigures,
  type OverviewCard,
  type TripPlace,
  type TripsOverview as OverviewFigures,
} from "@/lib/api/travel/trips-dashboard"
import type { TripListRow } from "@/lib/api/travel/trips"
import { useLoad } from "@/lib/hooks/use-load"
import { countdown, dateOfDay, formatDayDate, formatTripDates, todayIn } from "@/lib/travel/dates"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { formatMoney } from "@/lib/travel/rules"
import { dayOfTripLine, nextTripOf, tabOf, whereFromAddress } from "@/lib/travel/trips-lists"
import { findTripsWidget, TRIPS_WIDGET_OFFER, type TripsWidgetId } from "@/lib/travel/trips-widgets"

/** The most rows a list widget shows; the rest are a scroll away in their section. */
const LIST_MAX = 50

/**
 * The Trips dashboard's Overview (Tyler, 12 Nov 2026): the person's own
 * widgets in the shell's grid, straight on the dashboard beside the left
 * page, each in the shell's widget card with its ⋮. The layout is held by the
 * dashboard, since the left page's ⋮ sets it too; this draws it.
 */
export function TripsOverview({
  trips,
  layout,
  onChange,
}: {
  trips: readonly TripListRow[]
  layout: WidgetLayout
  onChange: (layout: WidgetLayout) => void
}) {
  const shown = new Set([...layout.top.spots, ...(layout.bottom.columns ? layout.bottom.spots : [])])
  const wants = (...ids: TripsWidgetId[]) => ids.some((id) => shown.has(id))
  // Read only when a widget that needs them is on Overview.
  const needsFigures = wants("must-do", "ideas", "money", "next-money")
  const needsPlaces = wants("best-rated", "countries")
  const figures = useLoad(
    () => (needsFigures ? loadTripsOverviewFigures() : Promise.resolve(null)),
    getTravelErrorMessage,
    { keys: [needsFigures], remember: "trips-overview-figures" }
  )
  const places = useLoad(() => (needsPlaces ? loadTripPlaces() : Promise.resolve(null)), getTravelErrorMessage, {
    keys: [needsPlaces],
    remember: "trips-trip-places",
  })
  const nextTrip = React.useMemo(() => nextTripOf(trips), [trips])
  // One reading for both widgets, taken only when one of them shows.
  const needsWeather = wants("weather", "holidays")
  const weather = useTripWeatherRead({
    id: nextTrip?.id ?? "",
    startDate: needsWeather ? (nextTrip?.startDate ?? null) : null,
    destination: nextTrip?.destination ?? null,
  })

  const draw = (id: TripsWidgetId) => {
    switch (id) {
      case "next-trip":
        return <NextTripWidget trip={nextTrip} />
      case "map":
        return <TripsMap />
      case "year":
        return <YearWidget trips={trips} />
      case "must-do":
        return <CardsWidget read={figures} pick={(read) => read.mustDo.filter((card) => card.tripId === nextTrip?.id)} empty={nextTrip ? `Nothing on ${nextTrip.name} is marked Must do and still to do.` : "No trip coming up."} />
      case "ideas":
        return <CardsWidget read={figures} pick={(read) => upcomingIdeas(read, trips)} empty="No ideas waiting on an upcoming trip." />
      case "weather":
        return <WeatherWidget trip={nextTrip} read={weather} />
      case "holidays":
        return <HolidaysWidget trip={nextTrip} read={weather} />
      case "best-rated":
        return <BestRatedWidget read={places} />
      case "countries":
        return <CountriesWidget read={places} trips={trips} />
      case "money":
        return <MoneyThisYearWidget read={figures} trips={trips} />
      case "next-money":
        return <NextMoneyWidget read={figures} trip={nextTrip} />
    }
  }

  return (
    <WidgetGrid
      offer={TRIPS_WIDGET_OFFER}
      layout={layout}
      onChange={onChange}
      drawWidget={(id) => {
        const widget = findTripsWidget(id)
        if (!widget) return null
        const Icon = widget.icon
        return (
          <WidgetCard title={widget.label} icon={<Icon />} menu={<WidgetMenu title={widget.label} />}>
            {draw(widget.id)}
          </WidgetCard>
        )
      }}
    />
  )
}

type Read<T> = { data: T | null; error: string | null; retry: () => void }

/** A widget's list that scrolls inside its card. */
function Scroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="grid p-1.5">{children}</div>
    </ScrollArea>
  )
}

/** The widget's one line when there is nothing to show. */
function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="p-3 text-sm text-muted-foreground">{children}</p>
}

/** Reading, failed with Try again, or the widget. */
function Loaded<T>({ read, children }: { read: Read<T>; children: (data: T) => React.ReactNode }) {
  if (read.data) return <>{children(read.data)}</>
  if (read.error) return <ErrorRow message={read.error} onRetry={read.retry} className="p-3" />
  return <LoadingRow label="Loading…" className="p-3" />
}

/** The next trip's weather reading, as both weather widgets take it. */
type WeatherRead = ReturnType<typeof useTripWeatherRead>

/** A row that opens a trip, or a card on it. */
function OpenRow({
  tripId,
  open,
  title,
  line,
  end,
}: {
  tripId: string
  open?: string
  title: string
  line?: string | null
  end?: React.ReactNode
}) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={() => void navigate({ to: "/trips/$tripId", params: { tripId }, search: open ? { open } : {} })}
    >
      <span className="grid min-w-0 flex-1">
        <span className="truncate">{title}</span>
        {line ? <span className="truncate text-xs text-muted-foreground">{line}</span> : null}
      </span>
      {end}
    </button>
  )
}

/**
 * Next trip: the one on today, with its day and a way into today on its
 * board, or the soonest still to come with its countdown.
 */
function NextTripWidget({ trip }: { trip: TripListRow | null }) {
  const navigate = useNavigate()
  if (!trip) return <Quiet>No trip coming up. Make one with New trip in Trips.</Quiet>
  const onDay = dayOfTripLine(trip)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
      {/* The cover fades into the card behind the words, as a panel's banner does. */}
      <CoverImage url={trip.coverUrl} className="absolute inset-0 size-full object-cover opacity-40" fallback={null} />
      {trip.coverUrl ? <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent via-card/60 to-card" /> : null}
      <div className="relative grid gap-1 p-3">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
          <PlaneTakeoffIcon className="size-3.5" aria-hidden />
          {onDay ? "On now" : countdown(trip)}
        </span>
        {/* Two lines at most, so a long name stays inside the widget (Travel polish part 12). */}
        <span className="line-clamp-2 text-lg leading-tight font-semibold break-words">{trip.name}</span>
        <span className="line-clamp-2 text-sm text-muted-foreground">
          {[trip.destination, formatTripDates(trip.startDate, trip.days), onDay].filter(Boolean).join(" · ")}
        </span>
        <Button
          type="button"
          size="sm"
          className="mt-1 justify-self-start"
          // On now, today's column; the board opens on today by itself.
          onClick={() => void navigate({ to: "/trips/$tripId", params: { tripId: trip.id } })}
        >
          <ArrowUpRightIcon className="size-4" />
          {onDay ? "Open today" : "Open trip"}
        </Button>
      </div>
    </div>
  )
}

function YearWidget({ trips }: { trips: readonly TripListRow[] }) {
  const navigate = useNavigate()
  const kept = React.useMemo(() => trips.filter((trip) => tabOf(trip) !== "bin"), [trips])
  return (
    <ScrollArea className="min-h-0 flex-1">
      <TripsYearView trips={kept} onOpen={(trip) => void navigate({ to: "/trips/$tripId", params: { tripId: trip.id } })} />
    </ScrollArea>
  )
}

/** Ideas on trips still to come, soonest trip first. */
function upcomingIdeas(read: OverviewFigures, trips: readonly TripListRow[]) {
  const upcoming = new Set(trips.filter((trip) => tabOf(trip) === "upcoming").map((trip) => trip.id))
  return read.ideas.filter((card) => upcoming.has(card.tripId))
}

/** Must do or Ideas: cards, each opening on its trip. */
function CardsWidget({
  read,
  pick,
  empty,
}: {
  read: Read<OverviewFigures>
  pick: (read: OverviewFigures) => OverviewCard[]
  empty: string
}) {
  return (
    <Loaded read={read}>
      {(figures) => {
        const cards = pick(figures)
        if (cards.length === 0) return <Quiet>{empty}</Quiet>
        return (
          <Scroll>
            {cards.slice(0, LIST_MAX).map((card) => (
              <OpenRow
                key={card.activityId}
                tripId={card.tripId}
                open={card.activityId}
                title={card.title}
                line={`${card.tripName} · ${card.day === null ? "Ideas" : `Day ${card.day}`}`}
              />
            ))}
          </Scroll>
        )
      }}
    </Loaded>
  )
}

/**
 * The next trip's forecast for its days in the next 14, and what later days
 * are usually like, from the same reading the trip's board shows.
 */
function WeatherWidget({ trip, read }: { trip: TripListRow | null; read: WeatherRead }) {
  if (!trip) return <Quiet>No trip coming up.</Quiet>
  if (!trip.destination) return <Quiet>Give {trip.name} a destination to see its weather.</Quiet>
  if (!trip.startDate) return <Quiet>Give {trip.name} dates to see its weather.</Quiet>
  if (read.status === "failed")
    return <ErrorRow message={`The weather for ${trip.destination} didn't load.`} onRetry={read.retry} className="p-3" />
  if (read.status === "loading") return <LoadingRow label={`Loading the weather for ${trip.destination}…`} className="p-3" />
  const { weather } = read
  const days = Array.from({ length: trip.days }, (_, index) => index + 1)
    .map((day) => ({
      day,
      date: dateOfDay(trip.startDate, day),
      forecast: weather.forecast.find((each) => each.day === day),
      typical: weather.typical.find((each) => each.day === day),
    }))
    .filter((row) => row.forecast || row.typical)
  if (days.length === 0) return <Quiet>No weather for these dates yet.</Quiet>
  return (
    <Scroll>
      {days.map((row) => (
        <div key={row.day} className="grid gap-0.5 px-1.5 py-1.5">
          <span className="text-sm">
            Day {row.day}
            {row.date ? <span className="text-muted-foreground"> · {formatDayDate(row.date)}</span> : null}
          </span>
          {row.forecast ? <DayWeatherLine weather={row.forecast} /> : row.typical ? <TypicalWeatherLine typical={row.typical} /> : null}
        </div>
      ))}
    </Scroll>
  )
}

/** Public holidays on the next trip's days, when shops and sights may be shut. */
function HolidaysWidget({ trip, read }: { trip: TripListRow | null; read: WeatherRead }) {
  if (!trip) return <Quiet>No trip coming up.</Quiet>
  if (!trip.startDate) return <Quiet>Give {trip.name} dates to see its public holidays.</Quiet>
  if (read.status === "failed")
    return <ErrorRow message={`The public holidays for ${trip.name} didn't load.`} onRetry={read.retry} className="p-3" />
  if (read.status === "loading") return <LoadingRow label="Loading the public holidays…" className="p-3" />
  const { weather } = read
  if (weather.holidays.length === 0) return <Quiet>No public holidays during {trip.name}.</Quiet>
  return (
    <Scroll>
      {weather.holidays.map((holiday) => {
        const date = dateOfDay(trip.startDate, holiday.day)
        return (
          <div key={`${holiday.day}-${holiday.name}`} className="grid gap-0.5 px-1.5 py-1.5">
            <span className="truncate text-sm">{holiday.name}</span>
            <span className="text-xs text-muted-foreground">
              Day {holiday.day}
              {date ? ` · ${formatDayDate(date)}` : ""}
            </span>
          </div>
        )
      })}
    </Scroll>
  )
}

/** The places given the most stars, each opening its card on its trip. */
function BestRatedWidget({ read }: { read: Read<TripPlace[]> }) {
  return (
    <Loaded read={read}>
      {(places) => {
        const rated = places
          .filter((place) => place.rating !== null)
          .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.title.localeCompare(b.title))
        if (rated.length === 0) return <Quiet>No places rated yet. Rate the trip, in a trip's ⋮, gives them stars.</Quiet>
        return (
          <Scroll>
            {rated.slice(0, LIST_MAX).map((place) => (
              <OpenRow
                key={place.id}
                tripId={place.tripId}
                open={place.id}
                title={place.title}
                line={place.tripName}
                end={
                  <RatingValue rating={place.rating} className="shrink-0 text-xs" />
                }
              />
            ))}
          </Scroll>
        )
      }}
    </Loaded>
  )
}

/**
 * The countries and cities been to, from the places marked Done. A place with
 * no address that says its country isn't counted, and the widget says how
 * many those are rather than guessing.
 */
function CountriesWidget({ read, trips }: { read: Read<TripPlace[]>; trips: readonly TripListRow[] }) {
  return (
    <Loaded read={read}>
      {(places) => {
        const kept = new Set(trips.filter((trip) => tabOf(trip) !== "bin").map((trip) => trip.id))
        const done = places.filter((place) => place.done && kept.has(place.tripId))
        const countries = new Map<string, Set<string>>()
        let unknown = 0
        for (const place of done) {
          const where = whereFromAddress(place.place?.address)
          if (!where) {
            unknown += 1
            continue
          }
          const cities = countries.get(where.country) ?? new Set<string>()
          if (where.city) cities.add(where.city)
          countries.set(where.country, cities)
        }
        if (countries.size === 0) return <Quiet>Mark places Done on a trip to count where you've been.</Quiet>
        const cityCount = [...countries.values()].reduce((sum, cities) => sum + cities.size, 0)
        return (
          <Scroll>
            <p className="px-1.5 pb-1.5 text-sm">
              {countries.size} {countries.size === 1 ? "country" : "countries"}, {cityCount} {cityCount === 1 ? "city" : "cities"}
            </p>
            {[...countries.entries()]
              .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
              .map(([country, cities]) => (
                <div key={country} className="grid gap-0.5 px-1.5 py-1.5">
                  <span className="truncate text-sm">{country}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{[...cities].sort().join(", ") || "No city named"}</span>
                </div>
              ))}
            {unknown ? (
              <p className="px-1.5 pt-1.5 text-xs text-muted-foreground">
                {unknown} {unknown === 1 ? "place has" : "places have"} no address to read a country from.
              </p>
            ) : null}
          </Scroll>
        )
      }}
    </Loaded>
  )
}

/**
 * What this year's trips came to: the trips that started this year, each
 * trip's costs on its days as its Budget block adds them, one line per
 * currency. Trips are kept in their own currencies, since the app keeps no
 * exchange rates, so each currency is its own sum.
 */
function MoneyThisYearWidget({ read, trips }: { read: Read<OverviewFigures>; trips: readonly TripListRow[] }) {
  const today = todayIn(null)
  const year = today.slice(0, 4)
  return (
    <Loaded read={read}>
      {(figures) => {
        const started = new Map(
          trips
            .filter((trip) => trip.startDate && trip.startDate.startsWith(year) && trip.startDate <= today && tabOf(trip) !== "bin")
            .map((trip) => [trip.id, trip])
        )
        const byCurrency = new Map<string, { cents: number; trips: number }>()
        for (const money of figures.money) {
          if (!started.has(money.tripId) || money.plannedCents === 0) continue
          const held = byCurrency.get(money.currency) ?? { cents: 0, trips: 0 }
          byCurrency.set(money.currency, { cents: held.cents + money.plannedCents, trips: held.trips + 1 })
        }
        if (byCurrency.size === 0) return <Quiet>No costs on a trip that started in {year} yet.</Quiet>
        return (
          <Scroll>
            {[...byCurrency.entries()].map(([currency, total]) => (
              <div key={currency} className="flex items-baseline justify-between gap-2 px-1.5 py-1.5">
                <span className="text-lg font-semibold tabular-nums">{formatMoney(total.cents, currency)}</span>
                <span className="text-xs text-muted-foreground">
                  {total.trips} {total.trips === 1 ? "trip" : "trips"}
                </span>
              </div>
            ))}
          </Scroll>
        )
      }}
    </Loaded>
  )
}

/** How much of the next trip's budget is planned: "CA$1,200 of CA$3,000". */
function NextMoneyWidget({ read, trip }: { read: Read<OverviewFigures>; trip: TripListRow | null }) {
  if (!trip) return <Quiet>No trip coming up.</Quiet>
  return (
    <Loaded read={read}>
      {(figures) => {
        const money = figures.money.find((each) => each.tripId === trip.id)
        const planned = money?.plannedCents ?? 0
        const budget = money?.budgetCents ?? null
        const share = budget ? Math.min(1, planned / budget) : null
        return (
          <div className="grid content-start gap-2 p-3">
            <span className="text-sm text-muted-foreground">{trip.name}</span>
            <span className="text-lg font-semibold tabular-nums">
              {formatMoney(planned, trip.currency)}
              {budget ? <span className="text-sm font-normal text-muted-foreground"> of {formatMoney(budget, trip.currency)}</span> : null}
            </span>
            {share !== null ? (
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="meter"
                aria-label="Budget planned"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(share * 100)}
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${share * 100}%` }} />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No budget set. The Budget block in the trip's description sets one.</span>
            )}
            {budget && planned > budget ? (
              <span className="text-xs text-destructive">{formatMoney(planned - budget, trip.currency)} over the budget.</span>
            ) : null}
          </div>
        )
      }}
    </Loaded>
  )
}
