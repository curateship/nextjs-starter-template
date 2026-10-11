import type { SaveState } from "@/lib/project/use-save-line"
import { cn } from "@/lib/utils"

const WORDS: Record<NonNullable<SaveState>, string> = {
  saving: "Saving…",
  saved: "Saved",
  failed: "Not saved",
}

export function SaveLine({ state, className }: { state: SaveState; className?: string }) {
  return (
    <span
      aria-live="polite"
      className={cn(
        "text-xs font-normal text-muted-foreground",
        state === "failed" && "text-destructive",
        className
      )}
    >
      {state ? WORDS[state] : null}
    </span>
  )
}
