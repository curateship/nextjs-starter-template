import * as React from "react"
import { ListChecksIcon } from "lucide-react"

import { PointAnchor } from "@/components/crm/point-anchor"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardToolbarButton, DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { cn } from "@/lib/utils"

export type RowMenuItem = {
  label: string
  icon: React.ReactNode
  onSelect: () => void
  /** Drawn red, under a line of its own, last. */
  destructive?: boolean
}

/**
 * A row's right-click menu, at the pointer (the Admin 3 panel design, "A
 * row's right-click menu"): Mass select first, "Hide select" while on, then
 * the row's own actions, then the destructive one under a line.
 */
export function CrmRowMenu({
  at,
  massSelect,
  items,
  onClose,
}: {
  at: { x: number; y: number }
  massSelect: { on: boolean; onToggle: () => void } | null
  items: RowMenuItem[]
  onClose: () => void
}) {
  const plain = items.filter((item) => !item.destructive)
  const red = items.filter((item) => item.destructive)
  return (
    // Not modal, so a right-click on another row moves the menu there in one go.
    <DropdownMenu open onOpenChange={(open) => (open ? undefined : onClose())} modal={false}>
      <DropdownMenuTrigger asChild>
        <PointAnchor x={at.x} y={at.y} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52" onCloseAutoFocus={(event) => event.preventDefault()}>
        {massSelect ? (
          <DropdownMenuItem onSelect={massSelect.onToggle}>
            <ListChecksIcon className="size-4" />
            {massSelect.on ? "Hide select" : "Mass select"}
          </DropdownMenuItem>
        ) : null}
        {plain.map((item) => (
          <DropdownMenuItem key={item.label} onSelect={item.onSelect}>
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
        {red.length ? <DropdownMenuSeparator /> : null}
        {red.map((item) => (
          <DropdownMenuItem key={item.label} variant="destructive" onSelect={item.onSelect}>
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The one middle header every CRM tab has (the Admin 3 panel design,
 * "Middle panel"): the Broadcasts, Inbox and People tabs, then the "N
 * selected" slot while rows are ticked, the search box, Mass select right after it (Tyler, 9 Nov 2026: "mass
 * select should be after saerch field"), Filter, the view dropdown, the one
 * primary New … button, and
 * a ⋮ only where the tab has rows of its own for it (People's Import).
 * Search and Mass select are buttons of their own, out of the ⋮, and every
 * button but New has a line round it and a white fill, the outline look,
 * so none of them reads as plain text (Tyler, 9 Nov 2026: "Lets take the
 * search and mass selet out of the dropdown and have all the buttons use a
 * more visible button").
 *
 * Search is a box that is always there. Typing waits 300ms before the list
 * is asked again, so the caret never jumps.
 */
export function CrmListHeader({
  tabs,
  selected,
  filter,
  view,
  primary,
  menuLabel,
  search,
  massSelect,
  menuItems,
  end,
}: {
  tabs: React.ReactNode
  /** After the ⋮, last in the header: a button that reopens the right panel. */
  end?: React.ReactNode
  /** The "N selected" menu, while rows are ticked. */
  selected?: React.ReactNode
  filter?: React.ReactNode
  /** Which part of the tab's list shows, a dropdown between Filter and New. */
  view?: React.ReactNode
  /** The New … dropdown. */
  primary?: React.ReactNode
  /** "More for the inbox". */
  menuLabel: string
  search: { value: string; onChange: (value: string) => void; placeholder: string; label: string; name: string }
  massSelect: { on: boolean; onToggle: () => void } | null
  menuItems?: { label: string; icon: React.ReactNode; onClick: () => void }[]
}) {
  const [text, setText] = useSyncedDraft(search.value)
  const [menuOpen, setMenuOpen] = React.useState(false)

  // The owner rebuilds the callback every render, so it waits in a ref and the
  // timer is keyed on the words alone.
  const changeRef = React.useRef(search.onChange)
  React.useEffect(() => {
    changeRef.current = search.onChange
  })
  React.useEffect(() => {
    if (text === search.value) return
    const timer = setTimeout(() => changeRef.current(text), 300)
    return () => clearTimeout(timer)
  }, [text, search.value])

  return (
    <DashboardCardHeader className="@container gap-2">
      {tabs}
      {/* A ghost button here (Filter, the view dropdown, the ⋮) takes the
          outline look too, as Search and Mass select have it. The line is
          a light grey of its own, not the Divider lines colour from
          Settings (Tyler, 9 Nov 2026: "dont wire the border to the
          settings. Let it have its own border and make the border light
          gray", then "reduce the border shade a bit": 60% of that grey).
          The search box takes the same line. */}
      <div className="ml-auto flex min-w-0 shrink items-center gap-1.5 [&_[data-variant=ghost]]:bg-background [&_[data-variant=ghost]:hover]:bg-muted [&_[data-variant=ghost]]:border-zinc-200/60 [&_[data-variant=outline]]:border-zinc-200/60 [&_input]:border-zinc-200/60 dark:[&_[data-variant=ghost]]:border-zinc-700/60 dark:[&_[data-variant=outline]]:border-zinc-700/60 dark:[&_input]:border-zinc-700/60">
        {selected}
        {/* A search box that is always there (Tyler, 9 Nov 2026: "make the
            search an actual search field"); Escape clears it. */}
        <DashboardToolbarSearch
          className="min-w-0 shrink"
          inputClassName="sm:w-40 lg:w-48"
          name={search.name}
          aria-label={search.label}
          placeholder={search.placeholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && text) setText("")
          }}
        />
        {massSelect ? (
          <DashboardToolbarButton
            type="button"
            variant="outline"
            aria-pressed={massSelect.on}
            aria-label={massSelect.on ? "Hide select" : "Mass select"}
            className={cn(massSelect.on && "bg-muted")}
            onClick={massSelect.onToggle}
          >
            <ListChecksIcon className="size-4" />
            <span className="@max-3xl:sr-only">{massSelect.on ? "Hide select" : "Select"}</span>
          </DashboardToolbarButton>
        ) : null}
        {filter}
        {view}
        {primary}
        {menuItems?.length ? (
        <FoldingMenu label={menuLabel} fit open={menuOpen} onOpenChange={setMenuOpen}>
          {menuItems.map((item) => (
            <MenuAction
              key={item.label}
              icon={item.icon}
              onClick={() => {
                setMenuOpen(false)
                item.onClick()
              }}
            >
              {item.label}
            </MenuAction>
          ))}
        </FoldingMenu>
        ) : null}
      </div>
      {/* Outside the buttons above, so the reopen button keeps its plain look. */}
      {end}
    </DashboardCardHeader>
  )
}
