import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { CardDropdownTitle } from "@/components/project/card-dropdown"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { saveProjectHealth, type ProjectHealthView } from "@/lib/api/project/projects"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import {
  LIMITS,
  PROJECT_HEALTHS,
  PROJECT_HEALTH_LABEL,
  type ProjectHealth,
} from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const HEALTH_DOT: Record<ProjectHealth, string> = {
  on_track: "bg-green-600",
  at_risk: "bg-amber-500",
  off_track: "bg-red-500",
}

/** The status's dot and its word, never the colour alone. */
export function HealthMark({ health, className }: { health: ProjectHealth; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-medium", className)}>
      <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", HEALTH_DOT[health])} />
      {PROJECT_HEALTH_LABEL[health]}
    </span>
  )
}

/**
 * "Set by Priya, 2 days ago". The date always shows, because a status
 * nobody has touched for weeks shouldn't read as today's news.
 */
export function HealthSetBy({ health, className }: { health: ProjectHealthView; className?: string }) {
  const ago = formatTimeAgo(health.at)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={health.at} className={cn("text-xs text-muted-foreground", className)}>
          Set by {health.byName}, {ago === "Just now" ? "just now" : ago}
        </time>
      </TooltipTrigger>
      <TooltipContent>{formatDateTime(health.at)}</TooltipContent>
    </Tooltip>
  )
}

const NONE = "none"

/**
 * Sets the project's status: On track, At risk or Off track, with a line of
 * why, or no status at all. At risk and Off track need the line. It sits in
 * the Status card's dropdown.
 */
export function HealthForm({
  projectId,
  health,
  onDone,
}: {
  projectId: string
  health: ProjectHealthView | null
  onDone: () => void
}) {
  const router = useRouter()
  const [value, setValue] = React.useState<ProjectHealth | typeof NONE>(health?.value ?? NONE)
  const [note, setNote] = React.useState(health?.note ?? "")
  const [invalid, setInvalid] = React.useState(false)
  const [run, saving] = useAsyncAction(getProjectErrorMessage)
  const needsNote = value === "at_risk" || value === "off_track"

  async function save() {
    if (needsNote && !note.trim()) {
      setInvalid(true)
      showErrorToast("Say in a line why the project is at risk or off track.")
      return
    }
    const ok = await run(
      () => saveProjectHealth({ projectId, health: value === NONE ? null : value, note: note.trim() }),
      value === NONE ? "Status taken off." : "Status saved."
    )
    if (!ok) return
    await router.invalidate()
    onDone()
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <CardDropdownTitle>Project status</CardDropdownTitle>
      <div className="grid gap-2">
        <Label htmlFor="project-health">Status</Label>
        <Select
          value={value}
          onValueChange={(next) => {
            setValue(next as ProjectHealth | typeof NONE)
            setInvalid(false)
          }}
        >
          <SelectTrigger id="project-health" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No status</SelectItem>
            {PROJECT_HEALTHS.map((option) => (
              <SelectItem key={option} value={option}>
                <HealthMark health={option} className="font-normal" />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {value === NONE ? null : (
        <div className="grid gap-2">
          <Label htmlFor="project-health-note">{needsNote ? "Why" : "Why (optional)"}</Label>
          <Textarea
            id="project-health-note"
            value={note}
            maxLength={LIMITS.healthNote}
            placeholder={needsNote ? "Client hasn't sent the photos" : "Design signed off early"}
            aria-invalid={invalid || undefined}
            onChange={(event) => {
              setNote(event.target.value)
              setInvalid(false)
            }}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Everyone on the project sees it, with your name and when you set it. At risk, Off track and
        coming back from them also reach their bell.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Save
        </Button>
      </div>
    </form>
  )
}
