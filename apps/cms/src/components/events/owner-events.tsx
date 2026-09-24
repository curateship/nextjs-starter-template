import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { CalendarIcon, MapPinIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { CharacterCount } from "@/components/shared/character-count"
import { ImageUpload } from "@/components/shared/image-upload"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Textarea } from "@/components/ui/textarea"
import type { OwnedListing } from "@/lib/api/directory/claims"
import {
  getEventSubmissionErrorMessage,
  sendEventForMyListing,
  type OwnerEvent,
  type OwnerEvents,
} from "@/lib/api/events/submissions"
import {
  EVENT_SUBMISSION_MAX_LENGTH,
  emptyEventSubmission,
  eventSubmissionProblems,
  submissionWhen,
} from "@/lib/events/event-submission-fields"
import { eventRowText } from "@/lib/events/event-time"
import { dayForPicker, dayFromPicker } from "@/lib/events/picker-day"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * An owner's events at their own listing, on My listings: the ones they have
 * sent, each with where it stands, and "Add event".
 *
 * Nothing here publishes anything. Every event goes to the site's admin, and
 * approving it puts it on the Events page. The place is the listing and
 * cannot be changed, so the window says where it is instead of asking.
 */
export function OwnerEventsCard({
  listing,
  owner,
}: {
  listing: OwnedListing
  owner: OwnerEvents
}) {
  const [adding, setAdding] = React.useState(false)
  const events = owner.events[listing.listingId] ?? []
  const site = owner.sites[listing.siteId]
  const eventsOn = site?.eventsOn ?? false

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarIcon
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <CardTitle>Events at {listing.title}</CardTitle>
          </div>
          {eventsOn ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdding(true)}
            >
              <PlusIcon />
              Add event
            </Button>
          ) : null}
        </div>
        <CardDescription>
          {eventsOn
            ? `Each event goes to ${listing.siteName}'s admin. Once it is approved, it is on the Events page.`
            : `${listing.siteName} has its Events page switched off, so events cannot be added here.`}
        </CardDescription>
      </CardHeader>
      {events.length || eventsOn ? (
        <CardContent>
          {events.length ? (
            <ul className="-mx-4 divide-y border-t">
              {events.map((event) => (
                <OwnerEventRow
                  key={event.id}
                  event={event}
                  siteUrl={listing.siteUrl}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No events yet. Add one, and it goes to the admin to approve.
            </p>
          )}
        </CardContent>
      ) : null}

      {site ? (
        <OwnerEventDialog
          open={adding}
          listing={listing}
          today={site.today}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </Card>
  )
}

const STATUS_WORDS: Record<OwnerEvent["status"], string> = {
  pending: "Waiting for approval",
  approved: "Approved",
  rejected: "Not approved",
}

function OwnerEventRow({
  event,
  siteUrl,
}: {
  event: OwnerEvent
  siteUrl: string
}) {
  return (
    <li className="grid gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 truncate text-sm font-medium">
          {event.title}
        </span>
        <Badge
          variant={
            event.status === "pending"
              ? "default"
              : event.status === "approved"
                ? "secondary"
                : "outline"
          }
        >
          {STATUS_WORDS[event.status]}
        </Badge>
        {event.eventSlug ? (
          <a
            href={`${siteUrl}/events/${event.eventSlug}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm underline-offset-4 hover:underline"
          >
            See its page
          </a>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {eventRowText(submissionWhen(event))}
      </p>
      {event.status === "rejected" && event.reviewNote ? (
        <p className="text-xs whitespace-pre-wrap text-muted-foreground">
          The admin said: {event.reviewNote}
        </p>
      ) : null}
    </li>
  )
}

type Fields = Pick<
  ReturnType<typeof emptyEventSubmission>,
  "title" | "startDate" | "startTime" | "endTime" | "description"
>

const BLANK: Fields = {
  title: "",
  startDate: "",
  startTime: "",
  endTime: "",
  description: "",
}

/**
 * The owner's Add event window. The same boxes and the same check as the
 * Suggest an event page, less the place and the person, which come from the
 * listing and the account.
 */
function OwnerEventDialog({
  open,
  listing,
  today,
  onClose,
}: {
  open: boolean
  listing: OwnedListing
  today: string
  onClose: () => void
}) {
  const router = useRouter()
  const [fields, setFields] = React.useState<Fields>(BLANK)
  const [coverImage, setCoverImage] = React.useState("")
  const [tried, setTried] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  // Blank each time the window opens, so a second event starts clean.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setFields(BLANK)
      setCoverImage("")
      setTried(false)
    }
  }

  // The email comes from the account, so its answer is left out here. The
  // server checks the same boxes, and the listing too.
  const { submitterEmail: _fromAccount, ...problems } = eventSubmissionProblems(
    { ...emptyEventSubmission(), ...fields },
    today
  )
  const problemFor = (field: keyof Fields) =>
    tried ? (problems[field] ?? null) : null
  const set = (field: keyof Fields, value: string) =>
    setFields((was) => ({ ...was, [field]: value }))
  const dirty =
    Object.values(fields).some((value) => value.trim()) || Boolean(coverImage)

  async function send() {
    dismissErrorToast()
    setTried(true)
    const first = Object.values(problems)[0]
    if (first) {
      showErrorToast(first)
      return
    }
    setBusy(true)
    try {
      const result = await sendEventForMyListing({
        claimId: listing.claimId,
        ...fields,
        coverImage,
      })
      if (!result.sent) {
        showErrorToast(result.problem)
        return
      }
      // Read again before the window closes, so the new row is there when
      // it does.
      await router.invalidate()
      toast.success(
        "Sent. The admin reads it before it goes on the Events page."
      )
      onClose()
    } catch (error) {
      showErrorToast(getEventSubmissionErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add an event</DialogTitle>
            <DialogDescription>
              It goes to {listing.siteName}&apos;s admin, and is on the Events
              page once it is approved.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>The event</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <OwnerField
                  name="title"
                  label="Name of the event"
                  value={fields.title}
                  problem={problemFor("title")}
                  disabled={busy}
                  onChange={(value) => set("title", value)}
                />
                <OwnerField
                  name="description"
                  label="Description (optional)"
                  multiline
                  value={fields.description}
                  problem={problemFor("description")}
                  disabled={busy}
                  onChange={(value) => set("description", value)}
                />
                <ImageUpload
                  label="Photo (optional)"
                  value={coverImage}
                  disabled={busy}
                  onChange={(url) => setCoverImage(url)}
                />
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>When and where</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel htmlFor="owner-event-startDate">Day</FieldLabel>
                  <DatePicker
                    id="owner-event-startDate"
                    value={dayForPicker(fields.startDate)}
                    placeholder="Pick a day"
                    disabled={busy}
                    onChange={(date) => set("startDate", dayFromPicker(date))}
                  />
                  <FieldProblem
                    id="owner-event-startDate"
                    problem={problemFor("startDate")}
                  />
                </div>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <OwnerField
                    name="startTime"
                    label="Starts"
                    type="time"
                    className="sm:flex-1"
                    value={fields.startTime}
                    problem={problemFor("startTime")}
                    disabled={busy}
                    onChange={(value) => set("startTime", value)}
                  />
                  <OwnerField
                    name="endTime"
                    label="Ends (optional)"
                    type="time"
                    className="sm:flex-1"
                    hint="Past midnight? Put the time it ends, and it counts as the next day."
                    value={fields.endTime}
                    problem={problemFor("endTime")}
                    disabled={busy}
                    onChange={(value) => set("endTime", value)}
                  />
                </div>
                <div className="grid gap-1">
                  <span className="text-sm font-medium">Place</span>
                  {/* Wraps rather than truncating: one long line in a grid
                      widens the whole column, and every box beside it. */}
                  <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                    <MapPinIcon
                      className="mt-0.5 size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      {listing.title}. Your events are always at your listing.
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void send()}>
              Send for approval
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

function OwnerField({
  name,
  label,
  hint,
  value,
  problem,
  disabled,
  multiline,
  type = "text",
  className,
  onChange,
}: {
  name: keyof Fields
  label: string
  hint?: string
  value: string
  problem: string | null
  disabled: boolean
  multiline?: boolean
  type?: "text" | "time"
  className?: string
  onChange: (value: string) => void
}) {
  const id = `owner-event-${name}`
  const max = EVENT_SUBMISSION_MAX_LENGTH[name]
  const shared = {
    id,
    value,
    disabled,
    maxLength: max,
    "aria-invalid": problem ? true : undefined,
    "aria-describedby": problem ? `${id}-problem` : undefined,
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
      <FieldProblem id={id} problem={problem} />
    </div>
  )
}

function FieldProblem({ id, problem }: { id: string; problem: string | null }) {
  return problem ? (
    <p id={`${id}-problem`} className="text-xs text-destructive">
      {problem}
    </p>
  ) : null
}
