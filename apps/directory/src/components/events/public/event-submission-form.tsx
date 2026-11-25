import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ImagePlus,
  Loader2Icon,
  XIcon,
} from "lucide-react"

import { CharacterCount } from "@/components/shared/character-count"
import {
  DirectorySuggestionList,
  useDirectorySuggestions,
  type DirectorySuggestionBox,
} from "@/components/directory/public/directory-suggestions"
import { FieldProblem } from "@/components/directory/public/field-problem"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  useEventSubmission,
  type EventSubmissionBox,
} from "@/components/events/public/use-event-submission"
import {
  EVENT_SUBMISSION_TRAP,
  type EventSubmissionForm as FormInfo,
} from "@/lib/api/events/submissions"
import {
  EVENT_PHOTO_TYPES,
  EVENT_SUBMISSION_MAX_LENGTH,
  eventPhotoProblem,
  type EventSubmissionField,
} from "@/lib/events/event-submission-fields"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The boxes themselves, in three cards: the event, when and where, and about
 * you. `size` is "sm" inside a window, where the cards sit on a narrower
 * surface, and the default on the page.
 *
 * The photo box is this form's own and not the shared image upload. That one
 * files a picture in the Media library the moment it is picked, which needs
 * an account, and nobody filling this in has one. So the picture stays in the
 * browser until Send, and goes with the answers.
 */
export function EventSubmissionFields({
  box,
  form,
  size = "default",
  showIntro = true,
}: {
  box: EventSubmissionBox
  form: FormInfo
  size?: "default" | "sm"
  /** False where the window around the boxes already says who reads them. */
  showIntro?: boolean
}) {
  const { field, day } = box
  return (
    <>
      {/* A box no person sees or reaches. A bot fills every box it finds, and
          the server throws away anything that arrives with this one filled. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[9999px] size-px overflow-hidden"
      >
        <label htmlFor="suggest-trap">Leave this empty</label>
        <input
          id="suggest-trap"
          name={EVENT_SUBMISSION_TRAP}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={box.trap}
          onChange={(event) => box.setTrap(event.target.value)}
        />
      </div>

      <Card size={size}>
        <CardHeader>
          <CardTitle>The event</CardTitle>
          {showIntro ? (
            <CardDescription>
              Somebody reads every suggestion before it appears on{" "}
              {form.siteName}.
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4">
          <TextField label="Name of the event" {...field("title")} />
          <TextField
            label="Description (optional)"
            multiline
            {...field("description")}
          />
          {form.photosAllowed ? (
            <PhotoField
              photo={box.photo}
              disabled={box.sending}
              onChange={box.setPhoto}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card size={size}>
        <CardHeader>
          <CardTitle>When and where</CardTitle>
          <CardDescription>All times are {form.zone}.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="relative grid gap-2 sm:flex-1">
              <FieldLabel htmlFor="suggest-startDate">Day</FieldLabel>
              <DatePicker
                id="suggest-startDate"
                value={day.value}
                disabled={day.disabled}
                placeholder="Pick a day"
                onChange={day.onChange}
              />
              <FieldProblem id="suggest-startDate" problem={day.problem} />
            </div>
            <TextField
              label="Starts"
              type="time"
              className="sm:flex-1"
              {...field("startTime")}
            />
            <TextField
              label="Ends (optional)"
              type="time"
              className="sm:flex-1"
              hint="Past midnight? Put the time it ends, and it counts as the next day."
              {...field("endTime")}
            />
          </div>
          <PlaceFields box={box} listingsOpen={form.listingsOpen} />
        </CardContent>
      </Card>

      <Card size={size}>
        <CardHeader>
          <CardTitle>About you</CardTitle>
          <CardDescription>
            Only the people who run {form.siteName} see this.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <TextField label="Your name (optional)" {...field("submitterName")} />
          <TextField
            label="Your email"
            type="email"
            hint="We email you once, when your suggestion has been looked at."
            {...field("submitterEmail")}
          />
        </CardContent>
      </Card>
    </>
  )
}

/**
 * The Suggest an event page's form: the boxes above, with the thank-you and
 * the Send row the page needs around them. The Events page draws the same
 * boxes in a window instead, through `SuggestEventButton`.
 */
export function EventSubmissionForm({ form }: { form: FormInfo }) {
  const box = useEventSubmission(form)
  const { values, sending, sent, startAgain } = box

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Thank you</CardTitle>
          <CardDescription>
            {values.title.trim()} went to {form.siteName}. Somebody reads every
            suggestion, and you will get an email at{" "}
            {values.submitterEmail.trim()} once it has been looked at.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={startAgain}>
            Suggest another event
          </Button>
          <Button asChild variant="ghost">
            <Link to="/events">Back to events</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <form
      className="relative grid gap-2 md:gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void box.send()
      }}
    >
      <EventSubmissionFields box={box} form={form} />

      <div className="flex items-center gap-2">
        {/* Stays enabled while empty: the boxes say what is missing when it
            is pressed, which a greyed-out button never does. */}
        <Button type="submit" disabled={sending}>
          {sending ? <Loader2Icon className="animate-spin" /> : null}
          Send suggestion
        </Button>
        <Button asChild variant="ghost">
          <Link to="/events">Cancel</Link>
        </Button>
      </div>
    </form>
  )
}

function TextField({
  name,
  label,
  hint,
  value,
  problem,
  disabled,
  multiline,
  type = "text",
  className,
  onBlur,
  onChange,
  suggestions,
}: {
  name: EventSubmissionField
  label: string
  hint?: string
  value: string
  problem: string | null
  disabled: boolean
  multiline?: boolean
  type?: "text" | "email" | "time"
  className?: string
  onBlur: () => void
  onChange: (value: string) => void
  /** A list of this site's listings to pick from, hanging under the box. */
  suggestions?: DirectorySuggestionBox
}) {
  const id = `suggest-${name}`
  const max = EVENT_SUBMISSION_MAX_LENGTH[name]
  const shared = {
    id,
    value,
    disabled,
    maxLength: max,
    "aria-invalid": problem ? true : undefined,
    "aria-describedby": problem ? `${id}-problem` : undefined,
    onBlur,
  }
  return (
    <div className={`relative grid gap-2 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id} hint={hint}>
          {label}
        </FieldLabel>
        {type === "time" ? null : <CharacterCount value={value} max={max} />}
      </div>
      {multiline ? (
        <Textarea
          rows={1}
          {...shared}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          type={type}
          {...shared}
          {...suggestions?.inputProps}
          onBlur={(event) => {
            onBlur()
            suggestions?.inputProps.onBlur(event)
          }}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <FieldProblem id={id} problem={problem} />
      {suggestions ? (
        <DirectorySuggestionList box={suggestions} label="Places on this site" />
      ) : null}
    </div>
  )
}

/**
 * One picture, kept in the browser until Send. Drawn like the shared image
 * box: a dashed frame with the picture in it, and a round button to take it
 * off.
 */
function PhotoField({
  photo,
  disabled,
  onChange,
}: {
  photo: File | null
  disabled: boolean
  onChange: (photo: File | null) => void
}) {
  const input = React.useRef<HTMLInputElement>(null)
  // Worked out from the photo, and let go of when it changes or the form
  // goes, so a picked picture never stays held in the browser's memory.
  const preview = React.useMemo(
    () => (photo ? URL.createObjectURL(photo) : null),
    [photo]
  )
  React.useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview]
  )

  return (
    <div className="grid gap-2">
      <FieldLabel
        htmlFor="suggest-photo"
        hint="A JPG, PNG or WebP picture up to 5 MB, like the poster or a photo from last time."
      >
        Photo (optional)
      </FieldLabel>
      <input
        ref={input}
        type="file"
        accept={EVENT_PHOTO_TYPES.join(",")}
        className="hidden"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null
          event.target.value = ""
          if (!file) return
          const problem = eventPhotoProblem(file)
          if (problem) {
            showErrorToast(problem)
            return
          }
          dismissErrorToast()
          onChange(file)
        }}
      />
      {/* Capped, or on a wide screen the picture takes the whole page. */}
      <div className="group relative w-full sm:max-w-sm">
        <button
          id="suggest-photo"
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          className="block w-full cursor-pointer overflow-hidden rounded-lg border-2 border-dashed transition-colors outline-none focus-visible:border-ring disabled:cursor-default disabled:opacity-50"
        >
          {preview ? (
            <img
              src={preview}
              alt={photo?.name ?? "The photo"}
              className="aspect-video w-full bg-muted/50 object-cover"
            />
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-muted/50 transition-colors group-hover:bg-muted">
              <ImagePlus className="size-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Choose a photo
              </span>
            </div>
          )}
        </button>
        {photo ? (
          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            disabled={disabled}
            className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 rounded-full shadow-md ring-2 ring-background"
            onClick={() => onChange(null)}
          >
            <XIcon className="size-4" />
            <span className="sr-only">Remove the photo</span>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * The place and its street address (task events/37, Part 13). While the
 * directory is open to everyone, typing in the place box offers the site's
 * own listings under it, from the same lookup the directory's search box
 * uses. Picking one makes the event's place that listing: the street address
 * box goes, because the listing has one, and the approved event links to the
 * listing's page and uses its pin. Typing a place that is not in the
 * directory still works, and "Type a place instead" lets go of a pick.
 */
function PlaceFields({
  box,
  listingsOpen,
}: {
  box: EventSubmissionBox
  listingsOpen: boolean
}) {
  const place = box.field("placeName")
  const picked = box.values.placeListing
  // The site search's own list, keeping listings only: arrow keys, Enter and
  // Escape work the same as in the search box, and the list hangs over the
  // form instead of pushing it down. It was a list of buttons of its own
  // until 24 Nov 2026, with none of that.
  const suggestions = useDirectorySuggestions({
    text: place.value,
    kinds: ["listing"],
    enabled: listingsOpen && !picked,
    onPick: (listing) => {
      place.onChange(listing.title)
      box.field("placeListing").onChange(listing.slug)
      box.field("placeAddress").onChange("")
    },
  })

  return (
    <>
      <div className="grid gap-2">
        <TextField
          label="Place (optional)"
          hint={
            listingsOpen
              ? "Start typing to pick the place from this site's listings, or type any place."
              : undefined
          }
          {...place}
          disabled={place.disabled || Boolean(picked)}
          suggestions={suggestions}
        />
        {picked ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Picked from this site's listings, so its address and map come
              with it.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={place.disabled}
              onClick={() => box.field("placeListing").onChange("")}
            >
              Type a place instead
            </Button>
          </div>
        ) : null}
      </div>
      {picked ? null : (
        <TextField
          label="Street address (optional)"
          {...box.field("placeAddress")}
        />
      )}
    </>
  )
}
