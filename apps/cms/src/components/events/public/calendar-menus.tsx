import { CalendarPlusIcon, ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  googleCalendarLink,
  googleSubscribeLink,
  webcalLink,
  type CalendarEvent,
} from "@/lib/events/calendar-file"

type CalendarChoice = { label: string; href: string; newTab: boolean }

/**
 * A button that opens a short list of calendar apps. Each choice is a plain
 * link: Google opens in a new tab, and the file or webcal address is handed
 * to the phone's or computer's own calendar app.
 */
function CalendarMenu({
  label,
  heading,
  choices,
}: {
  label: string
  heading?: string
  choices: CalendarChoice[]
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-fit">
          <CalendarPlusIcon aria-hidden="true" />
          {label}
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-48">
        {heading ? <DropdownMenuLabel>{heading}</DropdownMenuLabel> : null}
        {choices.map((choice) => (
          <DropdownMenuItem key={choice.label} asChild>
            <a
              href={choice.href}
              {...(choice.newTab
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {choice.label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** "Add to calendar" on an event's page. */
export function AddToCalendarMenu({
  event,
  timeZone,
}: {
  event: CalendarEvent & { slug: string }
  timeZone: string
}) {
  return (
    <CalendarMenu
      label="Add to calendar"
      choices={[
        {
          label: "Google Calendar",
          href: googleCalendarLink(event, timeZone),
          newTab: true,
        },
        {
          label: "Apple Calendar or Outlook",
          href: `/events/${event.slug}/calendar.ics`,
          newTab: false,
        },
      ]}
    />
  )
}

/**
 * "Subscribe" on the Events page. Once added, every event the site publishes
 * appears in the visitor's calendar by itself.
 */
export function SubscribeMenu({ feedUrl }: { feedUrl: string }) {
  return (
    <CalendarMenu
      label="Subscribe"
      heading="Every event, now and later"
      choices={[
        {
          label: "Google Calendar",
          href: googleSubscribeLink(feedUrl),
          newTab: true,
        },
        {
          label: "Apple Calendar or Outlook",
          href: webcalLink(feedUrl),
          newTab: false,
        },
      ]}
    />
  )
}
