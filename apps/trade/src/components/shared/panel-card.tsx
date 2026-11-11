import * as React from "react"
import { ChevronDown, SettingsIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useCollapseAllCommand } from "@/components/shared/inspector-card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { collapseStorageKey, useRememberedCollapse } from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"

/**
 * The grey box itself, shared by the folding card and the plain one. Its
 * background and line come from Settings → Styling → Panel cards, through the
 * `[data-slot="panel-card"]` rule in theme.css; unset, the theme's grey at
 * 40% and a 1px line.
 */
const panelBoxClassName = cn(
  "min-w-0 rounded-lg p-4",
  // Fields sit on the page background, so a box to type in never looks
  // like part of the grey card.
  "[&_[data-slot=input]]:bg-background [&_[data-slot=select-trigger]]:bg-background [&_[data-slot=textarea]]:bg-background"
)

/** Whether the card's footer is open, read by `PanelCardFooter` inside it. */
const FooterOpen = React.createContext<boolean | null>(null)

/**
 * A folding card on a three-column dashboard's side panel: "Steps · 0 of 2
 * done", "Segments · 4", "Today's check-in" with a Late badge. The same grey
 * box, border, 15px heading and arrow as `InspectorCard`, with two things
 * Tyler's drawings of 13 Oct 2026 add to the heading: a muted note after the
 * title, and a badge before the arrow. Open or shut is remembered in this
 * browser under `storageId`. It started in Project and moved here for
 * Contacts on 19 Oct 2026.
 *
 * `settings` puts a cog beside the arrow that opens the card's footer, the
 * row of its buttons (`PanelCardFooter`). The cog, the card's own buttons
 * and the arrow show only while the card is pointed at, or holds the
 * keyboard's visible focus (a click leaves none), folded or open. Tyler drew
 * the task panel's cards that way on 14 Oct 2026 and made it every card's
 * rule on 20 Oct 2026; a button whose dropdown or footer is open stays in
 * view. On a screen with no pointer to hover, they always show. Hidden, they
 * take no room, so the title has the card's whole width in a narrow side
 * panel and is cut short only while the card is pointed at (Tyler, 5 Nov
 * 2026, of Promo's network cards reading "Reddi...").
 *
 * Inside an `InspectorCollapseAllProvider` it also folds or opens with the
 * panel header's `InspectorCollapseAllButton`, as `InspectorCard` does.
 *
 * `icon` is drawn before the title, such as a network's mark on Promo's
 * network cards. `openWhen` opens a folded card each time it turns true,
 * whatever was remembered, such as when a row inside it is picked from
 * elsewhere; folding it again afterwards is still allowed.
 */
export function PanelCard({
  storageId,
  icon,
  title,
  meta,
  after,
  badge,
  action,
  actionOpen = false,
  settings = false,
  openWhen = false,
  className,
  children,
}: {
  /** Plain characters only; it names the card's remembered open or shut state. */
  storageId: string
  /** Before the title, 16px, such as a network's mark. */
  icon?: React.ReactNode
  title: string
  /** Muted, after a dot: "0 of 2 done", "4", "Oct 12 to 13". */
  meta?: React.ReactNode
  /** After the title with a gap and no dot, such as a status: "Status   ● At risk". */
  after?: React.ReactNode
  /** Beside the arrow, such as Late. */
  badge?: React.ReactNode
  /** A button of the card's own beside the arrow, such as a cog that opens a dropdown. */
  action?: React.ReactNode
  /** The action's dropdown is open, so a `quiet` card keeps it in view. */
  actionOpen?: boolean
  /** A cog that opens the footer of buttons. */
  settings?: boolean
  /** Opens the card each time this turns true, whatever was remembered. */
  openWhen?: boolean
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(collapseStorageKey.settingsCard(storageId))
  const [footerOpen, setFooterOpen] = React.useState(false)
  useCollapseAllCommand(setOpen)
  // After the remembered state is read, so on arrival the card opens over it.
  React.useEffect(() => {
    if (openWhen) setOpen(true)
  }, [openWhen, setOpen])
  // Taken out of the row while hidden rather than see-through, so they hold no room.
  const quietClass = "hidden group-hover/card:flex group-has-[:focus-visible]/card:flex [@media(hover:none)]:flex"
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-slot="panel-card"
      className={cn("group/card", panelBoxClassName, className)}
    >
      {/* The buttons' height whether they show or not, so pointing at the card never makes it taller. */}
      <div className="flex min-h-7 items-center gap-2">
        <h2 className="min-w-0 flex-1 text-[15px] font-semibold">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn("flex w-full cursor-pointer items-center gap-2 rounded-md text-left select-none", focusRingInset)}
            >
              {icon ? <span className="flex shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span> : null}
              <span className="min-w-0 flex-1 truncate">
                {title}
                {meta ? <span className="font-normal text-muted-foreground"> · {meta}</span> : null}
                {after ? <span className="ml-2">{after}</span> : null}
              </span>
            </button>
          </CollapsibleTrigger>
        </h2>
        {badge}
        {action ? <span className={cn("flex", !actionOpen && quietClass)}>{action}</span> : null}
        {settings ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`${title} settings`}
                aria-expanded={open && footerOpen}
                // On a folded card the cog opens the card with its buttons showing.
                onClick={() => {
                  if (!open) {
                    setOpen(true)
                    setFooterOpen(true)
                  } else setFooterOpen((shown) => !shown)
                }}
                // No background, open or not (Tyler, 14 Oct 2026); kept in view
                // while its footer is open, so it can close it again.
                className={cn(
                  "text-muted-foreground hover:bg-transparent hover:text-foreground aria-expanded:bg-transparent aria-expanded:text-foreground dark:hover:bg-transparent",
                  !(open && footerOpen) && quietClass
                )}
              >
                <SettingsIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{open && footerOpen ? "Hide the buttons" : "Show the buttons"}</TooltipContent>
          </Tooltip>
        ) : null}
        {/* The heading is the button that folds the card; the arrow is the
            same press for the pointer, and left out of the keyboard's way. */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className={cn("flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md", quietClass)}
          >
            <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/card:-rotate-90" />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent data-collapse-key={noFlashKey}>
        <FooterOpen.Provider value={settings ? footerOpen : null}>
          <div className="mt-4 grid gap-4">{children}</div>
        </FooterOpen.Provider>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * The same grey box with no heading and no fold, for a record's opening card
 * whose first line is the record's own name, as the open contact's is.
 */
export function PanelBox({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div data-slot="panel-card" className={cn(panelBoxClassName, className)}>
      {children}
    </div>
  )
}

/**
 * A card's row of buttons. Inside a `PanelCard` with `settings`, it is the
 * card's footer, across its full width under a line, shown while the cog is
 * on or while `always` (such as Done while notes are being written).
 * Anywhere else it is a plain row.
 */
export function PanelCardFooter({
  always = false,
  className,
  children,
}: {
  always?: boolean
  className?: string
  children: React.ReactNode
}) {
  const footerOpen = React.useContext(FooterOpen)
  if (footerOpen === null) {
    return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
  }
  if (!footerOpen && !always) return null
  return (
    <div
      className={cn(
        // A row of buttons handed in whole (Steps' step-list pair) spreads across it too.
        "-mx-4 -mb-4 flex flex-wrap items-center justify-between gap-2 border-t px-2 py-1.5 [&_[data-slot=button]]:text-muted-foreground [&>div]:w-full [&>div]:justify-between",
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * The small-caps heading over a group inside a side panel ("DESCRIPTION",
 * "LEAD"), one shared class rather than a copy per screen.
 */
export function PanelHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</h3>
}
