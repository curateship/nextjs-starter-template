import * as React from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import { ArrowUpRightIcon, ChevronRightIcon, PinIcon, PlaneTakeoffIcon } from "lucide-react"

import type { RowMenuItem } from "@/components/crm/crm-row"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { FoldingMenu, MenuAction, MenuLine } from "@/components/shared/folding-menu"
import { SidePanelCollapseButton } from "@/components/shared/three-panels"
import { NOT_RATED, STAR_ON } from "@/components/travel/stars"
import { CoverImage } from "@/components/travel/cover-image"
import { TripProvider, type TripContextValue } from "@/components/travel/trip-context"
import { TripMenu } from "@/components/travel/trip-menu"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { useTravelOffline } from "@/components/travel/use-travel-offline"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { loadTrip, type TripListRow, type TripPage } from "@/lib/api/travel/trips"
import { useLoad } from "@/lib/hooks/use-load"
import { boardColumns, columnKey, formatTime } from "@/lib/travel/board"
import { readDayInfo } from "@/lib/travel/trip-days"
import { countdown, dateOfDay, formatDayDate, formatTripDates } from "@/lib/travel/dates"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { noteFirstLine } from "@/lib/travel/notes"
import { DAY_PART_LABEL, TRIP_STATUS_LABEL, type TripStatus } from "@/lib/travel/rules"
import type { ActivityType } from "@/lib/travel/activity-types"
import { binGoesLine } from "@/lib/travel/trip-bin"
import { smallPhoto } from "@/lib/travel/trip-photos"
import { PANEL_FOOTER_PADDING } from "@/lib/layout/panel-gutter"
import { cn } from "@/lib/utils"

const NO_WEATHER: TripContextValue["weather"] = { forecast: [], typical: [], holidays: [] }

/** The status's dot, as a row's dot reads elsewhere: blue planning, amber booked, green done. */
const STATUS_DOT: Record<TripStatus, string> = {
  planning: "bg-blue-500",
  booked: "bg-amber-500",
  done: "bg-green-600",
}

type Tab = "itinerary" | "photos" | "notes"

/**
 * The trip picked on the Trips dashboard, in the right panel, drawn from
 * Tyler's picture of 12 Nov 2026 ("redesign the right trip panel").
 *
 * - **Header:** a soft sky band with the trip's cover as a small rounded
 *   picture, its name and destination, then its ⋮ and the collapse button.
 *   The ⋮ is the trip page's Trip settings, so the trip changes here without
 *   opening it, with Copy and Archive added above Rate the trip.
 * - **Facts:** Dates with the countdown under them, and Status with its dot
 *   and the tags and rating under it, side by side when there's room.
 * - **Tabs:** Itinerary (each day with its date and how many activities),
 *   Photos and Notes, each with its count. A day folds open its activities
 *   in place; an activity, Open day plan, a photo or a note opens the trip
 *   there.
 *
 * - **Foot:** Open trip, a button across the panel that goes to the trip.
 *
 * A trip in the Bin doesn't open until it is put back, so it shows its facts
 * with no foot, and its ⋮ holds Put back and Delete for good.
 */
export function TripRecord({
  trip,
  actions,
  busy,
}: {
  trip: TripListRow
  /** The table's own: Open trip, Copy, Archive and Delete, or Put back and Delete for good. */
  actions: RowMenuItem[]
  busy: boolean
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const readOnly = useTravelOffline()
  const binned = trip.deletedAt !== null
  const read = useLoad(() => (binned ? Promise.resolve(null) : loadTrip(trip.id)), getTravelErrorMessage, {
    keys: [trip.id, binned],
  })
  const page = read.data
  const { retry, setData } = read
  const [tab, setTab] = React.useState<Tab>("itinerary")

  const refresh = React.useCallback(async () => {
    setData(await loadTrip(trip.id))
    // The table beside it shows the name, dates, status and tags too.
    await router.invalidate()
  }, [router, setData, trip.id])

  const openAt = React.useCallback(
    (search: { open?: string; note?: string }) =>
      void navigate({ to: "/trips/$tripId", params: { tripId: trip.id }, search }),
    [navigate, trip.id]
  )

  const context = React.useMemo<TripContextValue | null>(() => {
    if (!page) return null
    return {
      page,
      typesById: new Map(page.types.map((type) => [type.id, type])),
      refresh,
      openActivity: (activityId) => openAt({ open: activityId }),
      openActivityId: undefined,
      readOnly,
      weather: NO_WEATHER,
      openTripNote: (noteId) => openAt(noteId ? { note: noteId } : {}),
      noteRequest: null,
    }
  }, [openAt, page, readOnly, refresh])

  const contents = React.useMemo(() => (page ? tripContents(page) : null), [page])
  const cover = page?.trip.coverUrl ?? trip.coverUrl
  const name = page?.trip.name ?? trip.name
  const [binMenuOpen, setBinMenuOpen] = React.useState(false)
  const runFromBinMenu = (action: RowMenuItem) => () => {
    setBinMenuOpen(false)
    action.onSelect()
  }

  const menu = readOnly ? null : binned ? (
    <FoldingMenu label={`More for ${name}`} fit busy={busy} open={binMenuOpen} onOpenChange={setBinMenuOpen}>
      {actions
        .filter((action) => !action.destructive)
        .map((action) => (
          <MenuAction key={action.label} icon={action.icon} onClick={runFromBinMenu(action)}>
            {action.label}
          </MenuAction>
        ))}
      <MenuLine />
      {actions
        .filter((action) => action.destructive)
        .map((action) => (
          <MenuAction key={action.label} icon={action.icon} destructive onClick={runFromBinMenu(action)}>
            {action.label}
          </MenuAction>
        ))}
    </FoldingMenu>
  ) : context ? (
    // Delete is Trip settings' own Delete trip, and Open trip is the foot's
    // button, so both of the table's are left out here.
    <TripMenu actions={actions.filter((action) => !action.destructive && action.label !== "Open trip")} />
  ) : null

  const panel = (
    // The first drawing's sizes made 20 out of 100 smaller, then 10 out of
    // 100 bigger (Tyler, 12 Nov 2026: "reduce fonts by 20%", then "too
    // small, increase by 10%"): 16px text is 14.08px, 14px is 12.32px, 15px
    // is 13.2px, 12px is 10.56px and 10px is 8.8px. The tabs keep the shell's
    // 14px ("tabs font is too small").
    <div className="@container relative flex h-full min-h-0 flex-col overflow-hidden bg-card text-[0.88rem]">
      {/* The picture's soft sky behind the header, with no line under it,
          fading through Dates and Status into the panel (Tyler, 12 Nov 2026:
          "remove the border here and make that part transparent so we can see
          the sky background blended in"). */}
      <div className="shrink-0 bg-gradient-to-b from-sky-100 via-sky-50/70 to-card dark:from-sky-950/50 dark:via-sky-950/20">
      <div className="flex items-center gap-3 py-4 pr-3 pl-4">
        <CoverImage
          url={cover}
          className="size-11 shrink-0 rounded-lg object-cover"
          fallback={
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-card/70 text-muted-foreground">
              <PlaneTakeoffIcon className="size-5" aria-hidden />
            </span>
          }
        />
        <span className="grid min-w-0 flex-1 leading-tight">
          <h2 className="font-heading truncate text-[0.825rem] font-semibold">{name}</h2>
          {trip.destination ? <span className="truncate text-[0.77rem] text-muted-foreground">{trip.destination}</span> : null}
        </span>
        <span className="flex shrink-0 items-center">
          {menu}
          <SidePanelCollapseButton side="right" label="Hide the trip" />
        </span>
      </div>

      <TripFacts trip={trip} />
      </div>

      {binned ? (
        <p className="p-4 text-[0.77rem] text-muted-foreground">In the Bin. Put it back from the ⋮ to open it again.</p>
      ) : (
        <>
          {/* The tabs keep the shell's size, as every other tab row has it (Tyler, 12 Nov 2026: "tabs font is too small"),
              on a faint grey band ("add a faint light gray bg over the tabs"). */}
          <DashboardCardHeader className="shrink-0 bg-muted/40 px-3">
            <DashboardTabs
              value={tab}
              onValueChange={(next) => setTab(next as Tab)}
              tabs={[
                { value: "itinerary", label: "Itinerary", count: contents?.days.length ?? trip.days },
                { value: "photos", label: "Photos", count: contents?.photos.length },
                { value: "notes", label: "Notes", count: contents?.notes.length },
              ]}
            />
          </DashboardCardHeader>
          <ScrollArea className="min-h-0 flex-1">
            {contents ? (
              tab === "itinerary" ? (
                <Itinerary days={contents.days} cardPhoto={contents.cardPhoto} typesById={context?.typesById ?? new Map()} onOpen={openAt} />
              ) : tab === "photos" ? (
                <Photos photos={contents.photos} onOpen={openAt} />
              ) : (
                <Notes notes={contents.notes} onOpen={openAt} />
              )
            ) : read.error ? (
              <ErrorRow message={read.error} onRetry={retry} className="p-4" />
            ) : (
              <LoadingRow label="Loading the trip…" />
            )}
          </ScrollArea>
          {/* Open trip, at the foot (Tyler, 12 Nov 2026: "add a footer button link to the trip"). */}
          <div className={cn("shrink-0 border-t", PANEL_FOOTER_PADDING)}>
            <Button asChild className="w-full">
              <Link to="/trips/$tripId" params={{ tripId: trip.id }}>
                <ArrowUpRightIcon className="size-4" />
                Open trip
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  )
  return context ? <TripProvider value={context}>{panel}</TripProvider> : panel
}

/**
 * Dates and Status, side by side with a line between when the panel is wide
 * enough, one under the other when it isn't.
 */
function TripFacts({ trip }: { trip: TripListRow }) {
  const dates = formatTripDates(trip.startDate, trip.days)
  const binLine = trip.deletedAt ? binGoesLine(trip.deletedAt) : null
  const under = [
    ...trip.tags,
    trip.rating === null ? NOT_RATED : `${trip.rating.toLocaleString(undefined, { maximumFractionDigits: 1 })} of 5 stars`,
  ].join(" · ")
  return (
    <dl className="grid shrink-0 grid-cols-1 border-b @[18rem]:grid-cols-2">
      <div className="grid min-w-0 gap-0.5 px-4 py-3">
        <dt className="text-[0.77rem] text-muted-foreground">Dates</dt>
        <dd className="truncate font-medium">{dates ?? "No dates yet"}</dd>
        {binLine || trip.startDate ? (
          <dd className="truncate text-[0.77rem] text-muted-foreground">{binLine ?? countdown(trip)}</dd>
        ) : null}
      </div>
      <div className="grid min-w-0 gap-0.5 border-t px-4 py-3 @[18rem]:border-t-0 @[18rem]:border-l">
        <dt className="text-[0.77rem] text-muted-foreground">Status</dt>
        <dd className="flex min-w-0 items-center gap-2 font-medium">
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[trip.status])} />
          <span className="truncate">{TRIP_STATUS_LABEL[trip.status]}</span>
        </dd>
        <dd className="truncate text-[0.77rem] text-muted-foreground">{under}</dd>
      </div>
    </dl>
  )
}

type Contents = ReturnType<typeof tripContents>

/** The trip's days with their cards, its photos (each picture once) and its notes, pinned first. */
function tripContents(page: TripPage) {
  const columns = boardColumns(page.trip.days, page.activities)
  const info = readDayInfo(page.trip)
  const days = Array.from({ length: page.trip.days }, (_, index) => {
    const date = dateOfDay(page.trip.startDate, index + 1)
    return {
      day: index + 1,
      date: date ? formatDayDate(date) : null,
      // The day's own description, written in its heading on the board.
      note: info[index]?.note.trim() ?? "",
      cards: columns.get(columnKey(index + 1)) ?? [],
    }
  })
  const byActivity = new Map<string, string[]>()
  for (const photo of page.photos) byActivity.set(photo.activityId, [...(byActivity.get(photo.activityId) ?? []), photo.url])
  const photos = new Map<string, { url: string; activityId: string; title: string }>()
  for (const activity of page.activities) {
    for (const url of [activity.photoUrl, ...(byActivity.get(activity.id) ?? [])]) {
      if (url && !photos.has(url)) photos.set(url, { url, activityId: activity.id, title: activity.title })
    }
  }
  // Each card's own picture, or its first other photo, for its row in the Itinerary.
  const cardPhoto = new Map<string, string>()
  for (const activity of page.activities) {
    const url = activity.photoUrl ?? byActivity.get(activity.id)?.[0]
    if (url) cardPhoto.set(activity.id, url)
  }
  return { days, photos: [...photos.values()], notes: page.notes, cardPhoto }
}

const ROW = "flex w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"

/**
 * Each day: a tile with its number, its date, how many activities and an
 * arrow. Pressing a day folds open its activities in place, never leaving for
 * the trip page (Tyler, 12 Nov 2026: "dont link the days to the trip page.
 * Just open a toggle to show the title of the activities, its icon and time
 * of day"), drawn from his picture ("style it like this"): the open day is a
 * grey band to the panel's edges with its tile in blue, each activity has its photo (its own
 * picture, else its first other photo, else its type's icon), its name and its time, and "Open day plan" at the
 * band's foot. An activity opens on the trip page ("clicking on the activity
 * links to the activity page"), as does Open day plan, on the day's first
 * card. The time is a timed card's start, or the part of the day it is set to.
 */
function Itinerary({
  days,
  cardPhoto,
  typesById,
  onOpen,
}: {
  days: Contents["days"]
  cardPhoto: Contents["cardPhoto"]
  typesById: ReadonlyMap<string, ActivityType>
  onOpen: (search: { open?: string }) => void
}) {
  const [open, setOpen] = React.useState<ReadonlySet<number>>(new Set())
  const toggle = (day: number) =>
    setOpen((was) => {
      const next = new Set(was)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] py-1.5">
      {days.map(({ day, date, note, cards }) => {
        const shown = open.has(day)
        return (
          // Open, the day is a grey band running to the panel's edges, with no
          // margin or rounded corners round it (Tyler, 12 Nov 2026: "dont make
          // the toggle open into a card with outer paddings like that").
          <li key={day} className={cn(shown && "bg-muted/60 pb-1")}>
            <button
              type="button"
              className={cn(ROW, shown && "hover:bg-transparent focus-visible:bg-transparent")}
              aria-expanded={shown}
              onClick={() => toggle(day)}
            >
              {/* 32px, 20 out of 100 smaller than the first 40px, its words with it
                  (Tyler, 12 Nov 2026: "reduce the calender icon by 20%"); blue while open. */}
              <span
                className={cn(
                  "grid size-8 shrink-0 place-content-center rounded-md text-center leading-none",
                  shown ? "bg-sky-100 dark:bg-sky-950/60" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "text-[0.44rem] font-medium tracking-wide uppercase",
                    shown ? "text-sky-700/70 dark:text-sky-300/70" : "text-muted-foreground"
                  )}
                >
                  Day
                </span>
                <span className="text-[0.616rem] font-semibold">{day}</span>
              </span>
              {/* The day's description under its date (Tyler, 12 Nov 2026: "add trip discription here"),
                  and how many activities beside the date as a chip ("move the activities here and style it in a chip"). */}
              <span className="grid min-w-0 flex-1">
                {/* The date always shows whole; at the panel's narrowest the chip drops under it
                    rather than squeezing the date to its first letter (Travel polish part 4). */}
                <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="whitespace-nowrap">{date ?? `Day ${day}`}</span>
                  {/* A filled chip, as the tabs' counts are; white on an open day's grey band. */}
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-1.5 py-0.5 text-[0.77rem] leading-none whitespace-nowrap text-muted-foreground",
                      shown ? "bg-card" : "bg-muted"
                    )}
                  >
                    {cards.length ? `${cards.length} ${cards.length === 1 ? "activity" : "activities"}` : "Free"}
                  </span>
                </span>
                {note ? <span className="truncate text-[0.77rem] text-muted-foreground">{note}</span> : null}
              </span>
              <ChevronRightIcon
                className={cn("size-4 shrink-0 text-muted-foreground transition-transform", shown && "rotate-90")}
                aria-hidden
              />
            </button>
            {shown ? (
              <div className="grid grid-cols-[minmax(0,1fr)] px-3">
                {cards.length ? (
                  <ul className="grid grid-cols-[minmax(0,1fr)]" aria-label={`Day ${day}'s activities`}>
                    {cards.map((card) => {
                      const photo = cardPhoto.get(card.id)
                      const when = card.startTime
                        ? formatTime(card.startTime)
                        : card.dayPart
                          ? DAY_PART_LABEL[card.dayPart]
                          : null
                      return (
                        <li key={card.id}>
                          <button
                            type="button"
                            className="flex w-full min-w-0 items-center gap-3 rounded-lg px-1 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                            onClick={() => onOpen({ open: card.id })}
                          >
                            {photo ? (
                              <img
                                src={smallPhoto(photo)}
                                alt=""
                                loading="lazy"
                                className="size-7 shrink-0 rounded-md object-cover"
                              />
                            ) : (
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-card">
                                <ActivityTypeIcon type={card.typeId ? typesById.get(card.typeId) : null} />
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate">{card.title}</span>
                            {when ? <span className="shrink-0 text-[0.77rem] text-muted-foreground">{when}</span> : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="px-1 py-1.5 text-[0.77rem] text-muted-foreground">Nothing planned on this day.</p>
                )}
                <button
                  type="button"
                  className="justify-self-start rounded-md px-1 py-1.5 text-[0.77rem] font-medium text-sky-700 hover:underline focus-visible:underline focus-visible:outline-none dark:text-sky-300"
                  onClick={() => onOpen(cards[0] ? { open: cards[0].id } : {})}
                >
                  Open day plan
                </button>
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** The trip's photos; one opens the trip on its card. */
function Photos({ photos, onOpen }: { photos: Contents["photos"]; onOpen: (search: { open?: string }) => void }) {
  if (photos.length === 0) return <p className="p-4 text-[0.77rem] text-muted-foreground">No photos on this trip yet.</p>
  return (
    <div className="grid grid-cols-2 gap-1.5 p-3 @[18rem]:grid-cols-3 [&>*]:min-w-0">
      {photos.map((photo) => (
        <button
          key={photo.url}
          type="button"
          aria-label={`Open ${photo.title}`}
          className="aspect-square overflow-hidden rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => onOpen({ open: photo.activityId })}
        >
          <img src={smallPhoto(photo.url)} alt="" loading="lazy" className="size-full object-cover" />
        </button>
      ))}
    </div>
  )
}

/** The trip's notes, pinned first as the trip keeps them; one opens in the trip's left panel. */
function Notes({ notes, onOpen }: { notes: TripPage["notes"]; onOpen: (search: { note?: string }) => void }) {
  if (notes.length === 0) return <p className="p-4 text-[0.77rem] text-muted-foreground">No notes on this trip yet.</p>
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] py-1.5">
      {notes.map((note) => (
        <li key={note.id}>
          <button type="button" className={ROW} onClick={() => onOpen({ note: note.id })}>
            {note.pinned ? <PinIcon className={cn("size-4 shrink-0", STAR_ON)} aria-label="Pinned" /> : null}
            <span className="min-w-0 flex-1 truncate">{noteFirstLine(note.body)}</span>
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  )
}
