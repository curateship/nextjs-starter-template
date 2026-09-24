import * as React from "react"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AI_PROVIDER_NAMES } from "@/lib/ai/ai-models"
import {
  rememberAiChoice,
  type AiToolsAvailability,
} from "@/lib/api/video/ai-tools"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  canUseChoice,
  TRANSCRIBERS,
  WRITERS,
  type AiChoice,
  type AiKeysSaved,
  type TranscriberId,
  type WriterId,
} from "@/lib/video/ai-choices"

/**
 * Which AI does this job.
 *
 * Choosing is answering, not confirming: the choice is saved the moment it is
 * made, so the next window opens on it and nobody is asked twice. Every choice
 * is listed; one whose key is not saved is shown greyed out with where to add
 * the key, because a choice nobody knows about is one nobody can make.
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
  const keys: AiKeysSaved = {
    gemini: !!available?.words,
    openai: !!available?.openai,
    anthropic: !!available?.anthropic,
  }
  const options: readonly AiChoice[] =
    kind === "transcriber" ? TRANSCRIBERS : WRITERS
  const chosen =
    (kind === "transcriber" ? available?.transcriber : available?.writer) ?? ""
  const saved =
    kind === "transcriber"
      ? available?.defaults.transcriber
      : available?.defaults.writer
  const [value, setValue] = React.useState(chosen)
  // What was picked in this window. The saved choice that came with the
  // window is out of date the moment something else is picked.
  const [picked, setPicked] = React.useState<string | undefined>()

  // The window may open before the answer about keys has come back.
  const [lastChosen, setLastChosen] = React.useState(chosen)
  if (lastChosen !== chosen) {
    setLastChosen(chosen)
    setValue(chosen)
    setPicked(undefined)
  }

  // Nothing can run, so there is nothing to choose between. The tool itself
  // says which key to add when it is pressed.
  if (!options.some((option) => canUseChoice(option, keys))) return null

  // A saved choice whose key has since gone. The tool quietly uses another,
  // and this says which, so nobody is surprised by the voice that answers.
  const savedOption = options.find((option) => option.id === (picked ?? saved))
  const lost =
    savedOption && !canUseChoice(savedOption, keys) ? savedOption : undefined
  const using = options.find((option) => option.id === value)

  async function choose(next: string) {
    setValue(next)
    setPicked(next)
    onChanged?.(next)
    try {
      await rememberAiChoice(
        kind === "transcriber"
          ? { transcriber: next as TranscriberId }
          : { writer: next as WriterId }
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
          {options.map((option) => {
            const usable = canUseChoice(option, keys)
            return (
              <SelectItem key={option.id} value={option.id} disabled={!usable}>
                {option.label} —{" "}
                {usable ? option.note : missingKeyNote(option.provider)}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">
        {lost && using
          ? `${lost.label} was chosen, but no ${AI_PROVIDER_NAMES[lost.provider]} key is saved any more, so ${using.label} is doing it. Add the key in Settings → AI to switch back.`
          : "Chosen once. Every tool that does this job uses it from now on."}
      </p>
    </div>
  )
}

function missingKeyNote(provider: keyof AiKeysSaved) {
  const name = AI_PROVIDER_NAMES[provider]
  const article = /^[AEIOU]/.test(name) ? "an" : "a"
  return `Needs ${article} ${name} key. Add one in Settings → AI.`
}
