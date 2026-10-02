import { ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  FEEDBACK_TAGS,
  MAX_FEEDBACK_TAGS,
  feedbackTagLabels,
  type FeedbackTag,
} from "@/lib/feedback/feedback-tags"
import { cn } from "@/lib/utils"

/**
 * The tag picker both the composer and the admin editor use: one dropdown of
 * tick-boxes that stays open while several are picked. The three-tag cap lives
 * here so every picker enforces it the same way — a fourth tick gets a toast
 * saying the rule, never a greyed-out row.
 */
export function FeedbackTagsSelect({
  value,
  onChange,
  disabled = false,
  size = "default",
  className,
}: {
  value: FeedbackTag[]
  onChange: (next: FeedbackTag[]) => void
  disabled?: boolean
  /** "sm" sits level with the composer's compact type chips. */
  size?: "default" | "sm"
  className?: string
}) {
  const toggle = (tag: FeedbackTag) => {
    if (value.includes(tag)) {
      onChange(value.filter((existing) => existing !== tag))
      return
    }
    if (value.length >= MAX_FEEDBACK_TAGS) {
      showErrorToast(`Pick up to ${MAX_FEEDBACK_TAGS} tags.`)
      return
    }
    onChange([...value, tag])
  }

  const label = value.length
    ? value.map((tag) => feedbackTagLabels[tag]).join(", ")
    : "Tags"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size}
          disabled={disabled}
          aria-label="Feedback tags"
          className={cn(
            "font-normal",
            !value.length && "text-muted-foreground",
            className
          )}
        >
          <span className="max-w-56 truncate">{label}</span>
          <ChevronDownIcon className="size-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {FEEDBACK_TAGS.map((tag) => (
          <DropdownMenuCheckboxItem
            key={tag}
            checked={value.includes(tag)}
            // Kept open on purpose: picking two or three tags should not mean
            // reopening the menu between each one.
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => toggle(tag)}
          >
            {feedbackTagLabels[tag]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
