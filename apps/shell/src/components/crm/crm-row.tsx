import * as React from "react"
import { ListChecksIcon, SearchIcon } from "lucide-react"

import { PointAnchor } from "@/components/crm/point-anchor"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"

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
 * selected" slot while rows are ticked, the search box once opened, Filter,
 * the view dropdown,
 * the one primary New … button, and the ⋮ last. The ⋮ always holds Search
 * and Mass select; a tab adds its own rows after them (People's Import).
 *
 * The search box opens from the ⋮ with the cursor in it, after the menu has
 * closed, because an open menu keeps the focus. Typing waits 300ms before the
 * list is asked again, so the caret never jumps.
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
  const [searchOpen, setSearchOpen] = React.useState(search.value.length > 0)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const searchAsked = React.useRef(false)

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
      <div className="ml-auto flex min-w-0 shrink items-center gap-1">
        {selected}
        {searchOpen || text ? (
          <DashboardToolbarSearch
            autoFocus={searchOpen}
            className="min-w-0 shrink"
            inputClassName="sm:w-40 lg:w-48"
            name={search.name}
            aria-label={search.label}
            placeholder={search.placeholder}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => setSearchOpen(false)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return
              // Escape clears first and closes second.
              if (text) setText("")
              else setSearchOpen(false)
            }}
          />
        ) : null}
        {filter}
        {view}
        {primary}
        <FoldingMenu
          label={menuLabel}
          fit
          open={menuOpen}
          onOpenChange={setMenuOpen}
          onCloseAutoFocus={(event) => {
            if (!searchAsked.current) return
            searchAsked.current = false
            event.preventDefault()
            setSearchOpen(true)
          }}
        >
          <MenuAction
            icon={<SearchIcon className="size-4" />}
            onClick={() => {
              searchAsked.current = true
              setMenuOpen(false)
            }}
          >
            Search
          </MenuAction>
          {massSelect ? (
            <MenuAction
              icon={<ListChecksIcon className="size-4" />}
              onClick={() => {
                setMenuOpen(false)
                massSelect.onToggle()
              }}
            >
              {massSelect.on ? "Hide select" : "Mass select"}
            </MenuAction>
          ) : null}
          {(menuItems ?? []).map((item) => (
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
        {end}
      </div>
    </DashboardCardHeader>
  )
}
