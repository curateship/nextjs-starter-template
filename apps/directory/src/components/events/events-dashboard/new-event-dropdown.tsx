import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"

import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { getEventErrorMessage, saveNewEvent } from "@/lib/api/events/events"
import { dayForPicker, dayFromPicker } from "@/lib/events/picker-day"
import { useAsyncAction } from "@/lib/hooks/use-async-action"

/**
 * New event, as a dropdown form under its button, as every New … on the
 * shell's dashboards is, and as New listing is on the Listings dashboard.
 * The title, the day and the start time, the three an event cannot be saved
 * without: the new event, a draft, then opens on the right, where everything
 * else about it is written and saves itself.
 *
 * Two buttons open it: the Events row's New event, and the + in the left
 * page's header (`left`).
 */
export function NewEventDropdown({ left = false }: { left?: boolean }) {
  const router = useRouter()
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [startDate, setStartDate] = React.useState("")
  const [startTime, setStartTime] = React.useState("")
  const [tried, setTried] = React.useState(false)
  const [run, saving] = useAsyncAction(getEventErrorMessage)

  const submit = () =>
    void run(async () => {
      setTried(true)
      if (!title.trim()) throw new Error("Give the event a title first.")
      if (!startDate || !startTime) throw new Error("Pick the day and the time it starts.")
      const made = await saveNewEvent({ title: title.trim(), when: { startDate, startTime } })
      setTitle("")
      setStartDate("")
      setStartTime("")
      setTried(false)
      setOpen(false)
      await router.invalidate()
      // A new event is a draft, so it opens under Draft.
      await navigate({ to: "/admin/events", search: { tab: "draft", open: made.id } })
    })

  return (
    <NewRecordDropdown
      label="New event"
      open={open}
      onOpenChange={setOpen}
      submitLabel="Create event"
      busy={saving}
      onSubmit={submit}
      align={left ? "start" : "end"}
      trigger={
        left ? (
          <Button type="button" variant="ghost" size="icon" aria-label="New event" className="shrink-0">
            <PlusIcon className="size-4" />
          </Button>
        ) : (
          <DashboardToolbarButton type="button" aria-label="New event">
            <PlusIcon className="size-4" />
            <span className="@max-3xl:sr-only">New event</span>
          </DashboardToolbarButton>
        )
      }
    >
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-event-title">Title</FieldLabel>
        <Input
          id="new-event-title"
          autoFocus
          value={title}
          disabled={saving}
          aria-invalid={tried && !title.trim()}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-event-day" hint="It starts as a draft, so nothing is public yet.">
          Day
        </FieldLabel>
        <DatePicker id="new-event-day" value={dayForPicker(startDate)} onChange={(date) => setStartDate(dayFromPicker(date))} />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="new-event-time">Starts</FieldLabel>
        <Input
          id="new-event-time"
          type="time"
          value={startTime}
          disabled={saving}
          aria-invalid={tried && !startTime}
          onChange={(event) => setStartTime(event.target.value)}
        />
      </div>
    </NewRecordDropdown>
  )
}
