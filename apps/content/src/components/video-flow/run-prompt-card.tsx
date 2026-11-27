import * as React from "react"
import { MessageSquareTextIcon, RefreshCwIcon } from "lucide-react"

import { PanelCard } from "@/components/shared/panel-card"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingRow } from "@/components/ui/loading-row"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { PromptIdeas } from "@/components/video-flow/use-prompt-ideas"
import { formatAiEstimate } from "@/lib/video/ai-estimates"
import type { FlowRunStep } from "@/lib/video/flow/flows"
import { FLOW_PROMPT_MAX } from "@/lib/video/flow/node-kinds"

/**
 * This video's prompt for the step, in the run's right panel (Tyler, 25 Nov
 * 2026, picked "Right panel card"). The flow's prompt on the canvas says how
 * every video is built; this card says what is in this one, and the step's
 * button sends both. With the node's switch on, the AI writes it first as an
 * idea to edit, and New idea asks for another.
 */
export function RunPromptCard({
  step,
  ideas,
  ideaCents,
  locked,
  waiting = false,
}: {
  step: FlowRunStep
  ideas: PromptIdeas
  ideaCents: number
  /** Being made, or the run was stopped: the words show but can't change. */
  locked: boolean
  /** Still waiting on a step it reads: an idea comes once that one is made. */
  waiting?: boolean
}) {
  const [asking, setAsking] = React.useState(false)
  const id = `flow-video-prompt-${step.id}`
  const words = ideas.promptFor(step)
  const writing = ideas.writing(step)
  const error = ideas.error(step)
  // Words the person wrote, as opposed to the AI's idea left as it wrote it.
  const ownWords = Boolean(words.trim()) && !(step.videoPromptFromAi && words.trim() === (step.videoPrompt ?? "").trim())
  const newIdea = () => (ownWords ? setAsking(true) : ideas.newIdea(step))

  return (
    <PanelCard storageId="video-flow-run-prompt" icon={<MessageSquareTextIcon />} title="Prompt" meta="This video">
      <div className="grid gap-2">
        <label htmlFor={id} className="sr-only">
          This video's prompt
        </label>
        {writing ? (
          <LoadingRow label="Writing an idea…" />
        ) : (
          <Textarea
            id={id}
            value={words}
            maxLength={FLOW_PROMPT_MAX}
            disabled={locked}
            placeholder="What is in this video at this step. Left empty, the step follows the flow's prompt alone."
            onChange={(event) => ideas.setPrompt(step, event.target.value)}
          />
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {step.suggestPrompt && waiting ? (
          <p className="text-xs text-muted-foreground">The AI writes an idea here once the step before it is made.</p>
        ) : step.suggestPrompt ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{step.videoPromptFromAi && !ownWords ? "The AI's idea. Change anything." : null}</p>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={locked || writing} onClick={newIdea}>
                  <RefreshCwIcon />
                  New idea
                </Button>
              </TooltipTrigger>
              <TooltipContent>Another idea from the AI, {formatAiEstimate(ideaCents)}</TooltipContent>
            </Tooltip>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Replace your words?"
        description="New idea puts a fresh idea from the AI in the Prompt card, in place of what you wrote."
        confirmLabel="New idea"
        onConfirm={() => {
          setAsking(false)
          ideas.newIdea(step)
        }}
      />
    </PanelCard>
  )
}
