import * as React from "react"
import { EllipsisVerticalIcon } from "lucide-react"

import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export type MySettingsTab = { value: string; label: string; content: React.ReactNode }

/**
 * My settings on My dashboard, for the site admin and for everyone else, behind
 * the ⋮ in the left panel's header (Tyler, 6 Nov 2026: "it needs to be replaced
 * with a 3 vertical icon ... It uses tabs. The first tab should be called
 * "General" ... second tab is "Notifications""). A dropdown up to 22.7rem
 * wide, underlined tabs on top from the left, and each tab scrolling inside
 * it. It opens on its first tab every time. Every field saves
 * itself, so closing leaves the field being typed in first, which saves it.
 */
export function MySettingsMenu({ tabs }: { tabs: MySettingsTab[] }) {
  return <TabbedMenu label="My settings" tabs={tabs} />
}

/**
 * The ⋮ with tabbed settings that My settings is, shared by the task panel's
 * ⋮ (Tyler, 6 Nov 2026: "It needs to copy the Ui of the left panel tabs").
 * `open` and `onOpenChange` let the page close it from outside, and
 * `onCloseAutoFocus` send the keyboard somewhere other than the ⋮.
 */
export function TabbedMenu({
  label,
  tabs,
  align = "start",
  width = "22.7rem",
  open: openFromOutside,
  onOpenChange,
  onCloseAutoFocus,
}: {
  label: string
  tabs: MySettingsTab[]
  align?: "start" | "end"
  /** Its widest, as a CSS length; a phone gets the screen less 2rem. */
  width?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onCloseAutoFocus?: (event: Event) => void
}) {
  const [ownOpen, setOwnOpen] = React.useState(false)
  const open = openFromOutside ?? ownOpen
  const [tab, setTab] = React.useState(tabs[0]?.value ?? "")
  function change(next: boolean) {
    if (!next && document.activeElement instanceof HTMLElement) document.activeElement.blur()
    if (next) setTab(tabs[0]?.value ?? "")
    if (openFromOutside === undefined) setOwnOpen(next)
    onOpenChange?.(next)
  }
  const shown = tabs.find((item) => item.value === tab) ?? tabs[0]
  return (
    <Popover open={open} onOpenChange={change}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label={label} className={cn(open && "bg-muted")}>
              <EllipsisVerticalIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align={align}
        collisionPadding={16}
        aria-label={label}
        onCloseAutoFocus={onCloseAutoFocus}
        // A box inside that uses Escape itself, such as a new habit's name, keeps it.
        onEscapeKeyDown={(event) => {
          // The key's own target: the box may already be gone by the time this runs.
          if (event.target instanceof Element && event.target.closest("[data-own-escape]")) event.preventDefault()
        }}
        // 28rem, then 10% narrower twice (Tyler, 6 Nov 2026: "reduce the dropdown by 10%
        // width", then "Reduce width by 10% more").
        style={{ width: `min(${width}, calc(100vw - 2rem))` }}
        className="gap-0 p-0"
      >
        {/* Underlined, from the left, 32px apart (Tyler, 6 Nov 2026: "the tabs align to
            left and add more spacings, its too condensed", then "a bit more space for the
            tabs"). The line under the tab showing sits on the row's own divider. */}
        <div className="flex h-12 items-stretch border-b px-4">
          <DashboardTabs
            style="underline"
            className="my-0 [&_[role=tablist]]:gap-8"
            value={shown?.value ?? ""}
            onValueChange={setTab}
            tabs={tabs.map(({ value, label }) => ({ value, label }))}
          />
        </div>
        <ScrollArea className="min-h-0" viewportClassName="max-h-[min(75vh,44rem)]">
          {/* Plain rows, no lines between them (Tyler, 6 Nov 2026: "Remove email and dividers"). */}
          <div className="grid grid-cols-[minmax(0,1fr)] py-1">{shown?.content}</div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

/**
 * One setting in My settings, always open: its name, a short line when the
 * name alone doesn't say enough, then the field. Folds are only for a long
 * setting, such as the Daily card's Habits (Tyler, 6 Nov 2026: "we don't need
 * toggles if its not required"). No lines part the rows. `htmlFor` makes the
 * name the field's label.
 * `action` sits at the right of the name, such as a save sign.
 */
export function SettingRow({
  title,
  description,
  htmlFor,
  action,
  className,
  children,
}: {
  title: string
  description?: React.ReactNode
  htmlFor?: string
  action?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <section aria-label={htmlFor ? undefined : title} className={cn("grid grid-cols-[minmax(0,1fr)] gap-2 px-4 py-3", className)}>
      <div className="flex min-h-6 items-center gap-2">
        {htmlFor ? (
          <Label htmlFor={htmlFor} className="min-w-0 flex-1 text-base leading-tight font-semibold">
            {title}
          </Label>
        ) : (
          <h3 className="min-w-0 flex-1 text-base leading-tight font-semibold">{title}</h3>
        )}
        {action}
      </div>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {children}
    </section>
  )
}
