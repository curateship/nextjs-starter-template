import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { CardGroup } from "@/components/ui/card"
import { NumberField } from "@/components/ui/number-field"
import { IDLE_MINUTES_RANGE, MAX_OPEN_RANGE } from "@/lib/browser/limits"
import {
  getBrowserSettingsErrorMessage,
  loadBrowserSettings,
  saveBrowserSettingsFn,
  type BrowserSettings,
} from "@/lib/api/browser/settings"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * A changed number saves itself this long after the last keystroke, the same
 * wait as the shell's AI keys, and Enter saves straight away.
 */
const SAVE_DELAY_MS = 1200

/**
 * The Browsers tab in Settings: how many browsers this machine may have open
 * at once, and how long an unused one stays open.
 *
 * Both are the machine's, not a profile's, because the memory they protect is
 * the machine's. Each browser holds about 1.5GB at most.
 *
 * Built from the shell's own settings cards in a `CardGroup`, so the cards and
 * the gap between them follow Settings → Styling like every other settings
 * screen, and it saves itself with the outcome in the sticky header. There is
 * no Save button.
 */
function BrowserSettingsPanel() {
  const [maxOpen, setMaxOpen] = React.useState(3)
  const [idleMinutes, setIdleMinutes] = React.useState(60)
  const [loading, setLoading] = React.useState(true)
  const setSaveStatus = useReportedSaveStatus()
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const fill = React.useCallback((next: BrowserSettings) => {
    setMaxOpen(next.maxOpen)
    setIdleMinutes(next.idleMinutes)
  }, [])

  React.useEffect(() => {
    loadBrowserSettings().then(
      (next) => {
        fill(next)
        setLoading(false)
      },
      (error: unknown) => {
        showErrorToast(getBrowserSettingsErrorMessage(error))
        setLoading(false)
      }
    )
  }, [fill])

  // A save still waiting when the tab closes is dropped with it.
  React.useEffect(() => () => clearTimeout(timer.current), [])

  // The values ride in as arguments, so the timer saves exactly what was
  // typed when it was set, not whatever the state holds by then.
  async function save(next: { maxOpen: number; idleMinutes: number }) {
    clearTimeout(timer.current)
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      const saved = await saveBrowserSettingsFn(next)
      // A newer edit made while this one was on its way keeps its numbers and
      // saves itself in turn.
      setMaxOpen((current) => (current === next.maxOpen ? saved.maxOpen : current))
      setIdleMinutes((current) => (current === next.idleMinutes ? saved.idleMinutes : current))
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getBrowserSettingsErrorMessage(error))
    }
  }

  function change(next: { maxOpen: number; idleMinutes: number }) {
    setMaxOpen(next.maxOpen)
    setIdleMinutes(next.idleMinutes)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(next), SAVE_DELAY_MS)
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Reading the browser settings
      </p>
    )
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="promo-browsers-open"
        title="How many browsers run at once"
        description="Each browser takes up to 1.5GB of memory and one processor."
        contentClassName="grid gap-4"
      >
        <NumberField
          id="promo-max-open"
          label="Browsers open at once"
          value={maxOpen}
          min={MAX_OPEN_RANGE.min}
          max={MAX_OPEN_RANGE.max}
          inputClassName="w-full sm:w-32"
          onChange={(value) => change({ maxOpen: value, idleMinutes })}
          onCommit={() => void save({ maxOpen, idleMinutes })}
        />
        <p className="text-sm text-muted-foreground">
          {maxOpen} {maxOpen === 1 ? "browser takes" : "browsers take"} up to{" "}
          {formatGigabytes(maxOpen * 1.5)}. Opening one more is refused and says why. Profiles
          also work side by side up to this many, so a comment on one profile does not hold up
          a search on another.
        </p>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="promo-browsers-idle"
        title="When an unused browser closes"
        description="A closed browser gives its memory back and keeps its sign-ins."
        contentClassName="grid gap-4"
      >
        <NumberField
          id="promo-idle-minutes"
          label="Minutes unused before it closes"
          value={idleMinutes}
          min={IDLE_MINUTES_RANGE.min}
          max={IDLE_MINUTES_RANGE.max}
          inputClassName="w-full sm:w-32"
          onChange={(value) => change({ maxOpen, idleMinutes: value })}
          onCommit={() => void save({ maxOpen, idleMinutes })}
        />
        <p className="text-sm text-muted-foreground">
          A browser nobody has searched, posted or watched in this long is closed. It opens again
          when it is next needed.
        </p>
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}

/** "4.5GB", "3GB": one decimal only when there is one. */
function formatGigabytes(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}GB`
}

export default BrowserSettingsPanel
