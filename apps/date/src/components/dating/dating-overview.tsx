import { Fragment } from "react"
import type * as React from "react"
import { Loader2Icon } from "lucide-react"

import { WidgetCard } from "@/components/shared/widgets/widget-card"
import { WidgetGrid } from "@/components/shared/widgets/widget-grid"
import { WidgetMenu } from "@/components/shared/widgets/widget-menus"
import { Button } from "@/components/ui/button"
import { Meter } from "@/components/ui/meter"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import type { DatingDashboard } from "@/lib/api/dating/dashboard"
import { DATING_WIDGET_OFFER, findDatingWidget, type DatingWidgetId } from "@/lib/dating/dating-page"
import { BAND_NEEDS_LIKES, DATING_APP_WORDS, OPENER_STYLE_WORDS } from "@/lib/dating/options"

import { dollars } from "./words"

/**
 * The Dating dashboard's Overview (part 5 of task
 * "features/07-three-panel-design"): what the left panel's stats were, each
 * in the shell's widget card, in the shell's two rows straight on the
 * dashboard beside the left page. Set in the left ⋮'s Widgets tab and saved
 * per profile. The figures are the dashboard's own, read again with it.
 */
export function DatingOverview({
  data,
  layout,
  busy,
  onChange,
  onReadCard,
  onReadChats,
  onChangeHours,
}: {
  data: DatingDashboard
  layout: WidgetLayout
  busy: string | null
  onChange: (layout: WidgetLayout) => void
  onReadCard: () => void
  onReadChats: () => void
  /** Compare apps' Change hours: the left ⋮ at Rules, where the swiping hours are. */
  onChangeHours: () => void
}) {
  return (
    <WidgetGrid
      offer={DATING_WIDGET_OFFER}
      layout={layout}
      onChange={onChange}
      drawWidget={(id) => {
        const widget = findDatingWidget(id)
        if (!widget) return null
        const Icon = widget.icon
        return (
          <WidgetCard title={widget.label} icon={<Icon />} menu={<WidgetMenu title={widget.label} />}>
            <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
              <div className="grid content-start gap-3 p-3">
                <WidgetBody id={widget.id} data={data} busy={busy} onReadCard={onReadCard} onReadChats={onReadChats} onChangeHours={onChangeHours} />
              </div>
            </ScrollArea>
          </WidgetCard>
        )
      }}
    />
  )
}

function WidgetBody({
  id,
  data,
  busy,
  onReadCard,
  onReadChats,
  onChangeHours,
}: {
  id: DatingWidgetId
  data: DatingDashboard
  busy: string | null
  onReadCard: () => void
  onReadChats: () => void
  onChangeHours: () => void
}) {
  if (id === "today") return <Today data={data} busy={busy} onReadCard={onReadCard} onReadChats={onReadChats} />
  if (id === "spend") return <Spend data={data} />
  if (id === "week") return <Week data={data} />
  if (id === "openers") return <Openers data={data} />
  if (id === "working") return <Working data={data} />
  return <Compare data={data} onChangeHours={onChangeHours} />
}

/** The day's swipes against the limit, its counts, and the two reads the phone does on request. */
function Today({ data, busy, onReadCard, onReadChats }: { data: DatingDashboard; busy: string | null; onReadCard: () => void; onReadChats: () => void }) {
  const today = data.tally[0]
  return (
    <>
      <Meter
        size="sm"
        value={data.hour.swipesToday}
        max={data.settings.swipesPerDay}
        label="Swipes today"
        valueText={`${data.hour.swipesToday} of ${data.settings.swipesPerDay} swipes`}
      />
      <Facts
        rows={[
          ["Swipes", `${data.hour.swipesToday} of ${data.settings.swipesPerDay}`],
          ["Likes", today?.likes ?? 0],
          ["Matches", today?.matches ?? 0],
          ["Messages sent", today?.messages ?? 0],
          ["Dates suggested", today?.datesProposed ?? 0],
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <ReadButton label="Profiles" hint="Read the profile on the phone's screen now, without swiping" busy={busy === "read-card"} onClick={onReadCard} />
        <ReadButton label="Chats" hint={`Read ${DATING_APP_WORDS[data.profile.app].name}'s chat list on the phone now`} busy={busy === "read-matches"} onClick={onReadChats} />
      </div>
    </>
  )
}

function Spend({ data }: { data: DatingDashboard }) {
  return (
    <Facts
      rows={[
        ["Spent this month", `${dollars(data.spendDollars)} of $${data.settings.spendCapDollars}`],
        ["Cost per match", data.matchCost.perMatch === null ? "None yet" : dollars(data.matchCost.perMatch)],
        ["Cost per date", data.matchCost.perDate === null ? "None yet" : dollars(data.matchCost.perDate)],
      ]}
    />
  )
}

function Week({ data }: { data: DatingDashboard }) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead className="text-left text-xs text-muted-foreground">
        <tr>
          <th className="pb-1 font-normal">Day</th>
          <th className="pb-1 text-right font-normal">Swipes</th>
          <th className="pb-1 text-right font-normal">Likes</th>
          <th className="pb-1 text-right font-normal">Matches</th>
        </tr>
      </thead>
      <tbody>
        {data.tally.map((day, index) => (
          <tr key={day.day}>
            <td className="py-0.5 text-muted-foreground">{dayName(day.day, index)}</td>
            <td className="py-0.5 text-right">{day.swipes}</td>
            <td className="py-0.5 text-right">{day.likes}</td>
            <td className="py-0.5 text-right">{day.matches}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Openers({ data }: { data: DatingDashboard }) {
  return (
    <>
      {data.openers.length ? (
        <Facts rows={data.openers.map((row) => [OPENER_STYLE_WORDS[row.style], `${row.replied} of ${row.sent} replied`])} />
      ) : (
        <p className="text-sm text-muted-foreground">No first messages sent yet.</p>
      )}
      <Note>A reply means an answer within three days. A few dozen openers are needed before this means much.</Note>
    </>
  )
}

function Working({ data }: { data: DatingDashboard }) {
  return (
    <>
      {data.bands.length ? (
        <Facts
          rows={data.bands.map((band) => [
            `${band.from} to ${band.to}`,
            band.likes < BAND_NEEDS_LIKES ? `${band.likes} likes, not enough yet` : `${band.matches} of ${band.likes} likes matched, ${band.replied} replied`,
          ])}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No liked cards with a score yet.</p>
      )}
      <Note>Liked cards by score, in bands of 10. A band needs {BAND_NEEDS_LIKES} likes before its numbers show. Samples are not counted.</Note>
    </>
  )
}

/**
 * Compare apps (parts 23 and 24 of "facebook/01"): each profile's month side
 * by side, and the suggestion to move swiping hours when one app clearly does
 * better. Change hours opens the open profile's Rules; nothing changes by
 * itself.
 */
function Compare({ data, onChangeHours }: { data: DatingDashboard; onChangeHours: () => void }) {
  if (data.compare.rows.length < 2) return <p className="text-sm text-muted-foreground">Shows once you have two profiles.</p>
  return (
    <>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 text-sm">
        {data.compare.rows.map((row) => (
          <li key={row.accountId} className="grid gap-0.5">
            <span className="truncate font-medium">
              {DATING_APP_WORDS[row.app].name}{" "}
              <span className="font-normal text-muted-foreground">
                ({row.name}){row.accountId === data.profile.id ? ", open now" : ""}
              </span>
            </span>
            <span className="text-muted-foreground tabular-nums">
              {row.perHundred === null ? `${row.likes} likes, not enough yet` : `${row.perHundred} matches out of 100 likes`}
              {`, ${row.replied} replied, ${row.dates} ${row.dates === 1 ? "date" : "dates"}, ${row.perMatch === null ? "no matches yet" : `${dollars(row.perMatch)} a match`}`}
            </span>
          </li>
        ))}
      </ul>
      {data.compare.moveHours ? (
        <div className="grid gap-2">
          <p className="text-sm">{data.compare.words}</p>
          {/* The Rules tab holds the open profile's hours, so the button shows only when the suggestion is about it. */}
          {[data.compare.moveHours.better.accountId, data.compare.moveHours.worse.accountId].includes(data.profile.id) ? (
            <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={onChangeHours}>
              Change hours
            </Button>
          ) : null}
        </div>
      ) : null}
      <Note>Likes and matches since the 1st, and what the AI cost. Samples are not counted.</Note>
    </>
  )
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <dt className="truncate text-muted-foreground">{label}</dt>
          <dd className="text-right tabular-nums">{value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

function dayName(day: string, index: number): string {
  if (index === 0) return "Today"
  if (index === 1) return "Yesterday"
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
}

function ReadButton({ label, hint, busy, onClick }: { label: string; hint: string; busy: boolean; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onClick}>
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}
