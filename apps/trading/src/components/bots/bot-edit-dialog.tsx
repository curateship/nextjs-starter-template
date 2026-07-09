import { Loader2Icon } from "lucide-react"

import { BotEditFields, useBotEditor } from "@/components/bots/bot-edit-panel"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { BotDetailResponse } from "@/lib/api/bots"
import { STRATEGY_LABELS } from "@/lib/strategies/params"

/**
 * Standard admin dialog for editing a bot from the fleet dashboard: header +
 * scrollable body of the shared edit fields + a footer with Cancel/Save.
 * Mount it only while a bot is selected so the editor state seeds from it.
 */
export function BotEditDialog({
  bot,
  open,
  onOpenChange,
  onSaved,
}: {
  bot: BotDetailResponse["bot"]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (message: string, tone: "ok" | "error") => void
}) {
  const editor = useBotEditor(bot, bot.status === "running", onSaved)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (editor.busy ? null : onOpenChange(next))}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Edit {STRATEGY_LABELS[bot.strategy_type]} bot</DialogTitle>
          <DialogDescription>
            Change the name, strategy parameters, and risk limits. Markets,
            wallet, and mode are fixed at creation.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5 overflow-y-auto">
          <BotEditFields
            strategyType={bot.strategy_type}
            mid={0}
            editor={editor}
          />
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={editor.busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={editor.busy}
            onClick={() => void editor.save()}
          >
            {editor.busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
