import * as React from "react"

import { PersonAvatar } from "@/components/project/task-bits"
import { Textarea } from "@/components/ui/textarea"
import { messageParts, tagQueryBefore } from "@/lib/project/mentions"
import { cn } from "@/lib/utils"

export type Taggable = { id: string; name: string; avatarUrl: string }

function matchesName(name: string, typed: string) {
  const lower = name.toLowerCase()
  const query = typed.toLowerCase()
  return lower.startsWith(query) || lower.split(/\s+/).some((word) => word.startsWith(query))
}

/**
 * A box to write in where typing @ lists people to tag: the task chat and the
 * check-in's notes. The list sits above the box and follows the arrow keys;
 * Enter or Tab picks, Escape closes it. Every other key goes to `onKeyDown`.
 * A pick puts "@Name" in the words; `tagPeople` turns it into a tag on save.
 */
export function TagTextarea({
  value,
  onChange,
  people,
  listLabel,
  onKeyDown,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange" | "id"> & {
  id: string
  value: string
  onChange: (value: string) => void
  people: Taggable[]
  /** What the list is, for a screen reader: "People on the project". */
  listLabel: string
}) {
  const box = React.useRef<HTMLTextAreaElement>(null)
  const [tag, setTag] = React.useState<{ typed: string; start: number } | null>(null)
  const [active, setActive] = React.useState(0)
  const matches = tag ? people.filter((person) => matchesName(person.name, tag.typed)).slice(0, 8) : []
  const listOpen = matches.length > 0
  const listId = `${props.id}-people`

  function readTag(area: HTMLTextAreaElement) {
    const cursor = area.selectionStart
    const typed = tagQueryBefore(area.value.slice(0, cursor))
    setTag(typed === null ? null : { typed, start: cursor - typed.length - 1 })
    setActive(0)
  }

  function pick(person: Taggable) {
    const area = box.current
    if (!area || !tag) return
    const inserted = `@${person.name} `
    onChange(value.slice(0, tag.start) + inserted + value.slice(area.selectionStart))
    const cursor = tag.start + inserted.length
    setTag(null)
    requestAnimationFrame(() => {
      area.focus()
      area.setSelectionRange(cursor, cursor)
    })
  }

  return (
    <div className="relative min-w-0 flex-1">
      {listOpen ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={listLabel}
          className="absolute bottom-full left-0 z-10 mb-1 grid w-64 max-w-full gap-0.5 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {matches.map((person, index) => (
            <li
              key={person.id}
              id={`${listId}-${person.id}`}
              role="option"
              aria-selected={index === active}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                index === active && "bg-accent text-accent-foreground"
              )}
              // Picked on press so the box keeps the cursor.
              onMouseDown={(event) => {
                event.preventDefault()
                pick(person)
              }}
            >
              <PersonAvatar name={person.name} avatarUrl={person.avatarUrl} />
              <span className="truncate">{person.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <Textarea
        {...props}
        ref={box}
        value={value}
        role="combobox"
        aria-expanded={listOpen}
        aria-controls={listOpen ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={listOpen ? `${listId}-${matches[active]?.id}` : undefined}
        className={className}
        onChange={(event) => {
          onChange(event.target.value)
          readTag(event.target)
        }}
        onClick={(event) => readTag(event.currentTarget)}
        onBlur={(event) => {
          setTag(null)
          props.onBlur?.(event)
        }}
        onKeyDown={(event) => {
          if (listOpen) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault()
              const step = event.key === "ArrowDown" ? 1 : -1
              setActive((current) => (current + step + matches.length) % matches.length)
              return
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault()
              pick(matches[active])
              return
            }
            if (event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              setTag(null)
              return
            }
          }
          onKeyDown?.(event)
        }}
      />
    </div>
  )
}

/** Words with each tag drawn as the person's current name, or the saved one for someone who left. */
export function TaggedWords({ body, people }: { body: string; people: readonly { id: string; name: string }[] }) {
  return messageParts(body).map((part, index) =>
    part.kind === "text" ? (
      <React.Fragment key={index}>{part.text}</React.Fragment>
    ) : (
      <span key={index} className="font-medium text-primary">
        @{people.find((person) => person.id === part.userId)?.name ?? part.name}
      </span>
    )
  )
}
