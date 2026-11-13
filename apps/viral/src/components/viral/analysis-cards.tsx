import * as React from "react"
import { BookmarkPlusIcon, CheckIcon, CopyIcon, Loader2Icon } from "lucide-react"

import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
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
 */
export function AnalysisCards({
  pieces,
  topic,
  sourceTitle = null,
}: {
  pieces: AnalysisPieces
  topic: string
  /** The video it was written about, kept with a saved format. */
  sourceTitle?: string | null
}) {
  const { whyItWorks, script, ideas, title } = pieces
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
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

      <PanelCard storageId="viral-analysis-script" title="Script" meta={topic ? `For ${topic}` : undefined}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 text-sm break-words">
          {script.map((part, index) => (
            <div key={index} className="grid gap-0.5">
              <p className="text-xs font-medium text-muted-foreground">
                {segmentRoleLabels[part.role]} · about {part.seconds}s
              </p>
              <p className="whitespace-pre-wrap">{part.words}</p>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <CopyButton label="Copy" name="Copy the script" text={scriptText(script, segmentRoleLabels)} />
            <SaveFormatButton pieces={pieces} sourceTitle={sourceTitle} />
          </div>
        </div>
      </PanelCard>

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
    </div>
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
