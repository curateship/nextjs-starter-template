import * as React from "react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { CardGroup } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Textarea } from "@/components/ui/textarea"
import { describeAuthError } from "@/lib/api/error-message"
import {
  loadScriptBannedWords,
  saveBannedWords,
} from "@/lib/api/video/settings"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { parseBannedWords } from "@/lib/video/script-check"

/** How long after the last keystroke the list saves itself. */
const SAVE_AFTER_MS = 700

/**
 * The list as last read or saved, held for the life of the page, so coming
 * back to this tab draws at once instead of loading again. An edit goes in
 * before its save is sent, and comes back out if the save is refused.
 */
let held: string[] | null = null

function problemMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  return describeAuthError(message) ?? "The banned words could not be saved."
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((word, index) => word === b[index])
}

/**
 * Settings → Scripts: the words the Voice window's script check flags. One
 * list for the whole install. It saves itself as you type, with no button.
 */
export default function ScriptSettings() {
  const [text, setText] = React.useState(() => held?.join("\n") ?? "")
  const [ready, setReady] = React.useState(held !== null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [invalid, setInvalid] = React.useState(false)
  const setSaveStatus = useReportedSaveStatus()
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)

  React.useEffect(() => () => clearTimeout(timer.current), [])

  React.useEffect(() => {
    if (held) return
    let cancelled = false
    loadScriptBannedWords()
      .then((loaded) => {
        held = loaded
        if (cancelled) return
        setText(loaded.join("\n"))
        setReady(true)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(problemMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  // `value` rides in as an argument: the timer must save exactly what was
  // typed when it was set. Only leaving the field reports a problem, so a
  // half-typed word is never shouted about.
  async function save(value: string, sayProblem: boolean) {
    const { words, problem } = parseBannedWords(value)
    if (problem) {
      setInvalid(true)
      if (sayProblem) showErrorToast(problem)
      return
    }
    setInvalid(false)
    if (!held || sameList(words, held)) return
    const before = held
    held = words
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      held = await saveBannedWords(words)
      setSaveStatus("saved")
    } catch (error) {
      // What was typed stays in the box, so a refused save loses nothing.
      held = before
      setSaveStatus("idle")
      showErrorToast(problemMessage(error))
    }
  }

  const count = parseBannedWords(text).words.length

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="video-script-banned-words"
        title="Banned words"
        description="The Voice window's Check it flags any of these in a script, in any form: plurals, past tense and capitals count too."
      >
        {loadError ? (
          <ErrorRow
            message={loadError}
            onRetry={() => {
              setLoadError(null)
              setReloads((reload) => reload + 1)
            }}
          />
        ) : !ready ? (
          <LoadingRow label="Reading the banned words…" />
        ) : (
          <div className="grid gap-2">
            <FieldLabel
              htmlFor="script-banned-words"
              hint="One word or short phrase per line, or separated by commas. An empty list bans nothing."
            >
              Words to flag
            </FieldLabel>
            <Textarea
              id="script-banned-words"
              rows={8}
              value={text}
              aria-invalid={invalid || undefined}
              placeholder="delve"
              onChange={(event) => {
                const next = event.target.value
                setText(next)
                clearTimeout(timer.current)
                timer.current = setTimeout(
                  () => void save(next, false),
                  SAVE_AFTER_MS
                )
              }}
              onBlur={() => {
                clearTimeout(timer.current)
                const { words, problem } = parseBannedWords(text)
                // Leaving the box tidies it to the list that was saved.
                if (!problem) setText(words.join("\n"))
                void save(text, true)
              }}
            />
            <p className="text-sm text-muted-foreground">
              {count} {plural(count, "word")} on the list.
            </p>
          </div>
        )}
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}
