import { PlayIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CHIMES, findChime, type ChimeId } from "@/lib/pomodoro/chimes"
import { previewChime } from "@/lib/pomodoro/completion-alerts"

const MOMENTS = [
  { moment: "focus", label: "When a focus ends" },
  { moment: "break", label: "When a break ends" },
] as const

/**
 * The two chime pickers under Completion alerts: one for a focus ending, one
 * for a break ending, each with Preview. Preview plays with alerts off and no
 * timer running, because the press itself is what lets the browser play.
 */
export function CompletionChimeFields({
  focusChime,
  breakChime,
  alertsOn,
  onChange,
}: {
  focusChime: ChimeId
  breakChime: ChimeId
  alertsOn: boolean
  onChange: (moment: "focus" | "break", chime: ChimeId) => void
}) {
  return (
    <div className="grid gap-3">
      {MOMENTS.map(({ moment, label }) => {
        const chosen = moment === "focus" ? focusChime : breakChime
        const id = `completion-chime-${moment}`
        return (
          <div key={moment} className="grid gap-2">
            <Label htmlFor={id}>{label}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={chosen}
                onValueChange={(value) => onChange(moment, value as ChimeId)}
              >
                <SelectTrigger id={id} className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHIMES.map((chime) => (
                    <SelectItem key={chime.id} value={chime.id}>
                      {chime.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {chosen === "none" ? null : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => previewChime(chosen)}
                  aria-label={`Preview the chime ${label.toLowerCase()}`}
                >
                  <PlayIcon aria-hidden="true" />
                  Preview
                </Button>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {findChime(chosen).hint}
            </span>
          </div>
        )
      })}
      {alertsOn ? null : (
        <span className="text-xs text-muted-foreground">
          These play once Completion alerts is ticked.
        </span>
      )}
    </div>
  )
}
