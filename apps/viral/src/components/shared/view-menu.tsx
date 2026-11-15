import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type ViewChoice = {
  value: string
  label: string
  /** How many rows are behind the choice, drawn muted after the word. */
  count?: number
}

/**
 * Which part of a tab's list shows: Inbox's All, Unread, Saved, Waiting;
 * People's All, Leads, Subscribers, Opted out and the saved segments;
 * Broadcasts' Drafts, Scheduled, Sent, Templates.
 *
 * A dropdown in the middle header, between Filter and the New button, never a
 * second row under it (Tyler, 7 Nov 2026: "We dont need a second subnav. Just
 * put it as a dropdown filter here"). The button names the choice showing and
 * its count; the list holds every choice with its count, the one showing
 * ticked. In a narrow panel the button keeps its word and drops the count.
 */
export function ViewMenu({
  value,
  onValueChange,
  choices,
  label,
  fallback = "Filtered",
}: {
  value: string
  onValueChange: (value: string) => void
  choices: ViewChoice[]
  /** What it picks, read out: "Which conversations". */
  label: string
  /** The button's word when no choice matches, as when Filter's rules match none. */
  fallback?: string
}) {
  const shown = choices.find((choice) => choice.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" aria-label={`${label}: ${shown?.label ?? fallback}`} className="max-w-48 gap-1.5">
          <span className="truncate">{shown?.label ?? fallback}</span>
          {shown?.count !== undefined ? (
            <span className="text-muted-foreground tabular-nums @max-3xl:hidden">{shown.count.toLocaleString()}</span>
          ) : null}
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[min(60vh,24rem)] min-w-48">
        {choices.map((choice) => (
          <DropdownMenuItem key={choice.value} onSelect={() => onValueChange(choice.value)}>
            <span className="min-w-0 flex-1 truncate">{choice.label}</span>
            {choice.count !== undefined ? (
              <span className="text-xs text-muted-foreground tabular-nums">{choice.count.toLocaleString()}</span>
            ) : null}
            <CheckIcon className={choice.value === value ? "size-4" : "size-4 opacity-0"} aria-hidden />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
