import * as React from "react"
import { Loader2Icon, SettingsIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { applyBotSettings, getBotErrorMessage } from "@/lib/api/bots"

/**
 * The bot-page "settings changed" notice. Saving the canvas never touches a
 * deployed run, so when the automation drifts ahead of the run this strip
 * walks the admin through the manual hand-off: pause the bot, apply the new
 * settings, resume. The run keeps its per-market data through all three.
 */
export function BotSettingsBanner({
  settingsBehind,
  botId,
  desiredState,
  commandBusy,
  onPause,
  onChanged,
}: {
  settingsBehind: boolean
  botId: string
  desiredState: string
  commandBusy: boolean
  onPause: () => Promise<unknown> | void
  onChanged: () => Promise<unknown> | void
}) {
  const [applying, setApplying] = React.useState(false)

  if (!settingsBehind || desiredState === "stopped") return null

  const paused = desiredState === "paused"

  async function apply() {
    setApplying(true)
    try {
      await applyBotSettings(botId)
      await onChanged()
    } catch (error) {
      toast.error(getBotErrorMessage(error))
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-600 dark:text-amber-400">
      <SettingsIcon className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        {paused
          ? "The automation's settings changed. Apply them, then resume the bot."
          : "The automation's settings changed since this run took them. The bot keeps trading on its old settings until you pause and apply."}
      </span>
      {paused ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={applying}
          onClick={() => void apply()}
        >
          {applying ? <Loader2Icon className="size-3 animate-spin" /> : null}
          Apply new settings
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={commandBusy}
          onClick={() => void onPause()}
        >
          {commandBusy ? <Loader2Icon className="size-3 animate-spin" /> : null}
          Pause to apply
        </Button>
      )}
    </div>
  )
}
