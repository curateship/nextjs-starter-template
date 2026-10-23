import * as React from "react"
import { Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import type { EventSignUp, EventWaitingPerson } from "@/lib/api/events/events"
import {
  getSignUpErrorMessage,
  removeEventSignUp,
  type EventLists,
} from "@/lib/api/events/sign-ups"
import { placeInQueue } from "@/lib/events/sign-up-fields"
import { formatDateTime } from "@/lib/format/format-time"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * "3 of 20 seats taken", "3 of 20 seats taken, 1 held" while a seat is being
 * held for somebody on the waiting list, or "3 signed up" with no limit. A
 * held seat counts as taken, because that is what it is: nobody else can have
 * it while the offer is open.
 */
function takenLine(coming: number, held: number, seats: number | null): string {
  if (seats === null) return `${coming} signed up`
  const taken = `${coming + held} of ${seats} ${seats === 1 ? "seat" : "seats"} taken`
  return held ? `${taken}, ${held} held` : taken
}

/** "Seat held until Oct 2, 6:00 PM" for an offer, or "2nd in line". */
function waitingLine(person: EventWaitingPerson, place: number): string {
  return person.offerExpiresAt
    ? `Seat held until ${formatDateTime(person.offerExpiresAt)}`
    : `${placeInQueue(place)} in line`
}

/** The bordered, scrolling box both lists sit in. */
function PeopleList({ children }: { children: React.ReactNode }) {
  return (
    <ScrollArea className="max-h-72 rounded-md border">
      <ul className="divide-y">{children}</ul>
    </ScrollArea>
  )
}

/** One person: their name, their email, one more fact, and a bin button. */
function PersonRow({
  name,
  email,
  detail,
  disabled,
  onRemove,
}: {
  name: string
  email: string
  detail: string
  disabled: boolean
  onRemove: () => void
}) {
  return (
    <li className="flex items-center gap-2 px-3 py-2 text-sm">
      <div className="grid min-w-0 flex-1">
        <span className="truncate font-medium">{name}</span>
        {/* The second fact drops to its own line on a narrow screen rather
            than being cut off. */}
        <span className="flex min-w-0 flex-wrap gap-x-3 text-muted-foreground">
          <span className="min-w-0 truncate">{email}</span>
          <span>{detail}</span>
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${name}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <Trash2Icon className="size-4" />
      </Button>
    </li>
  )
}

/**
 * The Sign-ups card in an event's window: the switch, the seats, who is
 * coming, and who is waiting.
 *
 * The switch and seats save with the window. Removing somebody happens at
 * once, after a question, and frees their seat. Offering that freed seat to
 * the front of the queue is the background pass's job, so it happens within
 * fifteen seconds rather than on this click.
 */
export function EventSignUpsCard({
  eventId,
  takesSignUps,
  seats,
  savedSeats,
  signUps,
  waitingList,
  disabled,
  seatsInvalid,
  onTakesSignUpsChange,
  onSeatsChange,
  onListsChange,
}: {
  /** Null while the event is being created, and then nobody can be on it. */
  eventId: string | null
  takesSignUps: boolean
  /** As typed. Empty means no limit. */
  seats: string
  /** The seats as saved, which the count is measured against. */
  savedSeats: number | null
  signUps: EventSignUp[]
  /** Who is waiting for a seat, front of the queue first. */
  waitingList: EventWaitingPerson[]
  disabled: boolean
  seatsInvalid: boolean
  onTakesSignUpsChange: (on: boolean) => void
  onSeatsChange: (typed: string) => void
  onListsChange: (lists: EventLists) => void
}) {
  /** The person the question is about. Kept while it closes, so its words stay. */
  const [removing, setRemoving] = React.useState<{
    person: EventSignUp
    waiting: boolean
  } | null>(null)
  const [asking, setAsking] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  /** Seats under offer. Nobody else can have one while the offer is open. */
  const heldSeats = waitingList.filter((person) => person.offerExpiresAt).length

  async function remove() {
    if (!removing || !eventId) return
    dismissErrorToast()
    setBusy(true)
    try {
      onListsChange(
        await removeEventSignUp({ eventId, signUpId: removing.person.id })
      )
      toast.success(`${removing.person.name} was taken off the list.`)
      setAsking(false)
    } catch (error) {
      showErrorToast(getSignUpErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <CollapsibleSettingsCard
      size="sm"
      storageId="event-sign-ups"
      title="Sign-ups"
      description="Visitors sign up on the event's page with a name and an email. A full event takes names for a waiting list, and a freed seat is offered by email. Sign-ups close when the event starts."
      contentClassName="grid gap-4"
    >
      <div className="flex items-center gap-2">
        <Switch
          id="event-takes-sign-ups"
          checked={takesSignUps}
          disabled={disabled}
          onCheckedChange={onTakesSignUpsChange}
        />
        <FieldLabel
          htmlFor="event-takes-sign-ups"
          hint="Switching this off hides the sign-up box. Anybody already on the list stays on it."
        >
          Take sign-ups
        </FieldLabel>
      </div>

      {takesSignUps ? (
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="event-seats"
            hint="Leave empty for no limit. Lowering it below the number signed up takes nobody off the list; the page says Full until seats free up. Raising it offers the new seats to the waiting list."
          >
            Seats
          </FieldLabel>
          <Input
            id="event-seats"
            inputMode="numeric"
            placeholder="No limit"
            className="w-full sm:w-40"
            value={seats}
            disabled={disabled}
            aria-invalid={seatsInvalid}
            onChange={(event) => onSeatsChange(event.target.value)}
          />
        </div>
      ) : null}

      {eventId && (takesSignUps || signUps.length) ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">Who's coming</h3>
            <p className="text-sm text-muted-foreground">
              {takenLine(signUps.length, heldSeats, savedSeats)}
            </p>
          </div>
          {signUps.length ? (
            <PeopleList>
              {signUps.map((person) => (
                <PersonRow
                  key={person.id}
                  name={person.name}
                  email={person.email}
                  detail={formatDateTime(person.createdAt)}
                  disabled={disabled}
                  onRemove={() => {
                    setRemoving({ person, waiting: false })
                    setAsking(true)
                  }}
                />
              ))}
            </PeopleList>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nobody has signed up yet.
            </p>
          )}
        </div>
      ) : null}

      {eventId && waitingList.length ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">Waiting list</h3>
            <p className="text-sm text-muted-foreground">
              {waitingList.length === 1
                ? "1 person waiting"
                : `${waitingList.length} people waiting`}
            </p>
          </div>
          <PeopleList>
            {waitingList.map((person, index) => (
              <PersonRow
                key={person.id}
                name={person.name}
                email={person.email}
                detail={waitingLine(person, index + 1)}
                disabled={disabled}
                onRemove={() => {
                  setRemoving({ person, waiting: true })
                  setAsking(true)
                }}
              />
            ))}
          </PeopleList>
          <p className="text-sm text-muted-foreground">
            A freed seat is emailed to whoever is at the front. It is held for
            them for a day, or until two hours before the event starts,
            whichever comes first.
          </p>
        </div>
      ) : null}

      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={
          removing?.waiting
            ? "Take them off the waiting list?"
            : "Take them off the list?"
        }
        description={
          removing?.waiting
            ? `${removing.person.name} (${removing.person.email}) comes off the waiting list. Any seat being held for them is freed and offered to the next person.`
            : `${removing?.person.name} (${removing?.person.email}) is taken off the list and their seat is freed. They can sign up again while a seat is free.`
        }
        confirmLabel="Remove"
        loading={busy}
        onConfirm={() => void remove()}
      />
    </CollapsibleSettingsCard>
  )
}
