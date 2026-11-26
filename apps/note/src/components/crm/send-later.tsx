import * as React from "react"
import { CalendarClockIcon, ChevronDownIcon, SunriseIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatSendAt, mondayMorning, pickedMoment, tomorrowMorning } from "@/lib/crm/send-later"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The small arrow beside Send (CRM task 38, part 6): Tomorrow morning, Monday
 * morning, or Pick a time. Each hands back the exact moment, worked out in
 * the person's own clock.
 */
export function SendLaterButton({
  disabled,
  onPick,
}: {
  disabled: boolean
  onPick: (sendAt: Date) => void
}) {
  const [picking, setPicking] = React.useState(false)
  const from = new Date()
  const tomorrow = tomorrowMorning(from)
  const monday = mondayMorning(from)

  return (
    <Popover open={picking} onOpenChange={setPicking}>
      <PopoverAnchor asChild>
        <span className="inline-flex">
          <DropdownMenu modal={false}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="icon-sm" variant="outline" disabled={disabled} aria-label="Send later">
                    <ChevronDownIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Send later</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" side="top" className="w-60">
              <DropdownMenuItem onSelect={() => onPick(tomorrow)}>
                <SunriseIcon className="size-4" />
                Tomorrow morning
                <span className="ml-auto text-xs text-muted-foreground">{formatSendAt(tomorrow, from)}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onPick(monday)}>
                <SunriseIcon className="size-4" />
                Monday morning
                <span className="ml-auto text-xs text-muted-foreground">{formatSendAt(monday, from)}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setPicking(true)}>
                <CalendarClockIcon className="size-4" />
                Pick a time…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </PopoverAnchor>
      <PopoverContent align="end" side="top" className="w-72 p-3">
        <PickTimeForm
          submitLabel="Schedule"
          onPick={(sendAt) => {
            setPicking(false)
            onPick(sendAt)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/**
 * A day and a time, then the button. Send later's Pick a time, and a
 * scheduled reply's Change. A time already gone is refused here with the
 * reason rather than at the server.
 */
export function PickTimeForm({
  submitLabel,
  initial,
  onPick,
}: {
  submitLabel: string
  initial?: Date
  onPick: (sendAt: Date) => void
}) {
  const start = initial ?? tomorrowMorning(new Date())
  const [day, setDay] = React.useState<Date | undefined>(start)
  const [time, setTime] = React.useState(
    `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`
  )
  const id = React.useId()

  const submit = () => {
    const at = pickedMoment(day, time)
    if (!at) {
      showErrorToast("Pick a day and a time.")
      return
    }
    if (at.getTime() <= Date.now()) {
      showErrorToast("That time has already gone. Pick a later one.")
      return
    }
    onPick(at)
  }

  return (
    <form
      className="grid gap-4"
      aria-label="When it goes"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="grid gap-2">
        <FieldLabel htmlFor={`${id}-day`}>Day</FieldLabel>
        <DatePicker id={`${id}-day`} value={day} onChange={setDay} className="w-full" />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor={`${id}-time`}>Time</FieldLabel>
        <Input id={`${id}-time`} type="time" value={time} onChange={(event) => setTime(event.target.value)} />
      </div>
      <div className="flex justify-end">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}
