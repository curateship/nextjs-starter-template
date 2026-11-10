import * as React from "react"
import { EllipsisVerticalIcon } from "lucide-react"

import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { keepOpenForInnerBoxes } from "@/components/shared/notes/pick-rows"
import { cn } from "@/lib/utils"

/*
 * Copied from Project (`apps/project/src/components/project/my-settings-menu.tsx`)
 * for the Admin 3 panel design: Travel's trip ⋮ and activity ⋮ are this
 * menu (Tyler, 6 Nov 2026).
 */
export type MySettingsTab = {
  value: string
  label: string
  content: React.ReactNode
  /**
   * The tab's one action under its rows, such as Lock blocks or New plan,
   * drawn by the menu under a line across it, the same on every tab (Tyler,
   * 9 Nov 2026: "make both footer the same ui"). It stays in view when the
   * rows scroll. Use `MenuFooterButton`.
   */
  footer?: React.ReactNode
}

/** A tab's footer action: a full-width row with its icon, as every ⋮ footer is. */
export function MenuFooterButton({
  icon,
  disabled = false,
  onClick,
  children,
}: {
  icon: React.ReactNode
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      className="w-full justify-start gap-2 px-2 font-normal [&_svg]:size-4"
      onClick={onClick}
    >
      {icon}
      {children}
    </Button>
  )
}

/**
 * A tabbed ⋮'s open state and tab, held by the page so something outside the
 * menu can open it at one tab: a widget's Manage widgets opens the left
 * panel's ⋮ at Widgets (Tyler, 10 Nov 2026). Hand `open`, `tab` and their two
 * setters to `TabbedMenu`; `openAt` opens it showing that tab.
 */
export function useTabbedMenuState() {
  const [state, setState] = React.useState<{ open: boolean; tab: string | undefined }>({
    open: false,
    tab: undefined,
  })
  return {
    open: state.open,
    tab: state.tab,
    onOpenChange: React.useCallback((open: boolean) => setState((was) => ({ ...was, open })), []),
    onTabChange: React.useCallback((tab: string) => setState((was) => ({ ...was, tab })), []),
    openAt: React.useCallback((tab: string) => setState({ open: true, tab }), []),
  }
}

export type TabbedMenuState = ReturnType<typeof useTabbedMenuState>

/**
 * The ⋮ with tabbed settings that My settings is, shared by the task panel's
 * ⋮ (Tyler, 6 Nov 2026: "It needs to copy the Ui of the left panel tabs").
 * `open` and `onOpenChange` let the page close it from outside, `tab` and
 * `onTabChange` pick the tab from outside (`useTabbedMenuState`), and
 * `onCloseAutoFocus` sends the keyboard somewhere other than the ⋮.
 */
export function TabbedMenu({
  label,
  tabs,
  align = "start",
  width = "22.7rem",
  open: openFromOutside,
  onOpenChange,
  tab: tabFromOutside,
  onTabChange,
  onCloseAutoFocus,
}: {
  label: string
  tabs: MySettingsTab[]
  align?: "start" | "end"
  /** Its widest, as a CSS length; a phone gets the screen less 2rem. */
  width?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** The tab showing, when the page holds it; undefined shows the first. */
  tab?: string
  onTabChange?: (tab: string) => void
  onCloseAutoFocus?: (event: Event) => void
}) {
  const [ownOpen, setOwnOpen] = React.useState(false)
  const open = openFromOutside ?? ownOpen
  const [ownTab, setOwnTab] = React.useState(tabs[0]?.value ?? "")
  const tab = onTabChange ? (tabFromOutside ?? tabs[0]?.value ?? "") : ownTab
  const setTab = (next: string) => {
    if (onTabChange) onTabChange(next)
    else setOwnTab(next)
  }
  // Opened from its own ⋮, it starts on the first tab.
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
        onInteractOutside={keepOpenForInnerBoxes}
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
        {shown?.footer ? <div className="border-t p-1.5">{shown.footer}</div> : null}
      </PopoverContent>
    </Popover>
  )
}
