import * as React from "react"
import { format } from "date-fns"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { CategoryChecklist } from "@/components/directory/category-checklist"
import { ListingPicker } from "@/components/directory/listing-picker"
import {
  EventDatesCard,
  EventRepeatCard,
  SeriesDateCard,
} from "@/components/events/event-repeat-cards"
import { PostEditor } from "@/components/posts/post-editor"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { CharacterCount } from "@/components/shared/character-count"
import { ImageUpload } from "@/components/shared/image-upload"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Category } from "@/lib/api/directory/categories"
import {
  getEventErrorMessage,
  loadEventForEdit,
  saveEvent,
  saveNewEvent,
  type EventForEdit,
} from "@/lib/api/events/events"
import type { ListingChoice } from "@/lib/api/posts/posts"
import { categoryTreeOrder } from "@/lib/directory/category-tree"
import { slugFromTitle } from "@/lib/directory/slugs"
import type { RepeatRule } from "@/lib/events/event-repeat"
import { formatEventShortDay } from "@/lib/events/event-time"
import { emptyPostBody, type PostBody } from "@/lib/posts/post-body"
import {
  collapseStorageKey,
  useRememberedCollapse,
} from "@/lib/remembered-choice"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** Longest summary an event may have, matching the column. */
const SUMMARY_MAX = 300

type EventFields = {
  title: string
  slug: string
  summary: string
  coverImage: string
  status: "draft" | "published"
  visibility: "public" | "private"
  /** "2026-09-27", or empty while none is picked. */
  startDate: string
  /** "18:00", or empty. */
  startTime: string
  /** Empty for an event that ends on its start day, or has no end. */
  endDate: string
  endTime: string
  /** One of the site's listings as the place, or empty for a typed one. */
  listingId: string
  placeName: string
  placeAddress: string
  body: PostBody
  categoryIds: string[]
  /** Only ever set on an event that is not itself one date of a repeat. */
  repeat: RepeatRule | null
}

function blankFields(): EventFields {
  return {
    title: "",
    slug: "",
    summary: "",
    coverImage: "",
    status: "draft",
    visibility: "public",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    listingId: "",
    placeName: "",
    placeAddress: "",
    body: emptyPostBody(),
    categoryIds: [],
    repeat: null,
  }
}

function fieldsFrom(data: EventForEdit): EventFields {
  const { event } = data
  return {
    title: event.title,
    slug: event.slug,
    summary: event.summary,
    coverImage: event.coverImage,
    status: event.status,
    visibility: event.visibility,
    startDate: event.startDate,
    startTime: event.startTime,
    // A same-day end is stored as the start day; the form shows it as empty,
    // which means the same thing.
    endDate:
      event.endDate && event.endDate !== event.startDate ? event.endDate : "",
    endTime: event.endTime ?? "",
    // A linked place shows the listing as it is now, not as it was last saved.
    listingId: event.listingId ?? "",
    placeName: data.placeListing?.title ?? event.placeName,
    placeAddress: data.placeListing?.address ?? event.placeAddress,
    body: event.body,
    // Sorted so ticking a box off and on again is not read as an edit.
    categoryIds: [...data.categoryIds].sort(),
    repeat: event.repeat,
  }
}

/** "Thu, Oct 29", "Thu, Oct 29 and Thu, Nov 5", "a, b and c". */
function listOfDays(days: string[]): string {
  const names = days.map(formatEventShortDay)
  return names.length === 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** The picker hands back a day at local midnight; the event stores the day. */
function dayFromPicker(date: Date | undefined): string {
  return date ? format(date, "yyyy-MM-dd") : ""
}

function dayForPicker(day: string): Date | undefined {
  if (!day) return undefined
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year, month - 1, date)
}

/**
 * One event's window, opened over the Events list, for editing and for
 * creating. It loads its own record from the id, so a link straight to
 * `?open=<id>` works whichever page of the list is showing.
 */
export function EventDialog({
  open,
  eventId,
  categories,
  preview,
  onClose,
  onSaved,
  onOpenEvent,
}: {
  open: boolean
  /** The event to edit, or null to create one. */
  eventId: string | null
  categories: Category[]
  /** What the row already says, so a cold open names the event while it loads. */
  preview?: { title: string; status: "draft" | "published" } | null
  onClose: () => void
  /** A save landed, so the list behind the window is stale. */
  onSaved: () => void
  /** Swaps the window to another event: a date of this one, or its main. */
  onOpenEvent: (id: string) => void
}) {
  const [loaded, setLoaded] = React.useState<{
    forId: string
    data: EventForEdit
  } | null>(null)
  /** Set when a create's first half lands, so a retry never makes a twin. */
  const [createdId, setCreatedId] = React.useState<string | null>(null)
  /** Once the address is typed directly, the title stops writing it. */
  const [slugEdited, setSlugEdited] = React.useState(false)
  /** Set by a refused save, so the missing fields are marked. */
  const [tried, setTried] = React.useState(false)
  const [fields, setFields] = React.useState<EventFields>(blankFields)
  /** Listings the cards point at, plus any picked since the window opened. */
  const [listings, setListings] = React.useState<Map<string, ListingChoice>>(
    () => new Map()
  )
  const [saving, setSaving] = React.useState(false)
  /** Another event asked for while this one has unsaved edits. */
  const [leaveFor, setLeaveFor] = React.useState<string | null>(null)
  /** The listing picked as the place since the window opened. */
  const [picked, setPicked] = React.useState<ListingChoice | null>(null)
  const [basicsOpen, setBasicsOpen, basicsNoFlash] = useRememberedCollapse(
    collapseStorageKey.settingsCard("event-basics")
  )
  const [whenOpen, setWhenOpen, whenNoFlash] = useRememberedCollapse(
    collapseStorageKey.settingsCard("event-when")
  )

  const creating = eventId === null && createdId === null
  const ready = eventId === null || loaded?.forId === eventId

  // A closed window forgets what it held, so the next open reads afresh.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) {
      setLoaded(null)
      setCreatedId(null)
      setSlugEdited(false)
      setTried(false)
    }
  }

  React.useEffect(() => {
    if (!open || !eventId) return
    let cancelled = false
    loadEventForEdit(eventId).then(
      (data) => {
        if (cancelled) return
        if (!data) {
          showErrorToast("That event no longer exists.")
          onClose()
          onSaved()
          return
        }
        setLoaded({ forId: eventId, data })
      },
      (error: unknown) => {
        if (cancelled) return
        showErrorToast(getEventErrorMessage(error))
        onClose()
      }
    )
    return () => {
      cancelled = true
    }
    // The fetch runs once per opened id; the callbacks are the parent's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventId])

  // Fill the fields the moment there is something to fill them with, during
  // render, which is how React asks for state that follows a prop.
  const seedKey = open
    ? eventId === null
      ? "new"
      : (loaded?.forId ?? null)
    : null
  const [seededFor, setSeededFor] = React.useState<string | null>(null)
  if (seededFor !== seedKey) {
    setSeededFor(seedKey)
    if (seedKey === "new") {
      setFields(blankFields())
      setListings(new Map())
      setPicked(null)
    } else if (loaded && seedKey === loaded.forId) {
      setFields(fieldsFrom(loaded.data))
      setPicked(loaded.data.placeListing)
      setListings(new Map(loaded.data.listings.map((row) => [row.id, row])))
    }
  }

  const openedWith = React.useMemo(
    () =>
      eventId === null
        ? JSON.stringify(blankFields())
        : loaded
          ? JSON.stringify(fieldsFrom(loaded.data))
          : null,
    [eventId, loaded]
  )
  const dirty =
    openedWith !== null &&
    seededFor === seedKey &&
    JSON.stringify(fields) !== openedWith

  const series = ready && loaded ? loaded.data.series : null
  const openOther = (id: string) => {
    if (dirty) setLeaveFor(id)
    else onOpenEvent(id)
  }

  const update = <Key extends keyof EventFields>(
    key: Key,
    value: EventFields[Key]
  ) => setFields((current) => ({ ...current, [key]: value }))

  const orderedCategories = React.useMemo(
    () => categoryTreeOrder(categories),
    [categories]
  )
  const checked = React.useMemo(
    () => new Set(fields.categoryIds),
    [fields.categoryIds]
  )

  async function save() {
    dismissErrorToast()
    setSaving(true)
    try {
      let id = eventId ?? createdId
      let saved: Awaited<ReturnType<typeof saveEvent>>
      const {
        title,
        slug,
        startDate,
        startTime,
        endDate,
        endTime,
        repeat,
        listingId,
        ...rest
      } = fields
      // One date of a repeat never carries a rule of its own.
      const repeatChange = series?.main ? {} : { repeat }
      const place = { listingId: listingId || null }
      const when = {
        startDate,
        startTime,
        endDate: endDate || null,
        endTime: endTime || null,
      }
      if (!id) {
        const created = await saveNewEvent({
          title,
          slug: slugEdited && slug.trim() ? slug.trim() : undefined,
          when,
        })
        setCreatedId(created.id)
        id = created.id
        // Take the address the server gave it, which may be numbered.
        setFields((current) => ({
          ...current,
          title: created.title,
          slug: created.slug,
        }))
        saved = await saveEvent({ id, ...rest, ...place, ...repeatChange })
      } else {
        saved = await saveEvent({
          id,
          title,
          slug,
          when,
          ...rest,
          ...place,
          ...repeatChange,
        })
      }
      onSaved()
      toast.success(eventId ? "Event saved." : "Event created.")
      if (saved.keptDates.length) {
        const days = listOfDays(saved.keptDates)
        toast.warning(
          saved.keptDates.length === 1
            ? `${days} was changed on its own, so it was kept as it is. Open it under Later dates to change or delete it.`
            : `${days} were changed on their own, so they were kept as they are. Open them under Later dates to change or delete them.`,
          { duration: 15_000 }
        )
      }
      onClose()
    } catch (error) {
      // Every refusal is about the title, the address or the times.
      setTried(true)
      setBasicsOpen(true)
      setWhenOpen(true)
      showErrorToast(getEventErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const title = ready ? fields.title : (preview?.title ?? "")
  const status = ready ? fields.status : preview?.status

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="h-[48rem]">
          <DialogHeader>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <DialogTitle className="min-w-0 truncate">
                {title.trim() || (creating ? "New event" : "Untitled event")}
              </DialogTitle>
              {status === "published" ? (
                <Badge variant="secondary">Published</Badge>
              ) : status === "draft" ? (
                <Badge variant="outline">Draft</Badge>
              ) : null}
            </div>
            <DialogDescription>
              {creating
                ? "It starts as a draft. Nothing is public until it is published."
                : "What is written here is what the event's page shows."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {!ready ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CollapsibleSettingsCard
                  size="sm"
                  storageId="event-basics"
                  collapse={{
                    open: basicsOpen,
                    onOpenChange: setBasicsOpen,
                    noFlashKey: basicsNoFlash,
                  }}
                  title="The event"
                  description="The title, address, summary, who can find it and cover image. A draft is never shown to a visitor."
                  contentClassName="grid gap-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="grid gap-2 sm:flex-1">
                      <FieldLabel htmlFor="event-title">Title</FieldLabel>
                      <Input
                        id="event-title"
                        value={fields.title}
                        disabled={saving}
                        aria-invalid={tried && !fields.title.trim()}
                        onChange={(event) => {
                          const next = event.target.value
                          setFields((current) => ({
                            ...current,
                            title: next,
                            // While creating, the address follows the title
                            // until it is typed in directly.
                            slug:
                              creating && !slugEdited
                                ? slugFromTitle(next)
                                : current.slug,
                          }))
                        }}
                      />
                    </div>
                    <div className="grid gap-2 sm:flex-1">
                      <FieldLabel
                        htmlFor="event-slug"
                        hint="The part after /events/ in the event's address. Changing it changes the address, and old links stop working."
                      >
                        Address part
                      </FieldLabel>
                      <Input
                        id="event-slug"
                        value={fields.slug}
                        placeholder={
                          creating ? "night-market-at-the-park" : undefined
                        }
                        disabled={saving}
                        onChange={(event) => {
                          update("slug", event.target.value)
                          setSlugEdited(true)
                        }}
                        onBlur={() => {
                          if (!fields.slug.trim() && fields.title.trim()) {
                            update("slug", slugFromTitle(fields.title))
                            setSlugEdited(false)
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel
                        htmlFor="event-summary"
                        hint="One or two sentences. Shown under the title on the event's page and when it is shared."
                      >
                        Summary
                      </FieldLabel>
                      <CharacterCount
                        value={fields.summary}
                        max={SUMMARY_MAX}
                      />
                    </div>
                    <Textarea
                      id="event-summary"
                      rows={1}
                      maxLength={SUMMARY_MAX}
                      value={fields.summary}
                      disabled={saving}
                      onChange={(event) =>
                        update("summary", event.target.value)
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="grid gap-2">
                      <FieldLabel htmlFor="event-status">Status</FieldLabel>
                      <Select
                        value={fields.status}
                        disabled={saving}
                        onValueChange={(value) =>
                          update("status", value as "draft" | "published")
                        }
                      >
                        <SelectTrigger
                          id="event-status"
                          className="w-full sm:w-fit"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="published">Published</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor="event-visibility"
                        hint="A private event's page opens for anyone with its link, but it stays off the Events page, the calendar, search, the sitemap, the feed and the calendar subscription. It is not a password."
                      >
                        Who can find it
                      </FieldLabel>
                      <Select
                        value={fields.visibility}
                        disabled={saving}
                        onValueChange={(value) =>
                          update("visibility", value as "public" | "private")
                        }
                      >
                        <SelectTrigger
                          id="event-visibility"
                          className="w-full sm:w-fit"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public">Public</SelectItem>
                          <SelectItem value="private">
                            Private, link only
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel hint="Shown at the top of the event's page and when it is shared.">
                      Cover image
                    </FieldLabel>
                    <ImageUpload
                      label="Cover image"
                      showLabel={false}
                      value={fields.coverImage}
                      disabled={saving}
                      onChange={(url) => update("coverImage", url)}
                      aspect="video"
                      fit="cover"
                      inlinePicker
                      className="max-w-60"
                    />
                  </div>
                </CollapsibleSettingsCard>

                <CollapsibleSettingsCard
                  size="sm"
                  storageId="event-when"
                  collapse={{
                    open: whenOpen,
                    onOpenChange: setWhenOpen,
                    noFlashKey: whenNoFlash,
                  }}
                  title="When and where"
                  description="Times are the site's own clock, in the time zone set in Settings → Directory."
                  contentClassName="grid gap-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="grid gap-2 sm:flex-1">
                      <FieldLabel htmlFor="event-start-date">
                        Start day
                      </FieldLabel>
                      <DatePicker
                        id="event-start-date"
                        value={dayForPicker(fields.startDate)}
                        disabled={saving}
                        onChange={(date) =>
                          update("startDate", dayFromPicker(date))
                        }
                      />
                    </div>
                    <div className="grid gap-2 sm:flex-1">
                      <FieldLabel htmlFor="event-start-time">
                        Start time
                      </FieldLabel>
                      <Input
                        id="event-start-time"
                        type="time"
                        value={fields.startTime}
                        disabled={saving}
                        aria-invalid={tried && !fields.startTime}
                        onChange={(event) =>
                          update("startTime", event.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="grid gap-2 sm:flex-1">
                      <FieldLabel
                        htmlFor="event-end-date"
                        hint="Leave empty when the event ends on the day it starts. Pick the next day for an event that runs past midnight."
                      >
                        End day
                      </FieldLabel>
                      <div className="flex gap-2">
                        <DatePicker
                          id="event-end-date"
                          value={dayForPicker(fields.endDate)}
                          placeholder="Same day"
                          disabled={saving}
                          onChange={(date) =>
                            update("endDate", dayFromPicker(date))
                          }
                        />
                        {fields.endDate ? (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={saving}
                            onClick={() => update("endDate", "")}
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid gap-2 sm:flex-1">
                      <FieldLabel
                        htmlFor="event-end-time"
                        hint="Optional. With no end time, the page shows only the start, and the event counts as over when its day is over."
                      >
                        End time
                      </FieldLabel>
                      <Input
                        id="event-end-time"
                        type="time"
                        value={fields.endTime}
                        disabled={saving}
                        onChange={(event) =>
                          update("endTime", event.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="grid gap-2 sm:flex-1">
                      <FieldLabel htmlFor="event-place-name">Place</FieldLabel>
                      <Input
                        id="event-place-name"
                        value={fields.placeName}
                        maxLength={200}
                        placeholder="Trinity Bellwoods Park"
                        disabled={saving || Boolean(fields.listingId)}
                        onChange={(event) =>
                          update("placeName", event.target.value)
                        }
                      />
                    </div>
                    <div className="grid gap-2 sm:flex-1">
                      <FieldLabel htmlFor="event-place-address">
                        Street address
                      </FieldLabel>
                      <Input
                        id="event-place-address"
                        value={fields.placeAddress}
                        maxLength={300}
                        placeholder="790 Queen St W, Toronto"
                        disabled={saving || Boolean(fields.listingId)}
                        onChange={(event) =>
                          update("placeAddress", event.target.value)
                        }
                      />
                    </div>
                  </div>
                  {fields.listingId ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">
                        {picked?.status === "draft"
                          ? "The place is a draft listing. The event page names it without a link until the listing is published."
                          : "The place is one of this site's listings. The event page links to it and follows its name and address."}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        disabled={saving}
                        onClick={() => {
                          update("listingId", "")
                          setPicked(null)
                        }}
                      >
                        Type a place instead
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <ListingPicker
                        label="Pick a listing"
                        inputId="event-place-listing-search"
                        disabled={saving}
                        onPick={(listing) => {
                          setPicked(listing)
                          setFields((current) => ({
                            ...current,
                            listingId: listing.id,
                            placeName: listing.title,
                            placeAddress: listing.address,
                          }))
                        }}
                      />
                    </div>
                  )}
                </CollapsibleSettingsCard>

                {series?.main ? (
                  <SeriesDateCard
                    main={series.main}
                    editedAlone={loaded?.data.event.editedAlone ?? false}
                    disabled={saving}
                    onOpenMain={() => openOther(series.main!.id)}
                  />
                ) : (
                  <EventRepeatCard
                    repeat={fields.repeat}
                    startDate={fields.startDate}
                    disabled={saving}
                    onChange={(repeat) => update("repeat", repeat)}
                  />
                )}

                {series?.dates.length ? (
                  <EventDatesCard
                    series={series}
                    disabled={saving}
                    onOpenDate={openOther}
                  />
                ) : null}

                <CollapsibleSettingsCard
                  size="sm"
                  storageId="event-categories"
                  title="Categories"
                  description="The same categories listings and posts are filed under."
                  contentClassName="grid gap-4"
                >
                  <CategoryChecklist
                    idPrefix="event-category"
                    rows={orderedCategories}
                    checked={checked}
                    disabled={saving}
                    onToggle={(id) =>
                      update(
                        "categoryIds",
                        (checked.has(id)
                          ? fields.categoryIds.filter((each) => each !== id)
                          : [...fields.categoryIds, id]
                        ).sort()
                      )
                    }
                  />
                </CollapsibleSettingsCard>

                <CollapsibleSettingsCard
                  size="sm"
                  storageId="event-body"
                  title="Body"
                  description="Select words to format them. Listing card places a listing's card where the cursor is."
                >
                  <PostEditor
                    value={fields.body}
                    disabled={saving}
                    listings={listings}
                    onChange={(body) => update("body", body)}
                    onListingPicked={(listing) =>
                      setListings((current) =>
                        new Map(current).set(listing.id, listing)
                      )
                    }
                  />
                </CollapsibleSettingsCard>
              </>
            )}
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || !ready}
              onClick={() => void save()}
            >
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {eventId ? "Save changes" : "Create event"}
            </Button>
          </DialogFooter>
          <ConfirmDialog
            open={leaveFor !== null}
            onOpenChange={(next) => {
              if (!next) setLeaveFor(null)
            }}
            title="Discard changes?"
            description="This window has edits that have not been saved. Opening another date now throws them away."
            confirmLabel="Discard changes"
            cancelLabel="Keep editing"
            onConfirm={() => {
              const id = leaveFor
              setLeaveFor(null)
              if (id) onOpenEvent(id)
            }}
          />
        </DialogContent>
      )}
    </FormDialog>
  )
}
