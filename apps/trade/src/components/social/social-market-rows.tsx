import { focusRing } from "@/lib/layout/focus-ring"
import {
  groupMarketsByKind,
  type MarketKindGroup,
} from "@/lib/trade/social/market-kinds"
import {
  nextOpenLabel,
  sessionNoteFor,
} from "@/lib/trade/social/market-hours"
import type { SocialMarketRow } from "@/lib/trade/social/dashboard"
import { cn } from "@/lib/utils"

/**
 * The list of markets a creator or a feed names, grouped by kind.
 *
 * Shared by the creator dashboard's Markets panel and the feed's Coins panel,
 * which draw the same line: the ticker, how many posts name it, and a right
 * border marking the one that is narrowing the posts.
 *
 * **Plain rows, not the dashboard `Table`.** That table forces a 320px minimum
 * and clips inside a panel somebody has dragged narrow. These rows are the
 * market panel's shape instead, which survives any width.
 *
 * **A kind gets a heading only when there is more than one kind.** A member
 * who never switched stocks on sees exactly the list they saw before.
 */
export function SocialMarketRows({
  rows,
  selected,
  onSelect,
  now,
}: {
  rows: SocialMarketRow[]
  selected: string | null
  onSelect: (market: string | null) => void
  /** The moment to read market hours against, so a test can fix it. */
  now: number
}) {
  const groups = groupMarketsByKind(rows)
  const headings = groups.length > 1
  return (
    <div>
      {groups.map((group) => (
        <div key={group.kind}>
          {headings ? <KindHeading group={group} now={now} /> : null}
          {group.rows.map((row) => (
            <MarketLine
              key={row.market}
              row={row}
              selected={selected === row.market}
              onSelect={onSelect}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * One kind's heading, and whether its market is open.
 *
 * **The session note lives here rather than on every row**, because every
 * stock in the group shares one set of hours and a note per row would be the
 * same words forty times in a 171px panel. A shut market says when it opens
 * next, on New York's clock, so a figure beside a Sunday post reading the next
 * session is not a surprise.
 */
function KindHeading({ group, now }: { group: MarketKindGroup; now: number }) {
  const session = sessionNoteFor(group.kind, now)
  return (
    <div className="flex items-baseline gap-2 border-b px-3 py-1.5">
      <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
        {group.label}
      </span>
      {session && !session.open ? (
        <span className="ml-auto text-xs text-muted-foreground">
          Shut, opens {nextOpenLabel(session.nextOpen)} New York
        </span>
      ) : null}
    </div>
  )
}

function MarketLine({
  row,
  selected,
  onSelect,
}: {
  row: SocialMarketRow
  selected: boolean
  onSelect: (market: string | null) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(selected ? null : row.market)}
      className={cn(
        "flex h-9 w-full min-w-0 items-center gap-2 border-r-2 px-3 text-left",
        focusRing,
        selected
          ? "border-r-foreground bg-muted"
          : "border-r-transparent hover:bg-muted/50"
      )}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        ${row.market}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {row.posts}
      </span>
    </button>
  )
}
