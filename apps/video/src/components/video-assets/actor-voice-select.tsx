import * as React from "react"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { loadVoices } from "@/lib/api/video/ai-tools"
import type { Voice } from "@/lib/video/voice"

/** The Select's value for "no voice", since a Select item can't be empty. */
const NONE = "none"

/**
 * The voice an actor speaks in (actors.md): the same list the Voice window
 * offers, your own voices included, plus "No voice". `""` is no voice. A
 * saved voice that is no longer on the list (its key was removed) still
 * shows by its id, so opening the window never quietly changes it.
 */
export function ActorVoiceSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string
  value: string
  onChange: (voiceId: string) => void
  disabled?: boolean
}) {
  const [voices, setVoices] = React.useState<Voice[] | null>(null)
  const [refused, setRefused] = React.useState(false)

  React.useEffect(() => {
    let live = true
    loadVoices()
      .then((loaded) => live && setVoices(loaded))
      .catch(() => live && setRefused(true))
    return () => {
      live = false
    }
  }, [])

  const missing = value && voices && !voices.some((voice) => voice.id === value)

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Voice</Label>
      <Select
        value={value || NONE}
        onValueChange={(next) => onChange(next === NONE ? "" : next)}
        disabled={disabled || (!voices && !refused)}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={refused ? "No voices" : "Fetching voices…"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No voice</SelectItem>
          {missing ? <SelectItem value={value}>A voice no longer listed</SelectItem> : null}
          {(voices ?? []).map((voice) => (
            <SelectItem key={voice.id} value={voice.id}>
              {voice.name}
              {voice.yours ? " (yours)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {refused ? (
        <p className="text-sm text-muted-foreground">
          The voice list needs an ElevenLabs or OpenAI key in Settings → AI.
        </p>
      ) : null}
    </div>
  )
}
