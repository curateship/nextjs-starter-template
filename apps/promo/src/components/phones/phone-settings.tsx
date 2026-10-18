import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { CardGroup } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  getPhoneSettingsErrorMessage,
  loadPhoneSettings,
  savePhoneSettingsFn,
  saveTestPhone,
  type PhoneSettings,
  type PhoneSettingsPage,
} from "@/lib/api/phones/settings"
import { NONE } from "@/lib/browser/sorting"
import { MAX_WORKING_RANGE, SCREENSHOT_DAYS_RANGE, SHELF_RANGE, type PhoneKind } from "@/lib/phones/options"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** A changed number saves itself this long after the last keystroke, as on the Browsers tab. */
const SAVE_DELAY_MS = 1200

/**
 * The Phones tab in Settings: how many phones work at once, how many days
 * the pictures phones send back are kept, the shelf's rows and columns for
 * the rack map, and the spare phones the daily self-test runs on, one per
 * kind (Tyler, 18 Oct 2026: a spare iPhone is bought as the iPhone test
 * phone).
 *
 * Built like the Browsers tab, from the shell's settings cards, and it saves
 * itself with the outcome in the sticky header. There is no Save button.
 * Waking hours and the warm-up apply to every account, so they are on the
 * Behaviour tab, and the switch that pauses the rack is on the Phones
 * dashboard, where the phones are.
 */
function PhoneSettingsPanel() {
  const [values, setValues] = React.useState<PhoneSettings>({ maxWorking: 5, screenshotDays: 7, shelfRows: 2, shelfColumns: 5 })
  const [testPhoneId, setTestPhoneId] = React.useState<string | null>(null)
  const [testPhoneIphoneId, setTestPhoneIphoneId] = React.useState<string | null>(null)
  const [phones, setPhones] = React.useState<PhoneSettingsPage["phones"]>([])
  const [loading, setLoading] = React.useState(true)
  const setSaveStatus = useReportedSaveStatus()
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  React.useEffect(() => {
    loadPhoneSettings().then(
      (next) => {
        setValues({
          maxWorking: next.maxWorking,
          screenshotDays: next.screenshotDays,
          shelfRows: next.shelfRows,
          shelfColumns: next.shelfColumns,
        })
        setTestPhoneId(next.testPhoneId)
        setTestPhoneIphoneId(next.testPhoneIphoneId)
        setPhones(next.phones)
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
        shelfRows: current.shelfRows === next.shelfRows ? saved.shelfRows : current.shelfRows,
        shelfColumns: current.shelfColumns === next.shelfColumns ? saved.shelfColumns : current.shelfColumns,
      }))
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("idle")
      showErrorToast(getPhoneSettingsErrorMessage(error))
    }
  }

  // A pick saves the moment it changes, and goes back if it is refused.
  async function pickTestPhone(next: string | null, kind: PhoneKind) {
    const set = kind === "iphone" ? setTestPhoneIphoneId : setTestPhoneId
    const before = kind === "iphone" ? testPhoneIphoneId : testPhoneId
    set(next)
    setSaveStatus("saving")
    dismissErrorToast()
    try {
      await saveTestPhone(next, kind)
      setSaveStatus("saved")
    } catch (error) {
      set(before)
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
          Every step of every action keeps a small picture. Older ones are deleted once a day; a
          failed action keeps its pictures until you clear them on the phone&apos;s Actions tab.
        </p>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="promo-phones-shelf"
        title="The shelf"
        description="How the phones sit on the shelf, for the rack map on the Phones dashboard."
        contentClassName="grid gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="promo-phones-shelf-rows"
            label="Rows"
            value={values.shelfRows}
            min={SHELF_RANGE.min}
            max={SHELF_RANGE.max}
            inputClassName="w-full sm:w-32"
            onChange={(value) => change({ ...values, shelfRows: value })}
            onCommit={() => void save(values)}
          />
          <NumberField
            id="promo-phones-shelf-columns"
            label="Columns"
            value={values.shelfColumns}
            min={SHELF_RANGE.min}
            max={SHELF_RANGE.max}
            inputClassName="w-full sm:w-32"
            onChange={(value) => change({ ...values, shelfColumns: value })}
            onCommit={() => void save(values)}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Slots are numbered left to right, top to bottom, so with two rows of five, slot 7 is the
          second from the left on the lower row. Each phone&apos;s slot is typed on its own window.
        </p>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="promo-phones-self-test"
        title="Self-test phones"
        description="A spare phone of each kind signed into a test account, never one a real account runs on."
        contentClassName="grid gap-4"
      >
        <div className="grid gap-2">
          <Label htmlFor="promo-phones-test-phone">The Android the daily self-test runs on</Label>
          <Select
            value={testPhoneId ?? NONE}
            onValueChange={(value) => void pickTestPhone(value === NONE ? null : value, "android")}
          >
            <SelectTrigger id="promo-phones-test-phone" className="w-full sm:w-fit sm:min-w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None, no self-test on Android</SelectItem>
              {phones
                .filter((phone) => phone.kind === "android")
                .map((phone) => (
                  <SelectItem key={phone.id} value={phone.id}>
                    {phone.accounts ? `${phone.name} (runs an account)` : phone.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="promo-phones-test-iphone">The iPhone the daily self-test runs on</Label>
          <Select
            value={testPhoneIphoneId ?? NONE}
            onValueChange={(value) => void pickTestPhone(value === NONE ? null : value, "iphone")}
          >
            <SelectTrigger id="promo-phones-test-iphone" className="w-full sm:w-fit sm:min-w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None, no self-test on iPhone</SelectItem>
              {phones
                .filter((phone) => phone.kind === "iphone")
                .map((phone) => (
                  <SelectItem key={phone.id} value={phone.id}>
                    {phone.accounts ? `${phone.name} (runs an account)` : phone.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">
          Once a day the rack walks each action on each test phone up to the last button, Post or
          Send, and never presses it, then looks in the Play Store or the App Store for app updates.
          A step it cannot find stops jobs that need that action on that kind of phone until it
          passes again, and leaves the other kind running. New app versions go onto these phones
          first.
        </p>
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}

export default PhoneSettingsPanel
