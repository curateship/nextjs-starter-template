import { Link } from "@tanstack/react-router"
import { PlusIcon, SettingsIcon, Trash2Icon, UsersIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ContactsPage } from "@/lib/api/people/contacts"
import type { SegmentItem } from "@/lib/api/people/contact-segments"
import type { SegmentRules } from "@/lib/contacts/contact-segments"
import {
  CONTACT_SHORTCUTS,
  NEW_CONTACT_DAYS,
  shortcutIsOn,
} from "@/lib/contacts/contact-shortcuts"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The Contacts dashboard's left panel, as Tyler's mock of 20 Oct 2026 draws
 * it: the People card (everybody, a count per status, the newest people and
 * the never emailed), the Segments card, every segment with how many people
 * are in it, and the Last 30 days card. Pressing a row of the first two shows
 * those people in the middle list; pressing the row that is on clears it.
 *
 * A segment row's dot is solid for a rules segment and grey for a hand-picked
 * one. Its cog opens the segment window (its name, description and rules or
 * people), and its bin deletes it. The card's "+" makes a new one. The cog in
 * the header opens Settings > Email, where sending and "gone quiet" are set.
 */
export function ContactsLeftPanel({
  data,
  rules,
  openSegmentId,
  onShortcut,
  onSegment,
  onNewSegment,
  onEditSegment,
  onDeleteSegment,
}: {
  data: ContactsPage
  rules: SegmentRules
  openSegmentId: string | undefined
  onShortcut: (rules: SegmentRules, on: boolean) => void
  onSegment: (segment: SegmentItem) => void
  onNewSegment: () => void
  onEditSegment: (segment: SegmentItem) => void
  onDeleteSegment: (segment: SegmentItem) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardTitleHeader
        icon={<UsersIcon className="size-4" />}
        title="Contacts"
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon">
                <Link to="/admin/settings/$tab" params={{ tab: "email" }} aria-label="Email settings">
                  <SettingsIcon className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Email settings</TooltipContent>
          </Tooltip>
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid gap-3 p-3">
          {/* One column that may shrink, in each card, so a long segment name
              is cut with "…" rather than pushing the panel sideways. */}
          <PanelCard storageId="contacts-people" title="People" quiet>
            <ul className="-mx-2 -my-1 grid grid-cols-[minmax(0,1fr)]">
              {CONTACT_SHORTCUTS.map((shortcut) => {
                const on = !openSegmentId && shortcutIsOn(shortcut, rules)
                return (
                  <li key={shortcut.key}>
                    <CountRow
                      label={shortcut.label}
                      count={data.shortcuts[shortcut.key]}
                      on={on}
                      onClick={() => onShortcut(shortcut.rules, on)}
                    />
                  </li>
                )
              })}
            </ul>
          </PanelCard>
          <PanelCard
            storageId="contacts-segments"
            title="Segments"
            meta={data.segments.length || undefined}
            quiet
            action={
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="New segment"
                    className="text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
                    onClick={onNewSegment}
                  >
                    <PlusIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New segment</TooltipContent>
              </Tooltip>
            }
          >
            {data.segments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No segments yet. Filter the list, then press Save to segment in
                Filter, or make one with the +.
              </p>
            ) : (
              <ul className="-mx-2 -my-1 grid grid-cols-[minmax(0,1fr)]">
                {data.segments.map((segment) => (
                  <li key={segment.id} className="group/segment relative min-w-0">
                    <CountRow
                      label={segment.name}
                      dot={segment.kind === "static" ? "bg-muted-foreground/50" : "bg-foreground"}
                      detail={segment.kind === "static" ? "Hand-picked" : undefined}
                      count={segment.total}
                      on={segment.id === openSegmentId}
                      onClick={() => onSegment(segment)}
                      // The two icons take the count's place on hover, and
                      // always on a phone, which cannot hover.
                      countClassName="group-hover/segment:invisible group-has-[:focus-visible]/segment:invisible [@media(hover:none)]:invisible"
                    />
                    <span className="absolute top-1/2 right-1 hidden -translate-y-1/2 items-center group-hover/segment:flex group-has-[:focus-visible]/segment:flex [@media(hover:none)]:flex">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Settings for ${segment.name}`}
                        onClick={() => onEditSegment(segment)}
                      >
                        <SettingsIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Delete ${segment.name}`}
                        onClick={() => onDeleteSegment(segment)}
                      >
                        <Trash2Icon />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PanelCard>
          <PanelCard storageId="contacts-recent" title={`Last ${NEW_CONTACT_DAYS} days`} quiet>
            <dl className="grid grid-cols-3 gap-2">
              <RecentFigure label="Joined" value={data.recent.joined} plus />
              <RecentFigure label="Opted out" value={data.recent.optedOut} />
              <RecentFigure label="Bounced" value={data.recent.bounced} />
            </dl>
          </PanelCard>
        </div>
      </ScrollArea>
    </div>
  )
}

/** One figure of the Last 30 days card, its number over its word. */
function RecentFigure({ label, value, plus = false }: { label: string; value: number; plus?: boolean }) {
  return (
    // The word first for a screen reader, the number on top on screen.
    <div className="flex min-w-0 flex-col-reverse justify-end gap-0.5">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg leading-tight font-semibold tabular-nums">
        {plus && value > 0 ? "+" : ""}
        {value.toLocaleString()}
      </dd>
    </div>
  )
}

/**
 * One pressable line of a card: an optional dot, a name, and a count. The
 * muted word after the name is read out only: the dot's shade says it on
 * screen.
 */
function CountRow({
  label,
  dot,
  detail,
  count,
  on,
  onClick,
  countClassName,
}: {
  label: string
  dot?: string
  detail?: string
  count: number
  on: boolean
  onClick: () => void
  countClassName?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-background",
        on && "bg-background font-medium shadow-xs",
        focusRingInset
      )}
    >
      {dot ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dot)} /> : null}
      <span className="min-w-0 flex-1 truncate">
        {label}
        {detail ? <span className="sr-only">, {detail}</span> : null}
      </span>
      <span className={cn("shrink-0 text-muted-foreground tabular-nums", countClassName)}>
        {count.toLocaleString()}
      </span>
    </button>
  )
}
