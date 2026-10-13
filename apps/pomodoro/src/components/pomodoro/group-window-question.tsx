import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

/**
 * A question asked inside a window that is already open, such as Remove or
 * Make owner in Edit group. The UI rules allow no window on top of a window,
 * so the question takes the window's place and Cancel brings the window back,
 * the way Host a room's sound picker does.
 */
export type WindowQuestion = {
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  /** Red for something that removes data; plain for a hand-over. */
  destructive?: boolean
  /**
   * A tick box under the question, such as "Don't let them back in", and
   * the description to show while it is ticked.
   */
  option?: { label: string; descriptionWhenTicked: string }
  /** Runs the action. True means it worked and the question goes away. */
  onConfirm: (ticked: boolean) => Promise<boolean>
  onCancel?: () => void
}

export function WindowQuestionView({
  question,
  onDone,
}: {
  question: WindowQuestion
  /** Back to the window, after Cancel or once the action worked. */
  onDone: () => void
}) {
  const [ticked, setTicked] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const optionId = React.useId()

  return (
    <>
      <DialogHeader>
        <DialogTitle>{question.title}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <DialogDescription>
          {ticked && question.option
            ? question.option.descriptionWhenTicked
            : question.description}
        </DialogDescription>
        {question.option ? (
          <div className="flex items-center gap-2 pt-4">
            <Checkbox
              id={optionId}
              checked={ticked}
              onCheckedChange={(state) => setTicked(state === true)}
            />
            <Label htmlFor={optionId} className="font-normal">
              {question.option.label}
            </Label>
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            question.onCancel?.()
            onDone()
          }}
        >
          {question.cancelLabel ?? "Cancel"}
        </Button>
        <Button
          type="button"
          variant={question.destructive === false ? "default" : "destructive"}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const worked = await question.onConfirm(ticked)
            setBusy(false)
            if (worked) onDone()
          }}
        >
          {busy ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
          {question.confirmLabel}
        </Button>
      </DialogFooter>
    </>
  )
}
