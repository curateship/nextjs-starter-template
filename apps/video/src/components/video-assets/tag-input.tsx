import * as React from "react"
import { XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { showErrorToast } from "@/lib/toast/error-toast"
import { MAX_ASSET_TAGS, normalizeAssetTags } from "@/lib/video/asset-factories"
import { cn } from "@/lib/utils"

/**
 * Tags as pills inside one box the height of an input. Enter or a comma
 * turns what was typed into a pill, the x on a pill removes it, and
 * Backspace in an empty box removes the last one. Leaving the box keeps
 * whatever was typed, so pressing Save never loses a half-typed tag. Tags are
 * lowercased and kept once each, the same as the server stores them.
 */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [draft, setDraft] = React.useState("")

  function commit(text: string) {
    const added = normalizeAssetTags(text).filter((tag) => !value.includes(tag))
    // Over the limit the typed words stay in the box rather than vanish.
    if (value.length + added.length > MAX_ASSET_TAGS) {
      showErrorToast(`Up to ${MAX_ASSET_TAGS} tags.`)
      return
    }
    setDraft("")
    if (added.length) onChange([...value, ...added])
  }

  return (
    <div
      className={cn(
        "flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input px-1.5 py-[3px] transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        disabled && "pointer-events-none opacity-50"
      )}
    >
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="h-6 pr-1">
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            disabled={disabled}
            className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={() => onChange(value.filter((other) => other !== tag))}
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        value={draft}
        disabled={disabled}
        placeholder={value.length ? undefined : placeholder}
        className="h-6 min-w-24 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        onChange={(event) => {
          // A comma ends a tag, and a pasted "host, casual" makes two.
          if (event.target.value.includes(",")) commit(event.target.value)
          else setDraft(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit(draft)
          } else if (event.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => commit(draft)}
      />
    </div>
  )
}
