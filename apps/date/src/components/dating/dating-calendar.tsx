import * as React from "react"
import { Link } from "@tanstack/react-router"

import { Card, CardContent, CardDescription, CardGroup, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
import type { DatingCalendar } from "@/lib/api/dating/chats"

import { DatingPicture } from "./picture"
import { dateTimeWords, whenWords } from "./words"

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

/**
 * The Calendar screen at /admin/dating/calendar, under Dating: every agreed
 * date with a time on a month, the ones still waiting for a time below, and
 * whether Google Calendar gets them too. Part 15 of
 * "features/01-chats-and-replies". A date opens its chat on the dashboard,
 * where its time and place are set.
 */
export function DatingCalendarScreen({ data }: { data: DatingCalendar }) {
  const timed = data.dates.filter((date) => date.dateAt)
  const waiting = data.dates.filter((date) => !date.dateAt)
  // Opens on the month of the next date, or this month when there is none ahead.
  const [month, setMonth] = React.useState<Date>(() => {
    const now = new Date()
    return timed.find((date) => (date.dateAt as Date).getTime() >= now.getTime())?.dateAt ?? now
  })
  const inMonth = timed.filter((date) => sameMonth(date.dateAt as Date, month))

  return (
    <CardGroup>
      <Card>
        <CardHeader>
          <CardTitle>Your dates</CardTitle>
          <CardDescription>
            Every date someone said yes to, once you set its time. You set the day, time and place on the chat; Date never agrees them for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-[auto_1fr]">
          <Calendar
            month={month}
            onMonthChange={setMonth}
            modifiers={{ booked: timed.map((date) => date.dateAt as Date) }}
            modifiersClassNames={{ booked: "font-semibold text-primary underline underline-offset-4" }}
          />
          <div className="grid content-start gap-2">
            <p className="text-sm font-medium">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
            {inMonth.length ? (
              <ul className="grid gap-1">
                {inMonth.map((date) => (
                  <DateRow key={date.matchId} date={date} line={`${dateTimeWords(date.dateAt as Date)}${date.datePlace ? ` · ${date.datePlace}` : ""}`} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No dates with a time this month.</p>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Said yes, no time yet</CardTitle>
          <CardDescription>Open the chat and press Add to calendar on the Before your date card.</CardDescription>
        </CardHeader>
        <CardContent>
          {waiting.length ? (
            <ul className="grid gap-1">
              {waiting.map((date) => (
                <DateRow key={date.matchId} date={date} line={`Said yes ${whenWords(date.acceptedAt)}${date.theirNumber ? ` · ${date.theirNumber}` : ""}`} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nobody is waiting for a time.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Google Calendar</CardTitle>
          <CardDescription>
            {data.google.connected
              ? `Connected${data.google.email ? ` as ${data.google.email}` : ""}. Each date with a time is added there too, and moved or removed with it. Date never reads your calendar.`
              : data.google.available
                ? "Not connected. Connect it in Settings to have each date added to your Google Calendar too."
                : "Not set up on this server yet, so dates stay in Date only."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {data.google.lastError ? <p className="text-destructive">Last time Google refused: {data.google.lastError}</p> : null}
          <p>
            <Link to="/admin/settings/$tab" params={{ tab: "dating" }} className="font-medium underline underline-offset-4">
              Settings, Dating
            </Link>
          </p>
        </CardContent>
      </Card>
    </CardGroup>
  )
}

function DateRow({ date, line }: { date: DatingCalendar["dates"][number]; line: string }) {
  return (
    <li>
      <Link
        to="/admin/dating"
        search={{ match: date.matchId, tab: "dates" }}
        className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
      >
        <DatingPicture pictureId={date.photoId} alt="" className="size-9 shrink-0 rounded-full" />
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate font-medium">{date.theirName}</span>
          <span className="truncate text-xs text-muted-foreground">
            {date.sample ? "Sample · " : ""}
            {line}
          </span>
        </span>
      </Link>
    </li>
  )
}
