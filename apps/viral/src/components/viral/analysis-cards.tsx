import * as React from "react"
import { BookmarkPlusIcon, CheckIcon, CopyIcon, EyeIcon, Loader2Icon, PencilIcon, Undo2Icon } from "lucide-react"

import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { saveFormatFn } from "@/lib/api/viral/viral-library"
import { showErrorToast } from "@/lib/toast/error-toast"
import { scriptText, type AnalysisPieces } from "@/lib/viral/analysis"
import { formatFromAnalysis, partsName } from "@/lib/viral/formats"
import { segmentRoleLabels } from "@/lib/viral/viral-breakdown"

/**
 * The four things Analyse with AI writes (Tyler, 4 Nov 2026: "Why it works",
 * "Script for my topic", "3 to 5 more ideas", "Title + hashtags"), each a
 * folding `PanelCard` with its own Copy. The right panel and a vault
 * item both draw them, so a saved idea reads exactly as it did when it was
 * written. Save format under the script keeps its structure for Library →
 * Formats (task part 18).
 *
 * A piece with nothing in it is left out: your own idea has a script and no
 * other piece. On a vault idea `scriptEdit` puts a pencil in the Script
 * card's header (more-features task part 4).
 */
export function AnalysisCards({
  pieces,
  topic,
  sourceTitle = null,
  scriptEdit,
}: {
  pieces: AnalysisPieces
  topic: string
  /** The video it was written about, kept with a saved format. */
  sourceTitle?: string | null
  /** A vault idea's own version of the script, and where an edit saves. Absent where nothing can be edited. */
  scriptEdit?: ScriptEdit
}) {
  const { whyItWorks, ideas, title } = pieces
  const hasWhy = Boolean(whyItWorks.hook || whyItWorks.parts.length || whyItWorks.whySpread)
  const hasTitle = Boolean(title.title || title.caption || title.hashtags.length)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      {hasWhy ? (
      <PanelCard storageId="viral-analysis-why" title="Why it works">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 text-sm break-words">
          <p>
            <span className="font-medium">The hook. </span>
            {whyItWorks.hook}
          </p>
          <ol className="grid gap-1.5">
            {whyItWorks.parts.map((part, index) => (
              <li key={index}>
                <span className="font-medium">{segmentRoleLabels[part.role]}. </span>
                {part.summary}
              </li>
            ))}
          </ol>
          <p>
            <span className="font-medium">Why it spread. </span>
            {whyItWorks.whySpread}
          </p>
          <CopyButton
            label="Copy" name="Copy why it works"
            text={[
              `Hook: ${whyItWorks.hook}`,
              ...whyItWorks.parts.map((part) => `${segmentRoleLabels[part.role]}: ${part.summary}`),
              `Why it spread: ${whyItWorks.whySpread}`,
            ].join("\n")}
          />
        </div>
      </PanelCard>
      ) : null}

      <ScriptCard pieces={pieces} topic={topic} sourceTitle={sourceTitle} edit={scriptEdit} />

      {ideas.length ? (
      <PanelCard storageId="viral-analysis-ideas" title="More ideas" meta={`${ideas.length} in the same style`}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 text-sm break-words">
          <ol className="grid gap-2">
            {ideas.map((one, index) => (
              <li key={index} className="grid gap-0.5">
                <span className="font-medium">{one.idea}</span>
                <span className="text-muted-foreground">Hook: {one.hook}</span>
              </li>
            ))}
          </ol>
          <CopyButton
            label="Copy" name="Copy the ideas"
            text={ideas.map((one, index) => `${index + 1}. ${one.idea}\n   Hook: ${one.hook}`).join("\n")}
          />
        </div>
      </PanelCard>
      ) : null}

      {hasTitle ? (
      <PanelCard storageId="viral-analysis-title" title="Title and hashtags">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 text-sm break-words">
          <p className="font-medium">{title.title}</p>
          <p className="whitespace-pre-wrap">{title.caption}</p>
          <p className="text-muted-foreground">{title.hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ")}</p>
          <CopyButton
            label="Copy" name="Copy title and hashtags"
            text={[title.title, title.caption, title.hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ")].join("\n\n")}
          />
        </div>
      </PanelCard>
      ) : null}
    </div>
  )
}

type Script = AnalysisPieces["script"]

export type ScriptEdit = {
  /** Your version, or null while the AI's stands. */
  edited: Script | null
  /** Saves your words for each part in order; null goes back to the AI's. Resolves false when refused. */
  onSave: (words: string[] | null) => Promise<boolean>
}

/** A pause in typing this long saves the script, as the notes do (UI standard, "Settings"). */
const TYPING_SAVE_MS = 700

/**
 * The Script card. Tyler, 6 Nov 2026: "Keep it, Show original". On a vault
 * idea the pencil in its header turns each part into a box, its label and
 * seconds kept, and the words save themselves after typing. Your version is
 * what Copy, Send to Video and Post for Promo use. The AI's stays as it was:
 * Show original puts it on screen, and Go back to the AI's version throws
 * your edit away after asking.
 */
function ScriptCard({
  pieces,
  topic,
  sourceTitle,
  edit,
}: {
  pieces: AnalysisPieces
  topic: string
  sourceTitle: string | null
  edit?: ScriptEdit
}) {
  const original = pieces.script
  const edited = edit?.edited ?? null
  const [editing, setEditing] = React.useState(false)
  const [showOriginal, setShowOriginal] = React.useState(false)
  const [reverting, setReverting] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const shown = showOriginal || !edited ? original : edited

  const [draft, setDraft] = React.useState<string[]>([])
  const timer = React.useRef(0)
  const pending = React.useRef<string[] | null>(null)
  const saveRef = React.useRef(edit?.onSave)
  React.useEffect(() => {
    saveRef.current = edit?.onSave
  })

  // One save at a time, in the order they were made, so an older save can
  // never land after a newer one, and Go back always lands last.
  const saving = React.useRef<Promise<boolean>>(Promise.resolve(true))
  const queueSave = React.useCallback((words: string[] | null) => {
    const next = saving.current.then(async () => (await saveRef.current?.(words)) ?? false)
    saving.current = next.catch(() => false)
    return next
  }, [])

  const flush = React.useCallback(() => {
    window.clearTimeout(timer.current)
    const words = pending.current
    pending.current = null
    if (words) void queueSave(words)
  }, [queueSave])
  // Closing the idea, or another opening, saves what was typed.
  React.useEffect(() => flush, [flush])

  function startEditing() {
    setDraft((edited ?? original).map((part) => part.words))
    setShowOriginal(false)
    setEditing(true)
  }

  function stopEditing() {
    flush()
    setEditing(false)
  }

  function type(index: number, words: string) {
    const next = draft.map((one, at) => (at === index ? words : one))
    setDraft(next)
    pending.current = next
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, TYPING_SAVE_MS)
  }

  async function goBack() {
    window.clearTimeout(timer.current)
    pending.current = null
    setBusy(true)
    try {
      if (await queueSave(null)) {
        setReverting(false)
        setEditing(false)
        setShowOriginal(false)
      }
    } finally {
      setBusy(false)
    }
  }

  const description = [topic ? `For ${topic}` : "", edited ? (showOriginal ? "the AI's version" : "your version") : ""]
    .filter(Boolean)
    .join(" · ")
  const editLabel = editing ? "Done editing" : "Edit the script"

  // The pencil sits in the card's header beside its fold arrow, in the card's
  // own button slot, so it shows as the card's other buttons do and stays in
  // view while editing. Hidden while the card is shut, since editing a shut
  // card shows nothing.
  const pencil = edit ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="group-data-[state=closed]/card:hidden"
          aria-label={editLabel}
          aria-pressed={editing}
          onClick={() => (editing ? stopEditing() : startEditing())}
        >
          {editing ? <CheckIcon /> : <PencilIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{editing ? "Done editing. Your words are saved as you type." : "Edit the script"}</TooltipContent>
    </Tooltip>
  ) : undefined

  return (
    <>
      <PanelCard storageId="viral-analysis-script" title="Script" meta={description || undefined} action={pencil} actionOpen={editing}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 text-sm break-words">
          {editing
            ? original.map((part, index) => (
                <div key={index} className="grid gap-2">
                  <Label htmlFor={`viral-script-part-${index}`} className="text-xs font-medium text-muted-foreground">
                    {segmentRoleLabels[part.role]} · about {part.seconds}s
                  </Label>
                  <Textarea
                    id={`viral-script-part-${index}`}
                    rows={1}
                    maxLength={4_000}
                    value={draft[index] ?? ""}
                    onChange={(event) => type(index, event.target.value)}
                    onBlur={flush}
                  />
                </div>
              ))
            : shown.map((part, index) => (
                <div key={index} className="grid gap-0.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {segmentRoleLabels[part.role]} · about {part.seconds}s
                  </p>
                  <p className="whitespace-pre-wrap">{part.words}</p>
                </div>
              ))}
          <div className="flex flex-wrap gap-2">
            <CopyButton label="Copy" name="Copy the script" text={scriptText(editing ? original.map((part, index) => ({ ...part, words: draft[index] ?? "" })) : shown, segmentRoleLabels)} />
            <SaveFormatButton pieces={pieces} sourceTitle={sourceTitle} />
            {edited && !editing ? (
              <Button type="button" variant="outline" size="sm" aria-pressed={showOriginal} onClick={() => setShowOriginal((was) => !was)}>
                <EyeIcon />
                {showOriginal ? "Show your version" : "Show original"}
              </Button>
            ) : null}
            {edited ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setReverting(true)}>
                <Undo2Icon />
                Go back to the AI's version
              </Button>
            ) : null}
          </div>
        </div>
      </PanelCard>
      <ConfirmDialog
        open={reverting}
        onOpenChange={setReverting}
        title="Go back to the AI's version?"
        description="Your edit of the script is thrown away. The AI's version is what goes out again."
        confirmLabel="Go back"
        loading={busy}
        onConfirm={() => void goBack()}
      />
    </>
  )
}

/** Keeps the script's structure as a format on Library → Formats, named by its parts. */
function SaveFormatButton({ pieces, sourceTitle }: { pieces: AnalysisPieces; sourceTitle: string | null }) {
  const [busy, setBusy] = React.useState(false)
  async function save() {
    setBusy(true)
    try {
      const parts = formatFromAnalysis(pieces)
      await saveFormatFn({ name: partsName(parts), parts, sourceTitle })
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void save()}>
      {busy ? <Loader2Icon className="animate-spin" /> : <BookmarkPlusIcon />}
      Save format
    </Button>
  )
}

function CopyButton({ label, name, text }: { label: string; name: string; text: string }) {
  const [copied, setCopied] = React.useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      showErrorToast("It couldn't be copied. Select the words and copy them instead.")
    }
  }
  return (
    <div>
      <Button type="button" variant="outline" size="sm" aria-label={name} onClick={() => void copy()}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {label}
      </Button>
    </div>
  )
}
