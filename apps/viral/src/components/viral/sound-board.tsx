import { MusicIcon } from "lucide-react"

import { focusRing } from "@/lib/layout/focus-ring"
import { plural } from "@/lib/format/plural"
import { cn } from "@/lib/utils"
import type { TrendingSound } from "@/lib/viral/sounds"

/**
 * The Sounds tab's list: one row per sound, most winners first. Picking one
 * keeps the list to the videos that use it (`workspace/docs/finding-content.md`).
 */
export function SoundBoard({ sounds, onPick }: { sounds: TrendingSound[]; onPick: (key: string) => void }) {
  return (
    <ul aria-label="Sounds" className="grid gap-0.5 p-2">
      {sounds.map((entry) => (
        <li key={entry.key}>
          <button
            type="button"
            onClick={() => onPick(entry.key)}
            className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/60", focusRing)}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted">
              <MusicIcon className="size-4 text-muted-foreground" />
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate text-sm font-medium">{entry.sound.name}</span>
              <span className="truncate text-xs text-muted-foreground">{entry.sound.artist ?? "Unknown maker"}</span>
            </span>
            <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
              <span className="block font-medium text-foreground">
                {entry.winners} {plural(entry.winners, "winner")}
              </span>
              {entry.videos} {plural(entry.videos, "video")}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
