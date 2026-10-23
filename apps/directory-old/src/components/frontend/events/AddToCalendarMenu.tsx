"use client"

import type { ReactNode } from "react"
import CalendarPlusIcon from "lucide-react/dist/esm/icons/calendar-plus.js"
import ChevronDownIcon from "lucide-react/dist/esm/icons/chevron-down.js"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { buildGoogleSubscribeUrl, buildWebcalUrl } from "@/lib/utils/calendar"

interface AddToCalendarMenuProps {
  /** Google Calendar "new event" link for this single event. */
  eventGoogleUrl?: string | null
  /** Download link for this single event's .ics (Apple Calendar / Outlook). */
  eventIcsHref?: string | null
  /** Absolute https URL of the site-wide feed, used for one-click subscribe. */
  feedUrl?: string | null
}

function LinkItem({
  href,
  external,
  download,
  children,
}: {
  href: string
  external?: boolean
  download?: boolean
  children: ReactNode
}) {
  return (
    <DropdownMenuItem asChild>
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        {...(download ? { download: "" } : {})}
      >
        {children}
      </a>
    </DropdownMenuItem>
  )
}

// A single "Add to calendar" button whose menu covers both intents: add this one
// event (Google link / .ics download), and subscribe once to every future event
// (one-click, no URL pasting).
export function AddToCalendarMenu({ eventGoogleUrl, eventIcsHref, feedUrl }: AddToCalendarMenuProps) {
  const hasEventActions = Boolean(eventGoogleUrl || eventIcsHref)
  if (!hasEventActions && !feedUrl) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <CalendarPlusIcon className="size-4" />
          Add to calendar
          <ChevronDownIcon className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56">
        {hasEventActions && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>This event</DropdownMenuLabel>
            {eventGoogleUrl && (
              <LinkItem href={eventGoogleUrl} external>
                Google Calendar
              </LinkItem>
            )}
            {eventIcsHref && (
              <LinkItem href={eventIcsHref} download>
                Apple Calendar / Outlook
              </LinkItem>
            )}
          </DropdownMenuGroup>
        )}
        {feedUrl && (
          <>
            {hasEventActions && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel>Subscribe to all events</DropdownMenuLabel>
              <LinkItem href={buildGoogleSubscribeUrl(feedUrl)} external>
                Google Calendar
              </LinkItem>
              <LinkItem href={buildWebcalUrl(feedUrl)}>Apple Calendar / Outlook</LinkItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
