import * as React from "react"
import { CopyIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  getExportErrorMessage,
  setExportHandEdited,
  type RenderJobSummary,
} from "@/lib/api/video/exports"
import {
  aiPartLines,
  aiPartsParagraph,
  aiPartsTakeHandEdits,
  NOTHING_MADE_BY_AI,
} from "@/lib/video/ai-parts"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * What the AI made in one video export, in plain words, and one paragraph to
 * paste into YouTube's "altered or synthetic content" box or TikTok's AI
 * label (`workspace/docs/say-what-ai-made.md`).
 *
 * The "Edited by hand" tick saves the moment it changes, for this export only.
 */
export function ExportAiPartsCard({
  item,
  onSaved,
}: {
  item: RenderJobSummary
  onSaved: (item: RenderJobSummary) => void
}) {
  const [handEdited, setHandEdited] = React.useState(item.ai_hand_edited)
  const parts = item.ai_parts

  async function handleHandEdited(next: boolean) {
    setHandEdited(next)
    try {
      const saved = await setExportHandEdited(item.id, next)
      dismissErrorToast()
      onSaved(saved)
    } catch (error) {
      setHandEdited(!next)
      showErrorToast(getExportErrorMessage(error))
    }
  }

  async function handleCopy() {
    if (!parts) return
    try {
      await navigator.clipboard.writeText(aiPartsParagraph(parts, handEdited))
      toast.success("Copied. Paste it where the upload asks about AI.")
    } catch {
      showErrorToast(
        "The paragraph could not be copied. Select the lines and copy them yourself."
      )
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Made by AI</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!parts ? (
          <p className="text-sm text-muted-foreground">
            This export was made before the list existed. Export the project
            again to get one.
          </p>
        ) : !parts.length ? (
          <p className="text-sm text-muted-foreground">{NOTHING_MADE_BY_AI}</p>
        ) : (
          <>
            <ul className="grid list-disc gap-1 pl-5 text-sm">
              {aiPartLines(parts, handEdited).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {aiPartsTakeHandEdits(parts) ? (
              <div className="flex items-center gap-3">
                <Checkbox
                  id="export-ai-hand-edited"
                  checked={handEdited}
                  onCheckedChange={(checked) =>
                    void handleHandEdited(checked === true)
                  }
                />
                <Label
                  htmlFor="export-ai-hand-edited"
                  className="grid gap-0.5 font-normal"
                >
                  <span className="font-medium">Edited by hand</span>
                  <span className="text-sm text-muted-foreground">
                    {'Adds "edited by hand" to the script and picture lines.'}
                  </span>
                </Label>
              </div>
            ) : null}
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCopy()}
              >
                <CopyIcon />
                Copy as one paragraph
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
