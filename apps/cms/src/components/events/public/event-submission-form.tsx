import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ImagePlus, XIcon } from "lucide-react"

import { CharacterCount } from "@/components/shared/character-count"
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
  EVENT_SUBMISSION_TRAP,
  getEventSubmissionErrorMessage,
  submitEvent,
  type EventSubmissionForm as FormInfo,
} from "@/lib/api/events/submissions"
import {
  EVENT_PHOTO_TYPES,
  EVENT_SUBMISSION_MAX_LENGTH,
  emptyEventSubmission,
  eventPhotoProblem,
  eventSubmissionProblems,
  type EventSubmissionField,
} from "@/lib/events/event-submission-fields"
import { dayForPicker, dayFromPicker } from "@/lib/events/picker-day"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The public Suggest an event form.
 *
 * The answers are checked by `eventSubmissionProblems`, the same check the
 * server runs, so the form and the server never disagree about what is
 * required. A problem shows under its box once the box is left, and all of
 * them show when Send is pressed, which stays enabled throughout.
 *
 * The photo box is this form's own and not the shared image upload. That one
 * files a picture in the Media library the moment it is picked, which needs
 * an account, and nobody filling this in has one. So the picture stays in the
 * browser until Send, and goes with the answers.
 */
export function EventSubmissionForm({ form }: { form: FormInfo }) {
  const [values, setValues] = React.useState(emptyEventSubmission())
  const [photo, setPhoto] = React.useState<File | null>(null)
  const [trap, setTrap] = React.useState("")
  const [touched, setTouched] = React.useState<Set<EventSubmissionField>>(
    new Set()
  )
  const [sending, setSending] = React.useState(false)
  const [sent, setSent] = React.useState(false)

  const problems = eventSubmissionProblems(values, form.today)
  const problemFor = (field: EventSubmissionField) =>
    touched.has(field) ? (problems[field] ?? null) : null
  const touch = (field: EventSubmissionField) =>
    setTouched((was) => new Set(was).add(field))
  const set = (field: EventSubmissionField, value: string) =>
    setValues((was) => ({ ...was, [field]: value }))

  async function send() {
    dismissErrorToast()
    setTouched(new Set(Object.keys(values) as EventSubmissionField[]))
    const first = Object.values(problems)[0]
    if (first) {
      showErrorToast(first)
      return
    }
    setSending(true)
    try {
      const result = await submitEvent(values, photo, trap)
      if (result.sent) setSent(true)
      else showErrorToast(result.problem)
    } catch (error) {
      showErrorToast(getEventSubmissionErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  function startAgain() {
    setValues((was) => ({
      ...emptyEventSubmission(),
      // The same person is most likely sending the next one too.
      submitterName: was.submitterName,
      submitterEmail: was.submitterEmail,
    }))
    setPhoto(null)
    setTouched(new Set())
    setSent(false)
  }

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

  const field = (name: EventSubmissionField) => ({
    name,
    value: values[name],
    problem: problemFor(name),
    disabled: sending,
    onBlur: () => touch(name),
    onChange: (value: string) => set(name, value),
  })

  return (
    <form
      className="relative grid gap-2 md:gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
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
          value={trap}
          onChange={(event) => setTrap(event.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>The event</CardTitle>
          <CardDescription>
            Somebody reads every suggestion before it appears on {form.siteName}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <TextField label="Name of the event" {...field("title")} />
          <TextField
            label="Description (optional)"
            multiline
            {...field("description")}
          />
          {form.photosAllowed ? (
            <PhotoField photo={photo} disabled={sending} onChange={setPhoto} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>When and where</CardTitle>
          <CardDescription>All times are {form.zone}.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="grid gap-2 sm:flex-1">
              <FieldLabel htmlFor="suggest-startDate">Day</FieldLabel>
              <DatePicker
                id="suggest-startDate"
                value={dayForPicker(values.startDate)}
                disabled={sending}
                placeholder="Pick a day"
                onChange={(date) => {
                  set("startDate", dayFromPicker(date))
                  touch("startDate")
                }}
              />
              <Problem
                id="suggest-startDate"
                problem={problemFor("startDate")}
              />
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
          <TextField label="Place (optional)" {...field("placeName")} />
          <TextField
            label="Street address (optional)"
            {...field("placeAddress")}
          />
        </CardContent>
      </Card>

      <Card>
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

      <div className="flex items-center gap-2">
        {/* Stays enabled while empty: the boxes say what is missing when it
            is pressed, which a greyed-out button never does. */}
        <Button type="submit" disabled={sending}>
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
    <div className={`grid gap-2 ${className ?? ""}`}>
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
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <Problem id={id} problem={problem} />
    </div>
  )
}

function Problem({ id, problem }: { id: string; problem: string | null }) {
  return problem ? (
    <p id={`${id}-problem`} className="text-xs text-destructive">
      {problem}
    </p>
  ) : null
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
