import * as React from "react"
import { XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** The same limits the server's contact schema checks. */
const MAX_TAG_LENGTH = 100
const MAX_TAGS = 25

/**
 * A contact's tags as pills with an × each, then a box, the way Project's
 * task tags work (Tyler, 19 Oct 2026: "fix how tag flow. Look at how project
 * does it"). Typing a name and pressing Enter places it, Backspace in the
 * empty box takes the last one off, Escape empties the box, and the tags
 * other contacts already carry that match what is typed show under it to
 * click. What placing means is the caller's: the open contact saves at once,
 * New contact holds them until the contact is made.
 */
export function ContactTagsBox({
  id,
  tags,
  knownTags,
  disabled = false,
  onAdd,
  onRemove,
}: {
  id?: string
  tags: string[]
  /** Every tag in use in the workspace, for the matches under the box. */
  knownTags: string[]
  disabled?: boolean
  /** Resolves true when the tag was placed, which empties the box. */
  onAdd: (tag: string) => Promise<boolean> | boolean
  onRemove: (tag: string) => void
}) {
  const [text, setText] = React.useState("")
  const placed = new Set(tags.map((tag) => tag.toLowerCase()))
  const needle = text.trim().toLowerCase()
  const suggestions = needle
    ? knownTags
        .filter((tag) => !placed.has(tag.toLowerCase()) && tag.toLowerCase().includes(needle))
        .slice(0, 6)
    : []

  async function add(name: string) {
    const clean = name.trim()
    if (!clean) return
    // Already there, whatever its capitals: nothing to add, so the box empties.
    if (placed.has(clean.toLowerCase())) {
      setText("")
      return
    }
    if (tags.length >= MAX_TAGS) {
      showErrorToast(`A contact can carry at most ${MAX_TAGS} tags.`)
      return
    }
    const known = knownTags.find((tag) => tag.toLowerCase() === clean.toLowerCase())
    if (await onAdd(known ?? clean)) setText("")
  }

  return (
    <div className="grid gap-1.5">
      <div
        className={cn(
          // The shell Input's own edge and fill, so it matches the fields around it.
          "flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-input bg-background px-1.5 py-1 dark:bg-input/30",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
        )}
      >
        {tags.map((tag) => (
          <Badge key={tag} variant="outline" className="max-w-48 gap-1 pr-0.5">
            <span className="truncate">{tag}</span>
            <button
              type="button"
              aria-label={`Remove the tag ${tag}`}
              disabled={disabled}
              onClick={() => onRemove(tag)}
              className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          id={id}
          aria-label="Add a tag"
          value={text}
          maxLength={MAX_TAG_LENGTH}
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
      </div>
      {suggestions.length ? (
        <div className="flex flex-wrap items-center gap-1">
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              disabled={disabled}
              onClick={() => void add(tag)}
              className="rounded-4xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Add the tag ${tag}`}
            >
              <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                {tag}
              </Badge>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
