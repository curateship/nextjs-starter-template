import * as React from "react"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"

import { CharacterCount } from "@/components/shared/character-count"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { EventSignUp, EventWaitingPerson } from "@/lib/api/events/events"
import {
  addEventSignUp,
  getSignUpErrorMessage,
  removeEventSignUp,
  type EventLists,
} from "@/lib/api/events/sign-ups"
import {
  placeInQueue,
  SIGN_UP_EMAIL_MAX,
  SIGN_UP_NAME_MAX,
  SIGN_UP_QUESTION_MAX,
  SIGN_UPS_CLOSE_CHOICES,
  signUpProblem,
} from "@/lib/events/sign-up-fields"
import { formatDate, formatDateTime } from "@/lib/format/format-time"
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

/**
 * One person: their name, their email, one more fact, their answer to the
 * event's question when they gave one, and a bin button.
 */
function PersonRow({
  name,
  email,
  detail,
  answer,
  disabled,
  onRemove,
}: {
  name: string
  email: string
  detail: string
  answer?: string
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
        {answer ? <span className="min-w-0 break-words">{answer}</span> : null}
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
 * The Sign-ups tab of an event's ⋮: the switch, the seats, when
 * sign-ups close, the event's own question, who is coming, and who is
 * waiting.
 *
 * The switch, seats, closing time and question save with the event.
 * Removing somebody, and adding somebody by hand, happen at once. Offering a
 * freed seat to the front of the queue is the background pass's job, so it
 * happens within fifteen seconds rather than on this click.
 */
export function EventSignUpsFields({
  eventId,
  takesSignUps,
  seats,
  savedSeats,
  closeHours,
  question,
  questionRequired,
  savedQuestion,
  signUps,
  waitingList,
  disabled,
  seatsInvalid,
  onTakesSignUpsChange,
  onSeatsChange,
  onCloseHoursChange,
  onQuestionChange,
  onQuestionRequiredChange,
  onListsChange,
}: {
  /** Null while the event is being created, and then nobody can be on it. */
  eventId: string | null
  takesSignUps: boolean
  /** As typed. Empty means no limit. */
  seats: string
  /** The seats as saved, which the count is measured against. */
  savedSeats: number | null
  /** Hours before the start sign-ups close, or null for at the start. */
  closeHours: number | null
  /** The event's own question, as typed. Empty asks none. */
  question: string
  questionRequired: boolean
  /** The question as saved, which the answers in the list were given to. */
  savedQuestion: string
  signUps: EventSignUp[]
  /** Who is waiting for a seat, front of the queue first. */
  waitingList: EventWaitingPerson[]
  disabled: boolean
  seatsInvalid: boolean
  onTakesSignUpsChange: (on: boolean) => void
  onSeatsChange: (typed: string) => void
  onCloseHoursChange: (hours: number | null) => void
  onQuestionChange: (question: string) => void
  onQuestionRequiredChange: (required: boolean) => void
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
      setAsking(false)
    } catch (error) {
      showErrorToast(getSignUpErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
      <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Visitors sign up on the event's page with a name and an email. A full
        event takes names for a waiting list, and a freed seat is offered by
        email.
      </p>
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
            className="w-full"
            value={seats}
            disabled={disabled}
            aria-invalid={seatsInvalid}
            onChange={(event) => onSeatsChange(event.target.value)}
          />
        </div>
      ) : null}

      {takesSignUps ? (
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="event-sign-ups-close"
            hint="By the site's own clock. After that the sign-up box says sign-ups have closed, and the waiting list stops offering seats."
          >
            Close sign-ups
          </FieldLabel>
          <Select
            value={closeHours === null ? "start" : String(closeHours)}
            disabled={disabled}
            onValueChange={(value) =>
              onCloseHoursChange(value === "start" ? null : Number(value))
            }
          >
            <SelectTrigger id="event-sign-ups-close" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIGN_UPS_CLOSE_CHOICES.map((choice) => (
                <SelectItem
                  key={choice.label}
                  value={choice.hours === null ? "start" : String(choice.hours)}
                >
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {takesSignUps ? (
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <FieldLabel
              htmlFor="event-sign-up-question"
              hint="Shown under Email on the sign-up box, like Any allergies? Leave empty to ask nothing more than a name and an email."
            >
              Question
            </FieldLabel>
            <CharacterCount value={question} max={SIGN_UP_QUESTION_MAX} />
          </div>
          <Input
            id="event-sign-up-question"
            value={question}
            maxLength={SIGN_UP_QUESTION_MAX}
            placeholder="Any allergies?"
            disabled={disabled}
            onChange={(event) => onQuestionChange(event.target.value)}
          />
        </div>
      ) : null}

      {takesSignUps && question.trim() ? (
        <div className="flex items-center gap-2">
          <Switch
            id="event-sign-up-question-required"
            checked={questionRequired}
            disabled={disabled}
            onCheckedChange={onQuestionRequiredChange}
          />
          <FieldLabel
            htmlFor="event-sign-up-question-required"
            hint="On, nobody can sign up without answering. Off, the answer can be left empty."
          >
            Answer required
          </FieldLabel>
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
                  detail={formatDate(person.createdAt)}
                  answer={savedQuestion ? person.answer : ""}
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
          <AddPersonForm
            eventId={eventId}
            question={savedQuestion}
            disabled={disabled}
            onListsChange={onListsChange}
          />
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
                answer={savedQuestion ? person.answer : ""}
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
      </div>
  )
}

/**
 * "Add a person", for a booking taken by phone (task events/37, Part 6). The
 * name and email are both asked for, the same as the public box. On a full
 * event the server answers "full" and the admin picks what happens: add them
 * anyway over the limit, or put them on the waiting list.
 */
function AddPersonForm({
  eventId,
  question,
  disabled,
  onListsChange,
}: {
  eventId: string
  /** The saved question, so the answer box shows only when there is one. */
  question: string
  disabled: boolean
  onListsChange: (lists: EventLists) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [answer, setAnswer] = React.useState("")
  const [tried, setTried] = React.useState(false)
  const [full, setFull] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const problem = signUpProblem({ name, email })

  async function add(whenFull?: "over" | "waiting") {
    setTried(true)
    if (problem) {
      showErrorToast(problem)
      return
    }
    dismissErrorToast()
    setBusy(true)
    try {
      const result = await addEventSignUp({
        eventId,
        name,
        email,
        answer: question ? answer : undefined,
        whenFull,
      })
      if (result.state === "refused") {
        showErrorToast(result.problem)
      } else if (result.state === "full") {
        setFull(true)
      } else {
        onListsChange(result.lists)
        setName("")
        setEmail("")
        setAnswer("")
        setTried(false)
        setFull(false)
        setOpen(false)
      }
    } catch (error) {
      showErrorToast(getSignUpErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <PlusIcon className="size-4" />
          Add a person
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-4 rounded-md border p-3">
      <div className="grid gap-4">
        <div className="grid gap-2">
          <FieldLabel htmlFor="event-add-person-name">Name</FieldLabel>
          <Input
            id="event-add-person-name"
            value={name}
            maxLength={SIGN_UP_NAME_MAX}
            disabled={busy}
            aria-invalid={tried && problem === "Enter your name."}
            onChange={(event) => {
              setName(event.target.value)
              setFull(false)
            }}
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="event-add-person-email">Email</FieldLabel>
          <Input
            id="event-add-person-email"
            type="email"
            value={email}
            maxLength={SIGN_UP_EMAIL_MAX}
            disabled={busy}
            aria-invalid={tried && problem === "Enter a valid email address."}
            onChange={(event) => {
              setEmail(event.target.value)
              setFull(false)
            }}
          />
        </div>
      </div>
      {question ? (
        <div className="grid gap-2">
          <FieldLabel htmlFor="event-add-person-answer">{question}</FieldLabel>
          <Input
            id="event-add-person-answer"
            value={answer}
            disabled={busy}
            onChange={(event) => setAnswer(event.target.value)}
          />
        </div>
      ) : null}
      {full ? (
        <div className="grid gap-2" role="status">
          <p className="text-sm text-muted-foreground">
            Every seat is taken. Add them anyway, over the limit, or put them
            at the back of the waiting list.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void add("waiting")}
            >
              Put on the waiting list
            </Button>
            <Button type="button" disabled={busy} onClick={() => void add("over")}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Add anyway
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setOpen(false)
              setTried(false)
            }}
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void add()}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Add to the list
          </Button>
        </div>
      )}
    </div>
  )
}
