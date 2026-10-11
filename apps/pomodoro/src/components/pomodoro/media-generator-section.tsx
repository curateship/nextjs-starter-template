import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  CopyPlusIcon,
  Layers2Icon,
  Loader2Icon,
  RotateCcwIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  GENERATION_PURPOSE,
  GENERATION_STYLES,
  PROMPT_MAX_LENGTH,
  PROMPT_MIN_LENGTH,
  type GenerationKind,
  type GenerationStyleKey,
} from "@/lib/pomodoro/generation"
import {
  addBackgroundToPersonalRoom,
  addSoundToPersonalRoom,
} from "@/lib/pomodoro/room-media-store"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  getGenerationErrorMessage,
  loadGenerationPanel,
  requestGeneration,
  type GenerationPanel,
} from "@/lib/api/pomodoro/generation"
import { BuyButton } from "@/components/pomodoro/buy-button"
import { SignInButton } from "@/components/pomodoro/sign-in-button"
import { buyPackLabel, PACK_FOR_KIND } from "@/lib/pomodoro/purchases"

/**
 * "Generate your own" — one card under the uploads on each picker page: a
 * "GENERATE YOUR OWN · PRO" heading with this month's count beside it, the
 * sentence that says what it does, the suggestions as pills, and the prompt
 * box with Generate along the card's foot. Drawn to Tyler's Sounds design of
 * 7 Oct 2026; the Theme page shares it. Ported from the old app's
 * CatalogPage generator.
 *
 * A finished generation becomes an ordinary upload, so it appears in the grid
 * above rather than here. What stays here is the record of what was asked for
 * and how it went, which is the only place a failed attempt can be seen.
 */

/** How often the panel re-reads while something is still being made. */
const POLL_MS = 5000

/** "Use the picture as a start" is off: the film comes from words alone. */
const FROM_WORDS = "words"

export function MediaGeneratorSection({
  kind,
  onFinished,
  seedPrompt = "",
}: {
  kind: GenerationKind
  /** A new file exists, so the picker above should fetch its list again. */
  onFinished: () => void
  /**
   * Words to start the box with: "Make a matching sound" on a finished
   * background lands here with the background's prompt (task 06, part 4).
   */
  seedPrompt?: string
}) {
  const copy = GENERATION_COPY[kind]
  const auth = useProductAuth()
  const signedIn = auth.known && auth.authenticated
  const navigate = useNavigate()

  const [panel, setPanel] = React.useState<GenerationPanel | null>(null)
  const [prompt, setPrompt] = React.useState(seedPrompt)
  const [style, setStyle] = React.useState<GenerationStyleKey | null>(null)
  const [picture, setPicture] = React.useState<string>(FROM_WORDS)
  const [look, setLook] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  // Set when Generate was pressed on a prompt under the minimum, and cleared
  // the moment the box changes.
  const [tooShort, setTooShort] = React.useState(false)
  const promptInput = React.useRef<HTMLInputElement>(null)

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
    if (text.length < PROMPT_MIN_LENGTH) {
      setTooShort(true)
      promptInput.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    // A picture that has left the list since it was chosen is not sent.
    const pictureMediaId =
      kind === "background" &&
      panel?.pictures.some((option) => option.mediaId === picture)
        ? picture
        : null
    const asLook = look && Boolean(panel?.lookReady)
    try {
      await requestGeneration({
        kind,
        prompt: text,
        style: kind === "background" ? style : null,
        pictureMediaId,
        look: asLook,
      })
      setPrompt("")
      setNotice(
        asLook
          ? "Queued. The background and the sound appear on their tabs as each is made, and the bell says when both are ready."
          : "Queued. It appears in the grid above when it is made."
      )
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
  const hasCredit = Boolean(panel && panel.left + panel.packLeft > 0)
  // A prompt that is too short does not shut the button: pressing it says what
  // is missing, which a grey button never did.
  const canSubmit = allowed && ready && hasCredit && !busy
  const editable = allowed && ready && !busy

  const blockedReason = !known
    ? null
    : !signedIn
      ? "Sign in on a Pro plan to make your own with AI."
      : !allowed
        ? "AI generation is a Pro perk. Upgrade to make your own."
        : !ready
          ? copy.notSwitchedOn
          : !hasCredit
            ? panel?.canBuy
              ? "You have used this month's AI generations. You get a fresh batch on the first, or buy more now."
              : "You have used this month's AI generations. You get a fresh batch on the first."
            : null

  const promptId = `generate-${kind}`
  const tooShortId = `${promptId}-too-short`

  function retry(text: string) {
    setPrompt(text)
    setTooShort(false)
    setNotice(null)
    promptInput.current?.focus()
  }

  // The other kind's generator, with this prompt in its box (part 4). It is
  // on the other tab of the same page; nothing is sent until Generate.
  const matchLabel =
    kind === "background" ? "Make a matching sound" : "Make a matching background"
  function match(text: string) {
    void navigate({
      to: "/uploads",
      search: {
        kind: GENERATION_PURPOSE[kind === "background" ? "soundscape" : "background"],
        prompt: text,
      },
    })
  }

  async function playBoth(pair: NonNullable<GenerationPanel["generations"][number]["look"]>) {
    try {
      await addBackgroundToPersonalRoom({
        type: "media",
        mediaId: pair.background.mediaId,
        mediaKind: "video",
        mediaUrl: pair.background.url,
      })
      await addSoundToPersonalRoom({
        type: "media",
        mediaId: pair.sound.mediaId,
        mediaUrl: pair.sound.url,
      })
      setNotice("Both are in your personal room now.")
    } catch (useError) {
      showErrorToast(getGenerationErrorMessage(useError))
    }
  }

  const headingId = `${promptId}-heading`

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col overflow-hidden rounded-[24px] border bg-[var(--p-surface)]"
    >
      <div className="flex min-h-48 flex-col gap-4 p-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h3
            id={headingId}
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/75"
          >
            {copy.title}{" "}
            <span className="ml-1 text-[var(--p-accent-2)]">Pro</span>
          </h3>
          {/* Only where there is an allowance to count. With none, the line
              below already says it is a Pro perk, and saying it twice reads
              like the page is nagging. */}
          {panel && panel.limit > 0 ? (
            <span className="font-mono text-xs text-muted-foreground">
              {describeCreditsLeft(panel.left, panel.limit, panel.packLeft)}
            </span>
          ) : null}
        </header>

        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/14 text-[var(--p-accent)]">
            <SparklesIcon className="size-4" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-3 pt-1">
            <p className="text-[15px]">{copy.description}</p>
            <div className="flex flex-wrap gap-2">
              {copy.suggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  type="button"
                  variant="outline"
                  disabled={!editable}
                  onClick={() => {
                    setPrompt(suggestion)
                    setTooShort(false)
                    promptInput.current?.focus()
                  }}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {kind === "background" ? (
          <div className="flex flex-col gap-2">
            <span id={`${promptId}-styles`} className="text-sm font-medium">
              Style
            </span>
            <div
              role="group"
              aria-labelledby={`${promptId}-styles`}
              className="flex flex-wrap gap-2"
            >
              {GENERATION_STYLES.map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  variant={style === option.key ? "default" : "outline"}
                  aria-pressed={style === option.key}
                  disabled={!editable}
                  onClick={() =>
                    setStyle((current) =>
                      current === option.key ? null : option.key
                    )
                  }
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {kind === "background" && panel?.pictures.length ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${promptId}-picture`}>Start from</Label>
            <Select value={picture} onValueChange={setPicture} disabled={!editable}>
              <SelectTrigger id={`${promptId}-picture`} className="w-fit max-w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FROM_WORDS}>Words only</SelectItem>
                {panel.pictures.map((option) => (
                  <SelectItem key={option.mediaId} value={option.mediaId}>
                    My picture: {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {panel?.lookReady ? (
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${promptId}-look`}
              checked={look}
              disabled={!editable}
              onCheckedChange={(checked) => setLook(checked === true)}
            />
            <Label htmlFor={`${promptId}-look`}>
              Background and sound, from one prompt. Uses one credit of each.
            </Label>
          </div>
        ) : null}

        {blockedReason && !error ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">{blockedReason}</p>
            {known && !signedIn ? <SignInButton /> : null}
            {panel && allowed && !hasCredit && panel.canBuy ? (
              <BuyButton
                product={PACK_FOR_KIND[kind]}
                page={GENERATION_PURPOSE[kind]}
                label={buyPackLabel(kind)}
              />
            ) : null}
          </div>
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
        {tooShort ? (
          <p id={tooShortId} role="alert" className="text-sm text-destructive">
            Describe it in a few more words.
          </p>
        ) : null}

        {panel && panel.generations.length ? (
          <ul className="flex flex-col gap-1">
            {panel.generations.map((row) => (
              <GenerationRowLine
                key={row.id}
                row={row}
                // Only while the box can take the words back; a box that is
                // shut would be filled with nowhere to send them.
                onRetry={editable ? () => retry(row.prompt) : undefined}
                matchLabel={matchLabel}
                onMatch={editable ? () => match(row.prompt) : undefined}
                onUseBoth={row.look ? () => void playBoth(row.look!) : undefined}
              />
            ))}
          </ul>
        ) : null}
      </div>

      {/* The prompt runs along the card's foot under a full-width divider,
          with no frame of its own, like the timer's add-task box. */}
      <form
        className="mt-auto flex items-center gap-3 border-t py-3 pl-3 pr-3"
        onSubmit={submit}
      >
        <Label htmlFor={promptId} className="sr-only">
          What should AI make?
        </Label>
        <Input
          ref={promptInput}
          id={promptId}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value)
            setTooShort(false)
          }}
          placeholder={copy.placeholder}
          maxLength={PROMPT_MAX_LENGTH}
          disabled={!editable}
          aria-invalid={tooShort || undefined}
          aria-describedby={tooShort ? tooShortId : undefined}
          className="h-9 flex-1 border-transparent bg-transparent text-[15px] shadow-none disabled:bg-transparent dark:bg-transparent dark:disabled:bg-transparent md:text-[15px]"
        />
        <SubmitButton
          canSubmit={canSubmit}
          busy={busy}
          reason={blockedReason}
        />
      </form>
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
    <Button type="submit" size="lg" disabled={!canSubmit} className="w-fit px-5">
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
  onRetry,
  matchLabel,
  onMatch,
  onUseBoth,
}: {
  row: GenerationPanel["generations"][number]
  /**
   * Puts this row's prompt back in the box: Try again on a failed row, Make
   * another on a finished one (task 06, part 1).
   */
  onRetry?: () => void
  matchLabel: string
  /** The other kind's generator with this prompt, on a finished row (part 4). */
  onMatch?: () => void
  /** Both halves of a finished look into the personal room (part 7). */
  onUseBoth?: () => void
}) {
  const failed = row.status === "failed"
  const ready = row.status === "ready"
  const working = row.status === "queued" || row.status === "running"
  const detail = [row.styleLabel, row.fromPicture ? "From my picture" : null, row.inLook ? "Background and sound" : null]
    .filter(Boolean)
    .join(" · ")

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {/* The prompt takes a line of its own on a phone, and the state and
          buttons wrap under it. */}
      <span className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-0">
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
        <span className="min-w-0 truncate" title={row.prompt}>
          {detail ? (
            <span className="text-muted-foreground">{detail} · </span>
          ) : null}
          {row.prompt}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-muted-foreground",
          failed && "text-destructive"
        )}
      >
        {failed
          ? (row.failureReason ?? STATUS_WORDS.failed)
          : ready
            ? "In the grid above"
            : row.status === "queued" && row.queuePlace
              ? row.queuePlace
              : (STATUS_WORDS[row.status] ?? row.status)}
      </span>
      {ready && onUseBoth ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="shrink-0"
          onClick={onUseBoth}
          aria-label={`Use both: ${row.prompt}`}
        >
          <Layers2Icon aria-hidden="true" />
          Use both
        </Button>
      ) : null}
      {ready && onMatch ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="shrink-0"
          onClick={onMatch}
          aria-label={`${matchLabel}: ${row.prompt}`}
        >
          <SparklesIcon aria-hidden="true" />
          {matchLabel}
        </Button>
      ) : null}
      {ready && onRetry ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="shrink-0"
          onClick={onRetry}
          aria-label={`Make another: ${row.prompt}`}
        >
          <CopyPlusIcon aria-hidden="true" />
          Make another
        </Button>
      ) : null}
      {failed && onRetry ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="shrink-0"
          onClick={onRetry}
          aria-label={`Try again: ${row.prompt}`}
        >
          <RotateCcwIcon aria-hidden="true" />
          Try again
        </Button>
      ) : null}
    </li>
  )
}
