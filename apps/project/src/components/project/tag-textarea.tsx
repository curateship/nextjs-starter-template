import * as React from "react"
import { ListTodoIcon, UsersIcon } from "lucide-react"

import { PersonAvatar } from "@/components/project/task-bits"
import { Textarea } from "@/components/ui/textarea"
import type { LinkChoice } from "@/lib/api/project/chat"
import { PROJECT_TAG, linkQueryBefore, messageParts, tagQueryBefore } from "@/lib/project/mentions"
import { cn } from "@/lib/utils"

export type Taggable = { id: string; name: string; avatarUrl: string }

/** What # lists: tasks found by their title, and what to remember once one is picked. */
export type TaskLinking = {
  find: (typed: string) => Promise<LinkChoice[]>
  onPick: (task: LinkChoice) => void
}

function matchesName(name: string, typed: string) {
  const lower = name.toLowerCase()
  const query = typed.toLowerCase()
  return lower.startsWith(query) || lower.split(/\s+/).some((word) => word.startsWith(query))
}

type Typing = { sign: "@" | "#"; typed: string; start: number }
type Choice =
  | { kind: "person"; id: string; label: string; person: Taggable }
  | { kind: "everyone"; id: string; label: string }
  | { kind: "task"; id: string; label: string; task: LinkChoice }

/** How long typing after # pauses before the tasks are looked up. */
const FIND_DELAY_MS = 200

/**
 * A box to write in where typing @ lists people to tag (the chat and the
 * check-in's notes), and, with `linking`, typing # lists tasks to link (the
 * chat). With `wholeProject`, the @ list starts with "@project", which tags
 * everyone on the project. The list sits above the box and follows the arrow keys; Enter or
 * Tab picks, Escape closes it. Every other key goes to `onKeyDown`. A pick
 * puts "@Name" or "#Title" in the words; `tokenizeMessage` turns it into a
 * tag or a link on save.
 */
export function TagTextarea({
  value,
  onChange,
  people,
  listLabel,
  linking,
  wholeProject = false,
  onKeyDown,
  className,
  ref,
  ...props
}: Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange" | "id" | "ref"> & {
  id: string
  value: string
  onChange: (value: string) => void
  people: Taggable[]
  /** What the list is, for a screen reader: "People on the project". */
  listLabel: string
  linking?: TaskLinking
  /** Offer "@project" to tag everyone on the project (a chat, not the check-in). */
  wholeProject?: boolean
  /** The box itself, so a Reply can put the cursor in it. */
  ref?: React.RefObject<HTMLTextAreaElement | null>
}) {
  const own = React.useRef<HTMLTextAreaElement>(null)
  const box = ref ?? own
  const [typing, setTyping] = React.useState<Typing | null>(null)
  const [active, setActive] = React.useState(0)
  const [found, setFound] = React.useState<{ typed: string; tasks: LinkChoice[] } | null>(null)
  const listId = `${props.id}-choices`

  // # looks tasks up on the server once typing pauses.
  const query = typing?.sign === "#" ? typing.typed : null
  React.useEffect(() => {
    if (query === null || !linking) return
    let live = true
    const timer = window.setTimeout(() => {
      linking.find(query).then(
        (tasks) => live && setFound({ typed: query, tasks }),
        () => live && setFound({ typed: query, tasks: [] })
      )
    }, FIND_DELAY_MS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [query, linking])

  const choices: Choice[] = !typing
    ? []
    : typing.sign === "@"
      ? [
          ...(wholeProject && matchesName(PROJECT_TAG.name, typing.typed)
            ? [{ kind: "everyone" as const, id: PROJECT_TAG.id, label: PROJECT_TAG.name }]
            : []),
          ...people
            .filter((person) => matchesName(person.name, typing.typed))
            .slice(0, 8)
            .map((person) => ({ kind: "person" as const, id: person.id, label: person.name, person })),
        ]
      : found?.typed === typing.typed
        ? found.tasks.map((task) => ({ kind: "task", id: task.id, label: task.title, task }))
        : []
  const listOpen = choices.length > 0

  function readTyping(area: HTMLTextAreaElement) {
    const before = area.value.slice(0, area.selectionStart)
    const tag = tagQueryBefore(before)
    const link = linking ? linkQueryBefore(before) : null
    // Whichever sign is nearer the cursor is the one being typed.
    const next: Typing | null =
      tag !== null && (link === null || tag.length <= link.length)
        ? { sign: "@", typed: tag, start: area.selectionStart - tag.length - 1 }
        : link !== null
          ? { sign: "#", typed: link, start: area.selectionStart - link.length - 1 }
          : null
    setTyping(next)
    setActive(0)
  }

  function pick(choice: Choice) {
    const area = box.current
    if (!area || !typing) return
    const inserted =
      choice.kind === "person"
        ? `@${choice.person.name} `
        : choice.kind === "everyone"
          ? `@${PROJECT_TAG.name} `
          : `#${choice.task.title} `
    if (choice.kind === "task") linking?.onPick(choice.task)
    onChange(value.slice(0, typing.start) + inserted + value.slice(area.selectionStart))
    const cursor = typing.start + inserted.length
    setTyping(null)
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
          aria-label={typing?.sign === "#" ? "Tasks to link" : listLabel}
          className="absolute bottom-full left-0 z-10 mb-1 grid w-72 max-w-full gap-0.5 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {choices.map((choice, index) => (
            <li
              key={choice.id}
              id={`${listId}-${choice.id}`}
              role="option"
              aria-selected={index === active}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                index === active && "bg-accent text-accent-foreground"
              )}
              // Picked on press so the box keeps the cursor.
              onMouseDown={(event) => {
                event.preventDefault()
                pick(choice)
              }}
            >
              {choice.kind === "person" ? (
                <>
                  <PersonAvatar name={choice.person.name} avatarUrl={choice.person.avatarUrl} />
                  <span className="truncate">{choice.label}</span>
                </>
              ) : choice.kind === "everyone" ? (
                <>
                  <UsersIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="grid min-w-0">
                    <span className="truncate">@{choice.label}</span>
                    <span className="truncate text-xs text-muted-foreground">Everyone on the project</span>
                  </span>
                </>
              ) : (
                <>
                  <ListTodoIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="grid min-w-0">
                    <span className="truncate">{choice.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{choice.task.projectName}</span>
                  </span>
                </>
              )}
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
        aria-activedescendant={listOpen ? `${listId}-${choices[active]?.id}` : undefined}
        className={className}
        onChange={(event) => {
          onChange(event.target.value)
          readTyping(event.target)
        }}
        onClick={(event) => readTyping(event.currentTarget)}
        onBlur={(event) => {
          setTyping(null)
          props.onBlur?.(event)
        }}
        onKeyDown={(event) => {
          if (listOpen) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault()
              const step = event.key === "ArrowDown" ? 1 : -1
              setActive((current) => (current + step + choices.length) % choices.length)
              return
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault()
              pick(choices[active])
              return
            }
            if (event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              setTyping(null)
              return
            }
          }
          onKeyDown?.(event)
        }}
      />
    </div>
  )
}

/**
 * Words with each tag drawn as the person's current name, or the saved one for
 * someone who left, and each task link as the name the server gave it for
 * this reader. `onOpenTask` makes the links someone can open clickable.
 */
export function TaggedWords({
  body,
  people,
  links = {},
  onOpenTask,
}: {
  body: string
  people: readonly { id: string; name: string }[]
  /** Linked tasks this reader can open: task id to project id. */
  links?: Record<string, string>
  onOpenTask?: (projectId: string, taskId: string) => void
}) {
  return messageParts(body).map((part, index) => {
    if (part.kind === "text") return <React.Fragment key={index}>{part.text}</React.Fragment>
    if (part.kind === "tag") {
      return (
        <span key={index} className="font-medium text-primary">
          @
          {part.userId === PROJECT_TAG.id
            ? PROJECT_TAG.name
            : (people.find((person) => person.id === part.userId)?.name ?? part.name)}
        </span>
      )
    }
    const projectId = links[part.taskId]
    return projectId && onOpenTask ? (
      <button
        key={index}
        type="button"
        className="font-medium text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
        onClick={() => onOpenTask(projectId, part.taskId)}
      >
        #{part.name}
      </button>
    ) : (
      <span key={index} className="text-muted-foreground italic">
        #{part.name}
      </span>
    )
  })
}
