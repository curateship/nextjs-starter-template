import * as React from "react"
import { CalendarIcon, CopyIcon, FileTextIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { FooterState, RecordFrame } from "@/components/crm/record-frame"
import { CategoryCombobox } from "@/components/directory/category-combobox"
import { CustomFieldGroups } from "@/components/directory/custom-field-groups"
import { ListingPicker } from "@/components/directory/listing-picker"
import { DetailNote } from "@/components/directory/listings-dashboard/detail-rows"
import {
  AutoSaveWords,
  PickGroup,
  RecordMenu,
  useAutoSave,
  type MenuAction,
} from "@/components/directory/listings-dashboard/section-parts"
import { EventDatesList, EventRepeatFields, SeriesDateNote } from "@/components/events/event-repeat-cards"
import { EventScheduleRow } from "@/components/events/event-schedule-row"
import { EventSignUpsFields } from "@/components/events/event-sign-ups-card"
import { PostEditor } from "@/components/posts/post-editor"
import { CharacterCount } from "@/components/shared/character-count"
import { ImageUpload } from "@/components/shared/image-upload"
import { PickDayRow, PickMenuRow, PickRow } from "@/components/shared/notes/pick-rows"
import { PanelCard } from "@/components/shared/panel-card"
import { RecordPreviewLink } from "@/components/shared/record-preview-link"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { Category } from "@/lib/api/directory/categories"
import {
  getEventErrorMessage,
  loadEventForEdit,
  saveEvent,
  type EventForEdit,
  type EventSignUp,
  type EventWaitingPerson,
} from "@/lib/api/events/events"
import type { ListingChoice } from "@/lib/api/posts/posts"
import { categoryTreeOrder } from "@/lib/directory/category-tree"
import { formCustomValues, type CustomValues } from "@/lib/directory/custom-fields"
import { slugFromTitle } from "@/lib/directory/slugs"
import { describeRepeat, repeatProblem, type RepeatRule } from "@/lib/events/event-repeat"
import { formatEventClock, formatEventShortDay } from "@/lib/events/event-time"
import { dayForPicker, dayFromPicker } from "@/lib/events/picker-day"
import { readSeats } from "@/lib/events/sign-up-fields"
import { cleanTicketsUrl, TICKETS_URL_MAX } from "@/lib/events/tickets-url"
import { formatDate } from "@/lib/format/format-time"
import { useLoad } from "@/lib/hooks/use-load"
import type { PostBody } from "@/lib/posts/post-body"

const SUMMARY_MAX = 300

const STATUS_LABELS = { draft: "Draft", published: "Published" } as const
const VISIBILITY_LABELS = { public: "Public", private: "Private, link only" } as const

/**
 * One event on the right of the Events dashboard (task events/37, Part 1).
 * It is the shell's record frame, and every field saves itself, as the
 * Listing record on the Listings dashboard does.
 *
 * - **Header:** the cover, the title with its status and address, the public
 *   page's link, the ⋮ and the collapse button.
 * - **The ⋮** holds what were the panel's cards (Tyler, 19 Nov 2026: "Move
 *   all these blocks into the right panel header 3 dot dropdown"). General
 *   has The event, When and where (with Repeat) and Publishing as grey rows,
 *   then Duplicate and Delete. Sign-ups and Later dates are tabs of their
 *   own, because they are lists of people and dates, not single values.
 * - **Body:** a featured spot's card when the row passes one, the
 *   automation's source line, and the Body editor.
 * - **Footer:** whether it is saved, and Publish or Unpublish.
 */
export function EventRecord({
  eventId,
  title,
  categories,
  actions,
  onSaved,
  onOpenEvent,
  extra,
}: {
  eventId: string
  /** The row's name, for the header while the record is read. */
  title: string
  categories: Category[]
  /**
   * Duplicate and Delete, from the Events row that owns them. The Sign-ups
   * and Featured events rows leave them out, so the ⋮ holds the event's
   * settings alone there.
   */
  actions?: { duplicate: () => void; remove: () => void; busy: boolean }
  onSaved: () => void
  /** Opens another event on the right: a date of this one, or its main. */
  onOpenEvent: (id: string) => void
  /** A card of the row's own above the event's, such as a featured spot. */
  extra?: React.ReactNode
}) {
  // Wrapped, so an event that is gone (an answer of null) is told apart from
  // one still being read.
  const read = useLoad(() => loadEventForEdit(eventId).then((data) => ({ data })), getEventErrorMessage, {
    keys: [eventId],
  })
  const data = read.data?.data

  if (!data) {
    return (
      <RecordFrame
        avatar={<CalendarIcon aria-hidden />}
        title={title}
        hideLabel="Hide the event"
        body={
          read.error ? (
            <ErrorRow message={read.error} onRetry={read.retry} />
          ) : read.data ? (
            <DetailNote>That event no longer exists.</DetailNote>
          ) : (
            <LoadingRow label="Opening the event…" />
          )
        }
      />
    )
  }
  return (
    <EventForm
      key={eventId}
      data={data}
      categories={categories}
      actions={actions}
      onSaved={onSaved}
      onOpenEvent={onOpenEvent}
      extra={extra}
    />
  )
}

/** "Thu, Oct 29", "Thu, Oct 29 and Thu, Nov 5", "a, b and c". */
function listOfDays(days: string[]): string {
  const names = days.map(formatEventShortDay)
  return names.length === 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

function readable(check: () => unknown): boolean {
  try {
    check()
    return true
  } catch {
    return false
  }
}

/**
 * The line under a typed street address saying whether the event page has a
 * map for it. The lookup happens on save, only when the address has changed.
 */
function mapStatus(address: string, data: EventForEdit): string {
  if (!data.canLocate) {
    return "No map: this site has no Google Maps API key under Near me search in Settings → Directory."
  }
  if (address.trim() !== data.event.locatedFor) return "The address is looked up for the map when it saves."
  return data.event.position
    ? "On the map on the event page."
    : "Google could not find this address, so the event page has no map. Check the spelling."
}

/** "www.eventbrite.ca/e/123" shows as "eventbrite.ca", so the row's value fits. */
function linkHost(url: string): string {
  try {
    return new URL(url.trim()).host.replace(/^www\./, "")
  } catch {
    return url.trim()
  }
}

/**
 * A switch in one of the ⋮'s grey lists: the name on the left, muted like
 * every row's, and the switch on the right. A press saves it, as a pick does.
 */
function SwitchRow({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm">
      <FieldLabel htmlFor={id} hint={hint} className="[&_label]:font-normal [&_label]:text-muted-foreground">
        {label}
      </FieldLabel>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function EventForm({
  data,
  categories,
  actions,
  onSaved,
  onOpenEvent,
  extra,
}: {
  data: EventForEdit
  categories: Category[]
  actions?: { duplicate: () => void; remove: () => void; busy: boolean }
  onSaved: () => void
  onOpenEvent: (id: string) => void
  extra?: React.ReactNode
}) {
  const event = data.event
  const series = data.series
  const isDate = Boolean(series.main)

  const [title, setTitle] = React.useState(event.title)
  const [slug, setSlug] = React.useState(event.slug)
  // The address part saves when its box is left, never mid-word.
  const [savedSlug, setSavedSlug] = React.useState(event.slug)
  const [summary, setSummary] = React.useState(event.summary)
  const [coverImage, setCoverImage] = React.useState(event.coverImage)
  const [status, setStatus] = React.useState(event.status)
  // Saved through its own door after a confirm, never by the autosave below.
  const [schedule, setSchedule] = React.useState(event.scheduleStatus)
  const [visibility, setVisibility] = React.useState(event.visibility)
  const [featured, setFeatured] = React.useState(event.featured)
  const [ticketsUrl, setTicketsUrl] = React.useState(event.ticketsUrl)
  const [startDate, setStartDate] = React.useState(event.startDate)
  const [startTime, setStartTime] = React.useState(event.startTime)
  // A same-day end is stored as the start day; the box shows it empty.
  const [endDate, setEndDate] = React.useState(event.endDate && event.endDate !== event.startDate ? event.endDate : "")
  const [endTime, setEndTime] = React.useState(event.endTime ?? "")
  const [picked, setPicked] = React.useState<ListingChoice | null>(data.placeListing)
  const [listingId, setListingId] = React.useState(event.listingId ?? "")
  const [placeName, setPlaceName] = React.useState(data.placeListing?.title ?? event.placeName)
  const [placeAddress, setPlaceAddress] = React.useState(data.placeListing?.address ?? event.placeAddress)
  const [repeat, setRepeat] = React.useState<RepeatRule | null>(event.repeat)
  const [takesSignUps, setTakesSignUps] = React.useState(event.takesSignUps)
  const [seats, setSeats] = React.useState(event.seats === null ? "" : String(event.seats))
  const [closeHours, setCloseHours] = React.useState(event.signUpsCloseHours)
  const [question, setQuestion] = React.useState(event.signUpQuestion)
  const [questionRequired, setQuestionRequired] = React.useState(event.signUpQuestionRequired)
  const [categoryIds, setCategoryIds] = React.useState<string[]>(() => [...data.categoryIds].sort())
  const [body, setBody] = React.useState<PostBody>(event.body)
  // The site's own event fields (task events/07), every one with a value so
  // the form compares like with like; the server keeps only what is filled in.
  const [customValues, setCustomValues] = React.useState<CustomValues>(() =>
    formCustomValues(data.customSections, data.customValues)
  )
  const [listings, setListings] = React.useState<Map<string, ListingChoice>>(
    () => new Map(data.listings.map((row) => [row.id, row]))
  )
  /** Who is coming and who is waiting. Removing or adding somebody changes them at once. */
  const [signUps, setSignUps] = React.useState<EventSignUp[]>(data.signUps)
  const [waitingList, setWaitingList] = React.useState<EventWaitingPerson[]>(data.waitingList)

  const seatsOk = !takesSignUps || readable(() => readSeats(seats))
  const ticketsOk = readable(() => cleanTicketsUrl(ticketsUrl))
  // Checked here as well as on the server, so a repeat half picked (weekly
  // with no day ticked yet) or an end typed before its start waits rather
  // than being sent, refused and toasted while the admin is still clicking.
  const repeatOk = isDate || !repeat || !startDate || !repeatProblem(repeat, startDate)
  const endOk = !endTime || !startTime || (endDate && endDate > startDate) || endTime > startTime
  const endDayOk = !endDate || !startDate || endDate >= startDate
  const ready = Boolean(title.trim() && startDate && startTime && seatsOk && ticketsOk && repeatOk && endOk && endDayOk)
  const why = !title.trim()
    ? "Give it a title to save"
    : !startDate || !startTime
      ? "Give it a day and a start time to save"
      : !endOk || !endDayOk
        ? "The end comes before the start. Fix it to save"
        : !repeatOk
          ? "Finish the repeat to save"
          : !seatsOk
            ? "Fix the seats to save"
            : !ticketsOk
              ? "Fix the tickets link to save"
              : undefined

  const value = {
    title,
    slug: savedSlug,
    summary,
    coverImage,
    status,
    visibility,
    featured,
    ticketsUrl,
    when: { startDate, startTime, endDate: endDate || null, endTime: endTime || null },
    listingId: listingId || null,
    placeName,
    placeAddress,
    repeat,
    takesSignUps,
    seats,
    signUpsCloseHours: closeHours,
    signUpQuestion: question,
    signUpQuestionRequired: questionRequired,
    categoryIds,
    body,
    customValues,
  }

  const auto = useAutoSave({
    value,
    ready,
    message: getEventErrorMessage,
    save: async (next) => {
      const { seats: typedSeats, repeat: nextRepeat, featured: nextFeatured, ticketsUrl: typedTickets, ...rest } = next
      const saved = await saveEvent({
        id: event.id,
        ...rest,
        ticketsUrl: cleanTicketsUrl(typedTickets),
        // Read only while sign-ups are on; with them off the seats stay as saved.
        ...(rest.takesSignUps ? { seats: readSeats(typedSeats) } : {}),
        // One date of a repeat never carries a rule or a featured switch of
        // its own: both belong to the main event.
        ...(isDate ? {} : { repeat: nextRepeat, featured: nextFeatured }),
      })
      onSaved()
      if (saved.keptDates.length) {
        toast.warning(
          `${listOfDays(saved.keptDates)} ${saved.keptDates.length === 1 ? "was" : "were"} changed on ${saved.keptDates.length === 1 ? "its" : "their"} own, so kept as ${saved.keptDates.length === 1 ? "it is" : "they are"}. Open ${saved.keptDates.length === 1 ? "it" : "them"} under Later dates to change or delete ${saved.keptDates.length === 1 ? "it" : "them"}.`,
          { duration: 15_000 }
        )
      }
      if (saved.keptForSignUps.length) {
        toast.warning(
          `${listOfDays(saved.keptForSignUps)} ${saved.keptForSignUps.length === 1 ? "has" : "have"} people signed up, so ${saved.keptForSignUps.length === 1 ? "it was" : "they were"} kept. Open ${saved.keptForSignUps.length === 1 ? "it" : "them"} under Later dates to change or delete ${saved.keptForSignUps.length === 1 ? "it" : "them"}.`,
          { duration: 15_000 }
        )
      }
    },
  })

  const orderedCategories = React.useMemo(() => categoryTreeOrder(categories), [categories])
  const checked = React.useMemo(() => new Set(categoryIds), [categoryIds])

  const menuActions: MenuAction[] = actions
    ? [
        { label: "Duplicate", icon: <CopyIcon className="size-4" />, onSelect: actions.duplicate, disabled: actions.busy },
        {
          label: "Delete event",
          icon: <Trash2Icon className="size-4" />,
          destructive: true,
          onSelect: actions.remove,
          disabled: actions.busy,
        },
      ]
    : []

  const pickedCategoryNames = orderedCategories.filter((row) => checked.has(row.category.id)).map((row) => row.category.name)

  return (
    <RecordFrame
      avatar={
        coverImage ? <img src={coverImage} alt="" className="size-6 rounded-md object-cover" /> : <CalendarIcon aria-hidden />
      }
      title={title.trim() || "Untitled event"}
      line={`${STATUS_LABELS[status]}${visibility === "private" ? ", private" : ""}${schedule === "scheduled" ? "" : `, ${schedule}`} · /events/${savedSlug}`}
      hideLabel="Hide the event"
      actions={
        <>
          <RecordPreviewLink word="event" path={`/events/${savedSlug}`} published={status === "published"} />
          <RecordMenu
            label="Event menu"
            actions={menuActions}
            tabs={[
              {
                value: "sign-ups",
                label: "Sign-ups",
                content: (
                  <div className="p-3">
                    <EventSignUpsFields
                      eventId={event.id}
                      takesSignUps={takesSignUps}
                      seats={seats}
                      savedSeats={event.seats}
                      closeHours={closeHours}
                      question={question}
                      questionRequired={questionRequired}
                      savedQuestion={event.signUpQuestion}
                      signUps={signUps}
                      waitingList={waitingList}
                      disabled={false}
                      seatsInvalid={!seatsOk}
                      onTakesSignUpsChange={setTakesSignUps}
                      onSeatsChange={setSeats}
                      onCloseHoursChange={setCloseHours}
                      onQuestionChange={setQuestion}
                      onQuestionRequiredChange={setQuestionRequired}
                      onListsChange={(lists) => {
                        setSignUps(lists.signUps)
                        setWaitingList(lists.waitingList)
                      }}
                    />
                  </div>
                ),
              },
              ...(series.dates.length
                ? [
                    {
                      value: "later-dates",
                      label: "Later dates",
                      content: (
                        <div className="p-3">
                          <EventDatesList series={series} disabled={false} onOpenDate={onOpenEvent} />
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
            groups={
              <>
                <PickGroup title="The event">
                  <PickRow label="Title" value={title.trim() || "None"} empty={!title.trim()}>
                    <div className="grid gap-2">
                      <FieldLabel htmlFor="event-title">Title</FieldLabel>
                      <Input id="event-title" value={title} aria-invalid={!title.trim()} onChange={(e) => setTitle(e.target.value)} />
                    </div>
                  </PickRow>
                  <PickRow label="Address part" value={savedSlug}>
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor="event-slug"
                        hint="The part after /events/ in the event's address. Changing it changes the address. Old links forward to the new one."
                      >
                        Address part
                      </FieldLabel>
                      <Input
                        id="event-slug"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        onBlur={() => {
                          const next = slug.trim() || slugFromTitle(title)
                          setSlug(next)
                          setSavedSlug(next)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur()
                        }}
                      />
                    </div>
                  </PickRow>
                  <PickRow label="Summary" value={summary.trim() || "None"} empty={!summary.trim()}>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <FieldLabel
                          htmlFor="event-summary"
                          hint="One or two sentences. Shown under the title on the event's page and when it is shared."
                        >
                          Summary
                        </FieldLabel>
                        <CharacterCount value={summary} max={SUMMARY_MAX} />
                      </div>
                      <Textarea
                        id="event-summary"
                        rows={4}
                        maxLength={SUMMARY_MAX}
                        value={summary}
                        className="resize-none"
                        onChange={(e) => setSummary(e.target.value)}
                      />
                    </div>
                  </PickRow>
                  <PickRow
                    label="Cover image"
                    value={coverImage ? <img src={coverImage} alt="" className="size-6 rounded-md object-cover" /> : "None"}
                    empty={!coverImage}
                  >
                    <div className="grid gap-2">
                      <FieldLabel hint="Shown at the top of the event's page and when it is shared.">Cover image</FieldLabel>
                      <ImageUpload
                        label="Cover image"
                        showLabel={false}
                        value={coverImage}
                        onChange={setCoverImage}
                        aspect="square"
                        fit="cover"
                        className="max-w-24"
                      />
                    </div>
                  </PickRow>
                  <PickRow
                    label="Tickets link"
                    value={ticketsOk ? linkHost(ticketsUrl) || "None" : <span className="text-destructive">Not a full address</span>}
                    empty={ticketsOk && !ticketsUrl.trim()}
                  >
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor="event-tickets-url"
                        hint="Where tickets are sold, like Eventbrite or the venue's own page. The event's page shows a Get tickets button, and Google is told where to buy them. Leave empty for none."
                      >
                        Tickets link
                      </FieldLabel>
                      <Input
                        id="event-tickets-url"
                        type="url"
                        inputMode="url"
                        value={ticketsUrl}
                        maxLength={TICKETS_URL_MAX}
                        placeholder="https://www.eventbrite.ca/e/..."
                        aria-invalid={!ticketsOk}
                        onChange={(e) => setTicketsUrl(e.target.value)}
                      />
                      {!ticketsOk ? (
                        <p className="text-xs text-destructive">The tickets link has to be a full address starting https://.</p>
                      ) : null}
                    </div>
                  </PickRow>
                  <PickRow
                    label="Categories"
                    value={pickedCategoryNames.length ? pickedCategoryNames.join(", ") : "None"}
                    empty={!pickedCategoryNames.length}
                  >
                    <div className="grid gap-2">
                      <FieldLabel htmlFor="event-category">Categories</FieldLabel>
                      <p className="text-sm text-muted-foreground">The same categories listings and posts are filed under.</p>
                      <CategoryCombobox
                        idPrefix="event-category"
                        rows={orderedCategories}
                        checked={checked}
                        onToggle={(id) =>
                          setCategoryIds((current) =>
                            (current.includes(id) ? current.filter((each) => each !== id) : [...current, id]).sort()
                          )
                        }
                      />
                    </div>
                  </PickRow>
                </PickGroup>

                <PickGroup
                  title="When and where"
                  after={
                    <div className="grid gap-1 px-0.5 text-xs text-muted-foreground">
                      <p>Times are the site's own clock, in the time zone set in Settings → Directory.</p>
                      {!listingId && placeAddress.trim() ? <p role="status">{mapStatus(placeAddress, data)}</p> : null}
                    </div>
                  }
                >
                  <PickDayRow
                    label="Start day"
                    value={startDate ? formatEventShortDay(startDate) : "None"}
                    empty={!startDate}
                    day={dayForPicker(startDate) ?? null}
                    onPick={(day) => setStartDate(dayFromPicker(day ?? undefined))}
                  />
                  <PickRow label="Start time" value={startTime ? formatEventClock(startTime) : "None"} empty={!startTime}>
                    <div className="grid gap-2">
                      <FieldLabel htmlFor="event-start-time">Start time</FieldLabel>
                      <Input
                        id="event-start-time"
                        type="time"
                        value={startTime}
                        aria-invalid={!startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                      />
                    </div>
                  </PickRow>
                  <PickDayRow
                    label="End day"
                    value={endDate ? formatEventShortDay(endDate) : "Same day"}
                    empty={!endDate}
                    clearLabel="Same day"
                    day={dayForPicker(endDate) ?? null}
                    onPick={(day) => setEndDate(dayFromPicker(day ?? undefined))}
                  />
                  <PickRow label="End time" value={endTime ? formatEventClock(endTime) : "None"} empty={!endTime}>
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor="event-end-time"
                        hint="Optional. With no end time, the page shows only the start, and the event counts as over when its day is over."
                      >
                        End time
                      </FieldLabel>
                      <Input id="event-end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                    </div>
                  </PickRow>
                  <PickRow label="Place" value={placeName.trim() || "None"} empty={!placeName.trim()}>
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <FieldLabel htmlFor="event-place-name">Place</FieldLabel>
                        <Input
                          id="event-place-name"
                          value={placeName}
                          maxLength={200}
                          placeholder="Trinity Bellwoods Park"
                          disabled={Boolean(listingId)}
                          onChange={(e) => setPlaceName(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <FieldLabel htmlFor="event-place-address">Street address</FieldLabel>
                        <Input
                          id="event-place-address"
                          value={placeAddress}
                          maxLength={300}
                          placeholder="790 Queen St W, Toronto"
                          disabled={Boolean(listingId)}
                          onChange={(e) => setPlaceAddress(e.target.value)}
                        />
                      </div>
                      {listingId ? (
                        <div className="grid gap-2">
                          <p className="text-sm text-muted-foreground">
                            {picked?.status === "draft"
                              ? "The place is a draft listing. The event page names it without a link until the listing is published."
                              : "The place is one of this site's listings. The event page links to it and follows its name, address and map pin."}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-fit"
                            onClick={() => {
                              setListingId("")
                              setPicked(null)
                            }}
                          >
                            Type a place instead
                          </Button>
                        </div>
                      ) : (
                        <ListingPicker
                          label="Pick a listing"
                          inputId="event-place-listing-search"
                          onPick={(listing) => {
                            setPicked(listing)
                            setListingId(listing.id)
                            setPlaceName(listing.title)
                            setPlaceAddress(listing.address)
                          }}
                        />
                      )}
                    </div>
                  </PickRow>
                  <PickRow
                    label="Repeat"
                    value={
                      isDate ? (
                        "One date of a repeat"
                      ) : !repeat ? (
                        "None"
                      ) : repeatOk ? (
                        describeRepeat(repeat)
                      ) : (
                        <span className="text-destructive">Not finished</span>
                      )
                    }
                    empty={!isDate && !repeat}
                  >
                    {series.main ? (
                      <SeriesDateNote
                        main={series.main}
                        editedAlone={event.editedAlone}
                        disabled={false}
                        onOpenMain={() => onOpenEvent(series.main!.id)}
                      />
                    ) : (
                      <EventRepeatFields repeat={repeat} startDate={startDate} disabled={false} onChange={setRepeat} />
                    )}
                  </PickRow>
                </PickGroup>

                <CustomFieldGroups noun="event" sections={data.customSections} values={customValues} onChange={setCustomValues} />

                <PickGroup
                  title="Publishing"
                  after={
                    !isDate && data.paidSpot ? (
                      <p className="px-0.5 text-xs text-muted-foreground">
                        {data.paidSpot.buyerEmail} paid to feature it until it ends on {formatDate(data.paidSpot.endsAt)}, so it
                        stays featured with Featured off. Stop it on the Featured events row.
                      </p>
                    ) : null
                  }
                >
                  <PickMenuRow
                    label="Status"
                    value={STATUS_LABELS[status]}
                    options={(["draft", "published"] as const).map((each) => ({ value: each, label: STATUS_LABELS[each] }))}
                    selected={status}
                    onPick={(next) => setStatus(next as typeof status)}
                  />
                  <EventScheduleRow
                    event={{ id: event.id, title, startDate, startTime }}
                    status={schedule}
                    repeats={!isDate && Boolean(repeat)}
                    signedUp={signUps.length}
                    waiting={waitingList.length}
                    onChanged={(saved) => {
                      setSchedule(saved.scheduleStatus)
                      // A new date was saved on the server; the form takes it, or
                      // its next save would put the old one back.
                      setStartDate(saved.startDate)
                      setStartTime(saved.startTime)
                      setEndDate(saved.endDate && saved.endDate !== saved.startDate ? saved.endDate : "")
                      setEndTime(saved.endTime ?? "")
                      onSaved()
                    }}
                  />
                  <PickMenuRow
                    label="Who can find it"
                    value={VISIBILITY_LABELS[visibility]}
                    options={(["public", "private"] as const).map((each) => ({ value: each, label: VISIBILITY_LABELS[each] }))}
                    selected={visibility}
                    onPick={(next) => setVisibility(next as typeof visibility)}
                  />
                  {/* A date of a repeat follows its main event, so the switch lives on the main event only. */}
                  {isDate ? null : (
                    <SwitchRow
                      id="event-featured"
                      label="Featured"
                      hint="A featured event sits at the top of the Events page's list and is marked in the calendar until it ends. A repeating event puts its next date on top. Free when you switch it on here."
                      checked={featured}
                      onCheckedChange={setFeatured}
                    />
                  )}
                </PickGroup>
              </>
            }
          />
        </>
      }
      body={
        <>
          {extra}
          {event.sourceUrl ? (
            <p className="text-sm text-muted-foreground">
              An automation drafted this from{" "}
              <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2 hover:text-foreground">
                {event.sourceUrl}
              </a>
              . Check the day and time against that page before publishing.
            </p>
          ) : null}

          <PanelCard storageId="event-body" icon={<FileTextIcon />} title="Body">
            <PostEditor
              flush
              value={body}
              listings={listings}
              onChange={setBody}
              onListingPicked={(listing) => setListings((current) => new Map(current).set(listing.id, listing))}
            />
          </PanelCard>
        </>
      }
      footer={
        <>
          <FooterState>
            <AutoSaveWords state={auto.state} ready={ready} why={why} />
          </FooterState>
          {status === "published" ? (
            <Button type="button" variant="outline" onClick={() => setStatus("draft")}>
              Unpublish
            </Button>
          ) : (
            <Button type="button" onClick={() => setStatus("published")}>
              Publish
            </Button>
          )}
        </>
      }
    />
  )
}
