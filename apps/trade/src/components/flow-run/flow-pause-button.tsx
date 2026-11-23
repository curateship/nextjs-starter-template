import { PauseIcon, PlayIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function FlowPauseButton({
  paused,
  busy,
  onClick,
  className,
}: {
  paused: boolean
  busy: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={busy}
      onClick={onClick}
      className={className}
    >
      {paused ? (
        <PlayIcon className="size-4" />
      ) : (
        <PauseIcon className="size-4" />
      )}
      {paused ? "Resume" : "Pause"}
    </Button>
  )
}
