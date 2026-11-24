import * as React from "react"

import { DripSettingsFields } from "@/components/shared/drip-settings-fields"
import { useSettingsAutoSave } from "@/components/settings/use-settings-auto-save"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getEmailSettingsErrorMessage,
  loadEmailSettings,
  saveNewsletterDripDefaults,
} from "@/lib/api/email/email-settings"
import { useLoad } from "@/lib/hooks/use-load"
import { validateDripConfig, type DripConfig } from "@/lib/broadcasts/drip"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * How fast a newsletter goes out: the pace every new newsletter starts from,
 * in the CRM ⋮'s Emails tab (Tyler, 23 Nov 2026: "move the drip sending
 * settings to the 3 dot dropdown"). It was a card in Settings → Email.
 *
 * Saves 1.2s after typing stops, at once when focus leaves the fields, and
 * once more if the menu shuts with a change still waiting, since shutting the
 * menu throws this away along with its timer.
 */
export function NewsletterPaceSettings() {
  const [drip, setDrip] = React.useState<DripConfig | null>(null)
  const loaded = useLoad(loadEmailSettings, getEmailSettingsErrorMessage, {
    onLoad: (status) => setDrip((shown) => shown ?? status.dripDefaults),
  })
  const autoSave = useSettingsAutoSave(getEmailSettingsErrorMessage, () => {})
  // The edit not yet saved, for the save the menu's shutting owes.
  const unsaved = React.useRef<DripConfig | null>(null)

  React.useEffect(
    () => () => {
      const owed = unsaved.current
      if (owed && !validateDripConfig(owed)) {
        void saveNewsletterDripDefaults(owed).catch((caught) =>
          showErrorToast(getEmailSettingsErrorMessage(caught))
        )
      }
    },
    []
  )

  const save = (next: DripConfig) => () =>
    saveNewsletterDripDefaults(next).then((status) => {
      if (unsaved.current === next) unsaved.current = null
      return status
    })

  const edit = (next: DripConfig) => {
    setDrip(next)
    unsaved.current = next
    // Settings that contradict each other are not sent; leaving the fields
    // says why, rather than complaining halfway through a two-digit number.
    if (validateDripConfig(next)) {
      autoSave.cancel("drip")
      return
    }
    autoSave.schedule("drip", save(next))
  }
  const flush = () => {
    if (!drip || unsaved.current !== drip) return
    const invalid = validateDripConfig(drip)
    if (invalid) {
      autoSave.cancel("drip")
      showErrorToast(`Not saved. ${invalid}`)
      return
    }
    autoSave.flush("drip", save(drip))
  }

  if (loaded.error) return <ErrorRow message={loaded.error} onRetry={loaded.retry} />
  if (!drip) return <LoadingRow label="Loading newsletter sending settings…" className="min-h-13 py-2" />
  return (
    <div
      className="grid gap-3"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return
        flush()
      }}
    >
      <p className="px-0.5 text-xs text-muted-foreground">
        Every new newsletter starts from these, and each one can still be changed before it is sent.
      </p>
      <DripSettingsFields idPrefix="crm-drip-defaults" value={drip} onChange={edit} />
    </div>
  )
}
