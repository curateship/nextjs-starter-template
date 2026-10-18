import * as React from "react"
import { PlusIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  cleanKeyword,
  VIRAL_KEYWORD_MAX,
  VIRAL_KEYWORDS_MAX,
} from "@/lib/video/viral"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Keywords typed as chips: Enter or a comma adds one, the cross takes it
 * off. A repeat, ignoring capitals, is refused with a sentence, and so is an
 * eleventh.
 */
export function KeywordChips({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string
  value: string[]
  onChange: (next: string[]) => void
  invalid?: boolean
}) {
  const [text, setText] = React.useState("")

  function add(raw: string) {
    if (!raw.trim()) return
    let keyword: string
    try {
      keyword = cleanKeyword(raw)
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : "Check the keyword.")
      return
    }
    if (value.some((one) => one.toLowerCase() === keyword.toLowerCase())) {
      showErrorToast(`"${keyword}" is already in the list.`)
      return
    }
    if (value.length >= VIRAL_KEYWORDS_MAX) {
      showErrorToast(`A project can have at most ${VIRAL_KEYWORDS_MAX} keywords.`)
      return
    }
    onChange([...value, keyword])
    setText("")
  }

  return (
    <div className="grid gap-2">
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Keywords">
          {value.map((keyword) => (
            <li
              key={keyword}
              className="flex h-7 items-center gap-1 rounded-md border bg-muted/40 pl-2 text-sm"
            >
              {keyword}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${keyword}`}
                onClick={() => onChange(value.filter((one) => one !== keyword))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={id}
          value={text}
          maxLength={VIRAL_KEYWORD_MAX}
          placeholder={value.length ? "Add another" : "desk stretches"}
          aria-invalid={invalid || undefined}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault()
              add(text)
            }
          }}
          // A keyword typed and left behind counts, rather than vanishing.
          onBlur={() => add(text)}
        />
        <Button type="button" variant="outline" onClick={() => add(text)}>
          <PlusIcon />
          Add
        </Button>
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {value.length} of {VIRAL_KEYWORDS_MAX}
      </span>
    </div>
  )
}

/** The AI's keyword ideas as chips to tick into the list. */
export function KeywordIdeas({
  ideas,
  picked,
  onToggle,
}: {
  ideas: string[]
  picked: string[]
  onToggle: (idea: string) => void
}) {
  if (!ideas.length) return null
  const pickedKeys = new Set(picked.map((one) => one.toLowerCase()))
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Keyword ideas">
      {ideas.map((idea) => {
        const on = pickedKeys.has(idea.toLowerCase())
        return (
          <li key={idea}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={on}
              className={cn(on && "border-primary bg-primary/10")}
              onClick={() => onToggle(idea)}
            >
              {on ? null : <PlusIcon />}
              {idea}
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
