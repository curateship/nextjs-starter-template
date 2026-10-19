import * as React from "react"
import { XIcon } from "lucide-react"

import { ProjectDot } from "@/components/project/task-bits"
import type { Change } from "@/components/project/task-body"
import { Badge } from "@/components/ui/badge"
import { makeLabel, saveTaskLabels, type Label as TaskTag } from "@/lib/api/project/sorting"
import type { TaskDetail } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS, type ProjectColor } from "@/lib/project/rules"
import { useTeamId } from "@/lib/project/team-scope"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** A tag as the box draws it; a typed one not made yet has no id. */
export type TagPill = { id: string | null; name: string; color: ProjectColor }

/**
 * Tags as pills with an × each, then a box: typing a name and pressing Enter
 * adds it, Backspace in the empty box takes the last one off, Escape empties
 * the box, and the team's tags that match what is typed show under it to click
 * (Tyler, 19 Oct 2026: "I should be able to enter to place a tag and it
 * should show a pill with an x icon to remove it"). What adding means is the
 * caller's: the task saves at once, New task holds them until it is made.
 */
export function TagsBox({
  id,
  tags,
  teamTags,
  readOnly = false,
  disabled = false,
  onAdd,
  onRemove,
}: {
  /** The box's id, for a label written beside it. */
  id?: string
  tags: TagPill[]
  /** The team's tags, for the matches under the box. */
  teamTags: TaskTag[]
  readOnly?: boolean
  disabled?: boolean
  /** A typed name, or a picked team tag. Resolves true when it was added, to empty the box. */
  onAdd: (tag: { name: string; known: TaskTag | null }) => Promise<boolean>
  onRemove: (tag: TagPill) => void
}) {
  const [text, setText] = React.useState("")
  const names = new Set(tags.map((tag) => tag.name.toLowerCase()))
  const needle = text.trim().toLowerCase()
  const suggestions = needle
    ? teamTags.filter((tag) => !names.has(tag.name.toLowerCase()) && tag.name.toLowerCase().includes(needle)).slice(0, 6)
    : []

  async function add(name: string) {
    const clean = name.trim()
    if (!clean) return
    if (clean.length > LIMITS.labelName) {
      showErrorToast(`A tag can be at most ${LIMITS.labelName} characters.`)
      return
    }
    // Names are unique in a team whatever their capitals, so "bug" finds "Bug".
    if (names.has(clean.toLowerCase())) {
      setText("")
      return
    }
    const known = teamTags.find((tag) => tag.name.toLowerCase() === clean.toLowerCase()) ?? null
    if (await onAdd({ name: known?.name ?? clean, known })) setText("")
  }

  return (
    <div className="grid gap-1.5">
      <div
        className={cn(
          // The shell Input's own edge and fill, so it matches the fields around it.
          "flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 dark:bg-input/30",
          !readOnly && "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
        )}
      >
        {tags.map((tag) => (
          <Badge key={tag.id ?? tag.name} variant="outline" className="max-w-48 gap-1 pr-0.5">
            <ProjectDot color={tag.color} className="size-2" />
            <span className="truncate">{tag.name}</span>
            {readOnly ? null : (
              <button
                type="button"
                aria-label={`Remove the tag ${tag.name}`}
                disabled={disabled}
                onClick={() => onRemove(tag)}
                className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </Badge>
        ))}
        {readOnly ? (
          tags.length ? null : <span className="px-1 text-sm text-muted-foreground">No tags</span>
        ) : (
          <input
            id={id}
            aria-label="Add a tag"
            value={text}
            maxLength={LIMITS.labelName}
            disabled={disabled}
            placeholder={tags.length ? "Add a tag" : "Add a tag and press Enter"}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Enter places the tag; it never submits a form the box sits in.
                event.preventDefault()
                void add(text)
              } else if (event.key === "Backspace" && !text && tags.length) {
                onRemove(tags[tags.length - 1])
              } else if (event.key === "Escape" && text) {
                event.stopPropagation()
                setText("")
              }
            }}
            className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
          />
        )}
      </div>
      {suggestions.length ? (
        <div className="flex flex-wrap items-center gap-1">
          {suggestions.map((tag) => (
            <button
              key={tag.id}
              type="button"
              disabled={disabled}
              onClick={() => void add(tag.name)}
              className="rounded-4xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Add the tag ${tag.name}`}
            >
              <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                <ProjectDot color={tag.color} className="size-2" />
                {tag.name}
              </Badge>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The task's tags, under its title. A typed name the team doesn't have yet is
 * made first, grey; the site admin recolours it in Team settings. Tags are the
 * team's labels, named so in the code and database.
 */
export function TaskTagsField({
  id,
  detail,
  readOnly,
  busy,
  change,
}: {
  id?: string
  detail: TaskDetail
  readOnly: boolean
  busy: boolean
  change: Change
}) {
  const { task } = detail
  const teamId = useTeamId()
  const [run, making] = useAsyncAction(getProjectErrorMessage)
  const ids = task.labels.map((label) => label.id)

  function save(labelIds: string[]) {
    return change(() => saveTaskLabels(task.id, labelIds))
  }

  return (
    <TagsBox
      id={id}
      tags={task.labels}
      teamTags={detail.labels}
      readOnly={readOnly}
      disabled={busy || making}
      onRemove={(tag) => void save(ids.filter((labelId) => labelId !== tag.id))}
      onAdd={async ({ name, known }) => {
        if (known) return save([...ids, known.id])
        let madeId = ""
        const ok = await run(async () => {
          madeId = (await makeLabel({ name, color: "slate" }, teamId)).id
        })
        return ok && save([...ids, madeId])
      }}
    />
  )
}

/** Makes the typed tags New task held, and gives back every tag's id. */
export async function tagIdsFor(tags: TagPill[], teamId: string | undefined) {
  const ids: string[] = []
  for (const tag of tags) {
    ids.push(tag.id ?? (await makeLabel({ name: tag.name, color: tag.color }, teamId)).id)
  }
  return ids
}
