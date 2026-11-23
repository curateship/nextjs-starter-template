import type { AppFrontPageRowProps } from "@/lib/app-options"
import type {
  FocusHoursRowData,
  OpenRoomsRowData,
} from "@/lib/pomodoro/front-page-rows"

/**
 * What this app's two front page rows draw on the public page.
 *
 * The heading, the line under it, the alignment and the Visibility switches
 * belong to the shell's row around this, so each of these is only the figure.
 *
 * Neither sets a left or right edge, a width or a middle: the public page frame
 * owns all three, and a row that sets its own puts itself out of line with every
 * other block down the page.
 *
 * A row whose reader answered nothing never reaches here — the shell leaves it
 * off the page — so there is no empty state to draw.
 */

function noData(data: unknown): data is null | undefined {
  return data === null || data === undefined
}

/** A big figure and the words under it, the shape both rows share. */
function Figure({ value, note }: { value: string; note: string }) {
  return (
    <div className="flex flex-col gap-1">
      <strong className="font-heading text-4xl leading-none font-semibold md:text-5xl">
        {value}
      </strong>
      <span className="text-sm text-muted-foreground">{note}</span>
    </div>
  )
}

export function FocusHoursRowContent({ data }: AppFrontPageRowProps) {
  if (noData(data)) return null
  const { hours, sessions } = data as FocusHoursRowData
  return (
    <Figure
      value={`${hours.toLocaleString()} ${hours === 1 ? "hour" : "hours"}`}
      note={`focused in the last seven days, across ${sessions.toLocaleString()} ${
        sessions === 1 ? "session" : "sessions"
      }`}
    />
  )
}

export function OpenRoomsRowContent({ data }: AppFrontPageRowProps) {
  if (noData(data)) return null
  const { rooms } = data as OpenRoomsRowData
  return (
    <Figure
      value={rooms === 1 ? "1 room" : `${rooms.toLocaleString()} rooms`}
      note={rooms === 1 ? "is running right now" : "are running right now"}
    />
  )
}
