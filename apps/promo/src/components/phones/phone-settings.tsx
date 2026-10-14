import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { CardGroup } from "@/components/ui/card"
import { NumberField } from "@/components/ui/number-field"
import {
  getPhoneSettingsErrorMessage,
  loadPhoneSettings,
  savePhoneSettingsFn,
  type PhoneSettings,
} from "@/lib/api/phones/settings"
import { MAX_WORKING_RANGE, SCREENSHOT_DAYS_RANGE } from "@/lib/phones/options"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** A changed number saves itself this long after the last keystroke, as on the Browsers tab. */
const SAVE_DELAY_MS = 1200

/**
 * The Phones tab in Settings: how many phones work at once, and how many days
 * the pictures phones send back are kept.
 *
 * Built like the Browsers tab, from the shell's settings cards, and it saves
 * itself with the outcome in the sticky header. There is no Save button.
 * Waking hours and the warm-up apply to every account, so they are on the
 * Behaviour tab, and the switch that pauses the rack is on the Phones
 * dashboard, where the phones are.
 */
function PhoneSettingsPanel() {
  const [values, setValues] = React.useState<PhoneSettings>({ maxWorking: 5, screenshotDays: 7 })
  const [loading, setLoading] = React.useState(true)
  const setSaveStatus = useReportedSaveStatus()
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  React.useEffect(() => {
    loadPhoneSettings().then(
      (next) => {
        setValues(next)
        setLoading(false)
      },
      (error: unknown) => {
        showErrorToast(getPhoneSettingsErrorMessage(error))
        setLoading(false)
      }
    )
  }, [])

  // A save still waiting when the tab closes is dropped with it.
  React.useEffect(() => () => clearTimeout(timer.current), [])

  // The values ride in as an argument, so the timer saves exactly what was
  // typed when it was set, not whatever the state holds by then.
  async function save(next: PhoneSettings) {
    clearTimeout(timer.current)
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      const saved = await savePhoneSettingsFn(next)
      // A newer edit made while this one was on its way keeps its numbers.
      setValues((current) => ({
        maxWorking: current.maxWorking === next.maxWorking ? saved.maxWorking : current.maxWorking,
        screenshotDays: current.screenshotDays === next.screenshotDays ? saved.screenshotDays : current.screenshotDays,
      }))
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getPhoneSettingsErrorMessage(error))
    }
  }

  function change(next: PhoneSettings) {
    setValues(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(next), SAVE_DELAY_MS)
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Reading the phone settings
      </p>
    )
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="promo-phones-working"
        title="How many phones work at once"
        description="Each phone runs one job at a time. This is how many phones may be busy together."
        contentClassName="grid gap-4"
      >
        <NumberField
          id="promo-phones-working"
          label="Phones working at once"
          value={values.maxWorking}
          min={MAX_WORKING_RANGE.min}
          max={MAX_WORKING_RANGE.max}
          inputClassName="w-full sm:w-32"
          onChange={(value) => change({ ...values, maxWorking: value })}
          onCommit={() => void save(values)}
        />
        <p className="text-sm text-muted-foreground">
          Phone jobs have their own places, separate from the browsers, so a comment waiting on a
          phone never holds up a search in a browser.
        </p>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="promo-phones-pictures"
        title="How long pictures are kept"
        description="The screenshots phones send back with their checks and jobs."
        contentClassName="grid gap-4"
      >
        <NumberField
          id="promo-phones-screenshot-days"
          label="Days pictures are kept"
          value={values.screenshotDays}
          min={SCREENSHOT_DAYS_RANGE.min}
          max={SCREENSHOT_DAYS_RANGE.max}
          inputClassName="w-full sm:w-32"
          onChange={(value) => change({ ...values, screenshotDays: value })}
          onCommit={() => void save(values)}
        />
        <p className="text-sm text-muted-foreground">
          Older pictures are deleted, and each phone keeps those of its newest 20 checks at most.
        </p>
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}

export default PhoneSettingsPanel
