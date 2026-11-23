import { WifiOffIcon } from "lucide-react"

/** The line along the top of a Travel page with no signal. */
export function NoSignalLine() {
  return (
    <p role="status" className="flex items-center gap-2 border-b bg-muted px-3 py-1.5 text-xs text-muted-foreground">
      <WifiOffIcon className="size-3.5 shrink-0" aria-hidden />
      No signal. This is the copy from your last visit, and changes are off until you're back online.
    </p>
  )
}
