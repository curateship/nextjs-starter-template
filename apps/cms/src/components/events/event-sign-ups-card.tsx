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
import type { EventSignUp } from "@/lib/api/events/events"
import {
  getSignUpErrorMessage,
  removeEventSignUp,
} from "@/lib/api/events/sign-ups"
import { formatDateTime } from "@/lib/format/format-time"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** "3 of 20 seats taken", or "3 signed up" with no limit. */
function takenLine(count: number, seats: number | null): string {
  if (seats === null) return `${count} signed up`
  return `${count} of ${seats} ${seats === 1 ? "seat" : "seats"} taken`
}

/**
 * The Sign-ups card in an event's window: the switch, the seats, and who is
 * coming. The switch and seats save with the window. Removing somebody
 * happens at once, after a question, and frees their seat.
 */
export function EventSignUpsCard({
  eventId,
  takesSignUps,
  seats,
  savedSeats,
  signUps,
  disabled,
  seatsInvalid,
  onTakesSignUpsChange,
  onSeatsChange,
  onSignUpsChange,
}: {
  /** Null while the event is being created, and then nobody can be on it. */
  eventId: string | null
  takesSignUps: boolean
  /** As typed. Empty means no limit. */
  seats: string
  /** The seats as saved, which the count is measured against. */
  savedSeats: number | null
  signUps: EventSignUp[]
  disabled: boolean
  seatsInvalid: boolean
  onTakesSignUpsChange: (on: boolean) => void
  onSeatsChange: (typed: string) => void
  onSignUpsChange: (signUps: EventSignUp[]) => void
}) {
  /** The person the question is about. Kept while it closes, so its words stay. */
  const [removing, setRemoving] = React.useState<EventSignUp | null>(null)
  const [asking, setAsking] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function remove() {
    if (!removing || !eventId) return
    dismissErrorToast()
    setBusy(true)
    try {
      onSignUpsChange(
        await removeEventSignUp({ eventId, signUpId: removing.id })
      )
      toast.success(`${removing.name} was taken off the list.`)
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
      description="Visitors sign up on the event's page with a name and an email. Sign-ups close when the event starts."
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
            hint="Leave empty for no limit. Lowering it below the number signed up takes nobody off the list; the page says Full until seats free up."
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
              {takenLine(signUps.length, savedSeats)}
            </p>
          </div>
          {signUps.length ? (
            <ScrollArea className="max-h-72 rounded-md border">
              <ul className="divide-y">
                {signUps.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <div className="grid min-w-0 flex-1">
                      <span className="truncate font-medium">
                        {person.name}
                      </span>
                      {/* The time drops to its own line on a narrow
                          screen rather than being cut off. */}
                      <span className="flex min-w-0 flex-wrap gap-x-3 text-muted-foreground">
                        <span className="min-w-0 truncate">{person.email}</span>
                        <span>{formatDateTime(person.createdAt)}</span>
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${person.name}`}
                      disabled={disabled}
                      onClick={() => {
                        setRemoving(person)
                        setAsking(true)
                      }}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nobody has signed up yet.
            </p>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Take them off the list?"
        description={`${removing?.name} (${removing?.email}) is taken off the list and their seat is freed. They can sign up again while a seat is free.`}
        confirmLabel="Remove"
        loading={busy}
        onConfirm={() => void remove()}
      />
    </CollapsibleSettingsCard>
  )
}
