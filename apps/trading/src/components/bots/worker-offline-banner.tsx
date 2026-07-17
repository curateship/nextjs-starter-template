import { cn } from "@/lib/utils"

/**
 * The one "bot worker is offline" notice, shared by the fleet page (card
 * shape) and the bot workspace (slim strip under the header) via className.
 */
export function WorkerOfflineBanner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "border-destructive/30 bg-destructive/10 text-destructive",
        className
      )}
    >
      Bot worker is offline — commands will queue until it reconnects. Start it
      with <code>npm run bot-worker:dev</code>.
    </div>
  )
}
