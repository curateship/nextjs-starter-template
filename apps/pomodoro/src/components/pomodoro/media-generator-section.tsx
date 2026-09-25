import * as React from "react"
import { Loader2Icon, SparklesIcon, TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import {
  describeCreditsLeft,
  GENERATION_COPY,
  PROMPT_MAX_LENGTH,
  PROMPT_MIN_LENGTH,
  type GenerationKind,
} from "@/lib/pomodoro/generation"
import {
  getGenerationErrorMessage,
  loadGenerationPanel,
  requestGeneration,
  type GenerationPanel,
} from "@/lib/api/pomodoro/generation"

/**
 * "Generate your own" — the prompt box, the suggestions and this month's
 * counter, under the uploads on each picker page. Ported from the old app's
 * CatalogPage generator.
 *
 * A finished generation becomes an ordinary upload, so it appears in the grid
 * above rather than here. What stays here is the record of what was asked for
 * and how it went, which is the only place a failed attempt can be seen.
 */

/** How often the panel re-reads while something is still being made. */
const POLL_MS = 5000

export function MediaGeneratorSection({
  kind,
  onFinished,
}: {
  kind: GenerationKind
  /** A new file exists, so the picker above should fetch its list again. */
  onFinished: () => void
}) {
  const copy = GENERATION_COPY[kind]
  const auth = useProductAuth()
  const signedIn = auth.known && auth.authenticated

  const [panel, setPanel] = React.useState<GenerationPanel | null>(null)
  const [prompt, setPrompt] = React.useState("")
  const [notice, setNotice] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  // A generation that has just finished is a new file in the picker above, so
  // the page it sits on has to be told. Held in a ref rather than state: it is
  // only ever compared against the next read.
  const readyCount = React.useRef<number | null>(null)

  const refresh = React.useCallback(() => {
    if (!signedIn) return Promise.resolve()
    return loadGenerationPanel(kind)
      .then((next) => {
        setPanel(next)
        setError(null)
        const ready = next.generations.filter(
          (row) => row.status === "ready"
        ).length
        if (readyCount.current !== null && ready > readyCount.current) {
          onFinished()
        }
        readyCount.current = ready
      })
      .catch((loadError: unknown) => {
        setError(getGenerationErrorMessage(loadError))
      })
  }, [kind, onFinished, signedIn])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const waiting = (panel?.generations ?? []).some(
    (row) => row.status === "queued" || row.status === "running"
  )
  React.useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh, waiting])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const text = prompt.trim()
    if (text.length < PROMPT_MIN_LENGTH) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await requestGeneration(kind, text)
      setPrompt("")
      setNotice("Queued. It appears in the grid above when it is made.")
      await refresh()
    } catch (requestError) {
      setError(getGenerationErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  // Everything is shut until the server has answered. Treating an unknown
  // answer as allowed is how the uploads strip let a free account open a file
  // picker it should never have seen.
  const known = panel !== null || (auth.known && !auth.authenticated)
  const allowed = Boolean(panel && panel.limit > 0)
  const ready = Boolean(panel?.providerReady)
  const hasCredit = Boolean(panel && panel.left > 0)
  const canSubmit =
    allowed &&
    ready &&
    hasCredit &&
    !busy &&
    prompt.trim().length >= PROMPT_MIN_LENGTH

  const blockedReason = !known
    ? null
    : !signedIn
      ? "Sign in on a Pro plan to make your own with AI."
      : !allowed
        ? "AI generation is a Pro perk. Upgrade to make your own."
        : !ready
          ? "AI generation is not set up on this server yet. An operator needs to add the provider key under Settings → AI."
          : !hasCredit
            ? "You have used this month's AI generations. You get a fresh batch on the first."
            : null

  const promptId = `generate-${kind}`

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-start gap-2">
          <SparklesIcon
            className="mt-1 size-5 text-[var(--p-accent)]"
            aria-hidden="true"
          />
          <div>
            <h3 className="text-lg font-semibold tracking-tight">
              {copy.title}
            </h3>
            <p className="text-sm text-muted-foreground">{copy.description}</p>
          </div>
        </div>
        <small className="font-mono text-[10px] tracking-widest text-[var(--p-accent-2)] uppercase">
          Pro
        </small>
      </header>

      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
        <Label htmlFor={promptId} className="sr-only">
          What should AI make?
        </Label>
        <Input
          id={promptId}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={copy.placeholder}
          maxLength={PROMPT_MAX_LENGTH}
          disabled={!allowed || !ready || busy}
          className="flex-1"
        />
        <SubmitButton
          canSubmit={canSubmit}
          busy={busy}
          reason={blockedReason}
        />
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
          Try
        </span>
        {copy.suggestions.map((suggestion) => (
          <Button
            key={suggestion}
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            disabled={!allowed || !ready || busy}
            onClick={() => setPrompt(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </div>

      {/* Only where there is an allowance to count. With none, the line under
          the button already says it is a Pro perk, and saying it twice reads
          like the page is nagging. */}
      {panel && panel.limit > 0 ? (
        <p className="text-xs text-muted-foreground">
          {describeCreditsLeft(panel.left, panel.limit)}
        </p>
      ) : null}

      {blockedReason && !error ? (
        <p className="text-sm text-muted-foreground">{blockedReason}</p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {panel && panel.generations.length ? (
        <ul className="flex flex-col gap-1">
          {panel.generations.map((row) => (
            <GenerationRowLine key={row.id} row={row} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/** Never a dead button: a shut one says why through the shared tooltip. */
function SubmitButton({
  canSubmit,
  busy,
  reason,
}: {
  canSubmit: boolean
  busy: boolean
  reason: string | null
}) {
  const button = (
    <Button type="submit" disabled={!canSubmit} className="w-fit">
      {busy ? (
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <SparklesIcon className="size-4" aria-hidden="true" />
      )}
      Generate
    </Button>
  )

  if (!reason) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{button}</span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  )
}

const STATUS_WORDS: Record<string, string> = {
  queued: "Waiting its turn",
  running: "Making it…",
  ready: "Done",
  failed: "Did not work",
}

/**
 * One request, and how it went. A finished one says where it went rather than
 * repeating the file, which is already a card in the grid above.
 */
function GenerationRowLine({
  row,
}: {
  row: GenerationPanel["generations"][number]
}) {
  const failed = row.status === "failed"
  const working = row.status === "queued" || row.status === "running"

  return (
    <li className="flex items-center gap-2 text-xs">
      {working ? (
        <Loader2Icon
          className="size-3 shrink-0 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      ) : failed ? (
        <TriangleAlertIcon
          className="size-3 shrink-0 text-destructive"
          aria-hidden="true"
        />
      ) : (
        <SparklesIcon
          className="size-3 shrink-0 text-[var(--p-accent)]"
          aria-hidden="true"
        />
      )}
      <span className="min-w-0 flex-1 truncate" title={row.prompt}>
        {row.prompt}
      </span>
      <span
        className={cn(
          "shrink-0 text-muted-foreground",
          failed && "text-destructive"
        )}
      >
        {failed
          ? (row.failureReason ?? STATUS_WORDS.failed)
          : row.status === "ready"
            ? "In the grid above"
            : (STATUS_WORDS[row.status] ?? row.status)}
      </span>
    </li>
  )
}
