import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

/**
 * The list a typing menu shows: arrows move, Enter or Tab picks, and the
 * picked row scrolls into view. `suggestion-menu.ts` opens and closes it.
 */

export type MenuItem = {
  id: string
  title: string
  hint?: string
  icon?: React.ReactNode
  /** The "/" list's heading this row sits under: Basic blocks or Advanced blocks. */
  group?: "basic" | "advanced"
}

const GROUP_LABEL = { basic: "Basic blocks", advanced: "Advanced blocks" } as const

export type ListHandle = { onKeyDown: (event: KeyboardEvent) => boolean }

export type ListProps = {
  label: string
  items: MenuItem[]
  loading: boolean
  emptyText: string
  /** Every row shows with no scroller; otherwise the list scrolls past 18rem. */
  fitAll?: boolean
  onPick: (item: MenuItem) => void
}

export const SuggestionList = React.forwardRef<ListHandle, ListProps>(function SuggestionList(
  { label, items, loading, emptyText, fitAll = false, onPick },
  ref
) {
  const [active, setActive] = React.useState({ items, index: 0 })
  if (active.items !== items) setActive({ items, index: 0 })
  const index = Math.min(active.index, Math.max(items.length - 1, 0))
  const listId = React.useId()

  React.useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (!items.length) return false
      if (event.key === "ArrowDown") {
        setActive({ items, index: (index + 1) % items.length })
        return true
      }
      if (event.key === "ArrowUp") {
        setActive({ items, index: (index - 1 + items.length) % items.length })
        return true
      }
      if (event.key === "Enter" || event.key === "Tab") {
        onPick(items[index])
        return true
      }
      return false
    },
  }))

  React.useEffect(() => {
    document.getElementById(`${listId}-${index}`)?.scrollIntoView({ block: "nearest" })
  }, [index, listId])

  if (fitAll) {
    return <GroupedList label={label} items={items} index={index} listId={listId} emptyText={emptyText} onActive={(at) => setActive({ items, index: at })} onPick={onPick} />
  }

  return (
    <div className="z-50 w-72 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
      <ListFrame fitAll={false}>
        <div role="listbox" aria-label={label} className="grid p-1">
          {items.length ? (
            items.map((item, at) => (
              <button
                key={item.id}
                id={`${listId}-${at}`}
                type="button"
                role="option"
                aria-selected={at === index}
                // Keeps the cursor in the note while the pick is made.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive({ items, index: at })}
                onClick={() => onPick(item)}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                  at === index && "bg-muted"
                )}
              >
                {item.icon ? (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background [&_svg]:size-4">
                    {item.icon}
                  </span>
                ) : null}
                <span className="grid min-w-0">
                  <span className="truncate">{item.title}</span>
                  {item.hint ? <span className="truncate text-xs text-muted-foreground">{item.hint}</span> : null}
                </span>
              </button>
            ))
          ) : (
            <p className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
              {loading ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {loading ? "Looking…" : emptyText}
            </p>
          )}
        </div>
      </ListFrame>
    </div>
  )
})

/**
 * The "/" list drawn as the shell's is on every left page
 * (`shared/notes/note-blocks-menu.tsx`; Tyler, 15 Nov 2026: "it should look
 * like this"): Basic blocks, then Advanced blocks under one line edge to
 * edge, each row a bare icon and the name alone, one column, every row shown
 * with no scroller ("just make it fit all the tools").
 */
function GroupedList({
  label,
  items,
  index,
  listId,
  emptyText,
  onActive,
  onPick,
}: {
  label: string
  items: MenuItem[]
  index: number
  listId: string
  emptyText: string
  onActive: (index: number) => void
  onPick: (item: MenuItem) => void
}) {
  const groups = (["basic", "advanced"] as const).filter((group) => items.some((item) => (item.group ?? "basic") === group))
  return (
    <div className="z-50 w-max min-w-56 rounded-md border bg-popover p-2 text-[13px] text-popover-foreground shadow-md">
      <div role="listbox" aria-label={label} className="grid">
        {items.length === 0 ? <p className="px-2.5 py-1.5 text-muted-foreground">{emptyText}</p> : null}
        {groups.map((group, groupIndex) => {
          const headingId = `${listId}-${group}`
          return (
            <div key={group} role="group" aria-labelledby={headingId} className="grid">
              {groupIndex > 0 ? <div aria-hidden className="-mx-2 my-1.5 border-t" /> : null}
              <div id={headingId} className="px-2.5 pt-0.5 pb-1 text-xs font-medium text-muted-foreground">
                {GROUP_LABEL[group]}
              </div>
              {items.map((item, at) =>
                (item.group ?? "basic") === group ? (
                  <button
                    key={item.id}
                    id={`${listId}-${at}`}
                    type="button"
                    role="option"
                    aria-selected={at === index}
                    // Keeps the cursor in the note while the pick is made.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => onActive(at)}
                    onClick={() => onPick(item)}
                    className={cn(
                      "flex min-h-8 items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
                      at === index && "bg-accent"
                    )}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </button>
                ) : null
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ListFrame({ fitAll, children }: { fitAll: boolean; children: React.ReactNode }) {
  if (fitAll) return <>{children}</>
  return <ScrollArea viewportClassName="max-h-72">{children}</ScrollArea>
}
