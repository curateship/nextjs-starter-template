import { PlusIcon, SettingsIcon, Trash2Icon, UsersIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ContactsPage } from "@/lib/api/people/contacts"
import type { SegmentItem } from "@/lib/api/people/contact-segments"
import type { SegmentRules } from "@/lib/contacts/contact-segments"
import { CONTACT_SHORTCUTS, shortcutIsOn } from "@/lib/contacts/contact-shortcuts"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The Contacts dashboard's left panel: the People card, a count per status
 * and of the newest people, and the Segments card, every segment with how
 * many people are in it. Pressing a row of either shows those people in the
 * middle list; pressing the row that is on clears it.
 *
 * A segment row's cog opens the segment window (its name, description and
 * rules or people), and its bin deletes it. The card's "+" makes a new one.
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
      <DashboardCardTitleHeader icon={<UsersIcon className="size-4" />} title="Contacts" />
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
        </div>
      </ScrollArea>
    </div>
  )
}

/** One pressable line of a card: a name, an optional muted word, and a count. */
function CountRow({
  label,
  detail,
  count,
  on,
  onClick,
  countClassName,
}: {
  label: string
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
      <span className="min-w-0 flex-1 truncate">
        {label}
        {detail ? <span className="font-normal text-muted-foreground"> · {detail}</span> : null}
      </span>
      <span className={cn("shrink-0 text-muted-foreground tabular-nums", countClassName)}>
        {count.toLocaleString()}
      </span>
    </button>
  )
}
