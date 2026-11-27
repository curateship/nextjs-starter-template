import { CheckIcon, XIcon } from "lucide-react"

import type { AiToolsAvailability } from "@/lib/api/video/ai-tools"
import { plural } from "@/lib/format/plural"
import { WRITERS } from "@/lib/video/ai-choices"
import {
  formatCheckCost,
  formatRunLength,
  SCRIPT_RULE_IDS,
  SCRIPT_RULE_TEXT,
  scriptCheckCostCents,
  scriptFigures,
  type ScriptCheck,
} from "@/lib/video/script-check"

/**
 * What the Voice window says about a script under the script box.
 *
 * The figures are sums, so they are always there and change as you type. The
 * price of a check sits with them, so it is read before "Check it" is pressed.
 * The checklist only appears once a check has come back.
 */
export function ScriptFigures({
  script,
  speed,
  available,
}: {
  script: string
  speed: number
  available: AiToolsAvailability | null
}) {
  const figures = scriptFigures(script, speed)
  const writer = WRITERS.find((one) => one.id === available?.writer)

  return (
    <div className="grid gap-1 text-sm text-muted-foreground tabular-nums">
      {figures.words ? (
        <>
          <p>
            {figures.words} {plural(figures.words, "word")}. At this
            speed that is about {figures.wordsPerMinute} words a minute, so
            about {formatRunLength(figures.seconds)} read aloud.
          </p>
          <p>
            At {figures.atPaces.map((one) => one.wordsPerMinute).join(", ")} a
            minute:{" "}
            {figures.atPaces
              .map((one) => formatRunLength(one.seconds))
              .join(", ")}
            .
          </p>
        </>
      ) : (
        <p>0 words.</p>
      )}
      {writer ? (
        <p>
          Checking it costs{" "}
          {formatCheckCost(scriptCheckCostCents(script.trim().length, writer.id))}{" "}
          with {writer.label}.
        </p>
      ) : available ? (
        <p>Checking it needs a Gemini, OpenAI or Anthropic key in Settings → AI.</p>
      ) : null}
    </div>
  )
}

export function ScriptCheckList({
  result,
  stale,
}: {
  result: ScriptCheck
  /** The script or the speed has changed since this check. */
  stale: boolean
}) {
  return (
    <div className="grid gap-2" aria-live="polite">
      {stale ? (
        <p className="text-sm text-muted-foreground">
          The script has changed since this check. Check it again to be sure.
        </p>
      ) : null}
      <ul className="grid gap-1.5 text-sm" aria-label="Script check">
        {SCRIPT_RULE_IDS.map((id) => {
          const rule = result[id]
          const text = SCRIPT_RULE_TEXT[id]
          return (
            <li key={id} className="flex gap-2">
              {rule.passed ? (
                <CheckIcon
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
              ) : (
                <XIcon
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                />
              )}
              <span className={rule.passed ? "text-muted-foreground" : undefined}>
                <span className="sr-only">
                  {rule.passed ? "Passed: " : "Failed: "}
                </span>
                {rule.passed ? text.passed : text.failed}
                {rule.words.length ? ": " : null}
                {rule.words.map((word, index) => (
                  <span key={word}>
                    {index ? ", " : null}
                    <mark className="rounded-sm bg-destructive/10 px-1 text-foreground">
                      {word}
                    </mark>
                  </span>
                ))}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
