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
}

export type ListHandle = { onKeyDown: (event: KeyboardEvent) => boolean }

export type ListProps = {
  label: string
  items: MenuItem[]
  loading: boolean
  emptyText: string
  onPick: (item: MenuItem) => void
}

export const SuggestionList = React.forwardRef<ListHandle, ListProps>(function SuggestionList(
  { label, items, loading, emptyText, onPick },
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

  return (
    <div className="z-50 w-72 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
      <ScrollArea className="max-h-72">
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
      </ScrollArea>
    </div>
  )
})
