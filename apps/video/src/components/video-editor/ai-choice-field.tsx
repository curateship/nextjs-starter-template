import * as React from "react"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  rememberAiChoice,
  type AiToolsAvailability,
} from "@/lib/api/video/ai-tools"
import { showErrorToast } from "@/lib/toast/error-toast"
import { TRANSCRIBERS, WRITERS } from "@/lib/video/ai-choices"

/**
 * Which AI does this job.
 *
 * Choosing is answering, not confirming: the choice is saved the moment it is
 * made, so the next window opens on it and nobody is asked twice. Only the
 * ones whose key is saved are offered — a choice that cannot run is not a
 * choice.
 */
export function AiChoiceField({
  kind,
  available,
  onChanged,
}: {
  kind: "transcriber" | "writer"
  available: AiToolsAvailability | null
  /** So the window can show what it is about to use. */
  onChanged?: (id: string) => void
}) {
  const options = (kind === "transcriber" ? TRANSCRIBERS : WRITERS).filter(
    (option) =>
      option.id === "openai" ? available?.openai : available?.words
  )
  const chosen =
    (kind === "transcriber" ? available?.transcriber : available?.writer) ?? ""
  const [value, setValue] = React.useState(chosen)

  // The window may open before the answer about keys has come back.
  const [lastChosen, setLastChosen] = React.useState(chosen)
  if (lastChosen !== chosen) {
    setLastChosen(chosen)
    setValue(chosen)
  }

  // One option is not a choice; saying so beats a dropdown that cannot move.
  if (options.length < 2) return null

  async function choose(next: string) {
    setValue(next)
    onChanged?.(next)
    try {
      await rememberAiChoice(
        kind === "transcriber"
          ? { transcriber: next as "openai" | "gemini" }
          : { writer: next as "openai" | "gemini" }
      )
    } catch (error) {
      showErrorToast(
        error instanceof Error ? error.message : "That choice was not saved"
      )
    }
  }

  const id = `ai-choice-${kind}`
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {kind === "transcriber" ? "Who writes it down" : "Who rewrites it"}
      </Label>
      <Select value={value} onValueChange={(next) => void choose(next)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label} — {option.note}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">
        Chosen once. Every tool that does this job uses it from now on.
      </p>
    </div>
  )
}
