import * as React from "react"

import { TextPickRow } from "@/components/crm/crm-record-menu"
import { PickGroup, PickMenuRow } from "@/components/shared/notes/pick-rows"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { getClaimErrorMessage, saveClaimSettings } from "@/lib/api/directory/claims"
import { loadDirectorySettings } from "@/lib/api/directory/settings"
import { useLoad } from "@/lib/hooks/use-load"
import { showErrorToast } from "@/lib/toast/error-toast"

type ClaimSettings = {
  claimsEnabled: boolean
  claimButtonLabel: string
  claimPendingMessage: string
  claimApprovedMessage: string
}

/**
 * What the site says about claiming, as the Claims tab of the Listings
 * dashboard's left ⋮. It sat in a card under the old Claims page's tables;
 * in the three-panel design every settings window is a tab of grouped rows
 * (the Admin 3 panel design, "Tabbed ⋮ menu"). Each row saves on its own.
 *
 * Every text may be left empty, and an empty one means "use the built-in
 * wording" rather than an empty page: the default lives in one place on the
 * server, and clearing a box is how an admin says they have nothing better.
 */
export function ClaimSettingsTab() {
  const read = useLoad(loadDirectorySettings, getClaimErrorMessage)
  const [settings, setSettings] = React.useState<ClaimSettings | null>(null)
  const shown: ClaimSettings | null =
    settings ??
    (read.data
      ? {
          claimsEnabled: read.data.claimsEnabled,
          claimButtonLabel: read.data.claimButtonLabel,
          claimPendingMessage: read.data.claimPendingMessage,
          claimApprovedMessage: read.data.claimApprovedMessage,
        }
      : null)

  if (read.error) return <ErrorRow message={read.error} onRetry={read.retry} className="p-3" />
  if (!shown) return <LoadingRow label="Reading the claim settings…" />

  const change = (patch: Partial<ClaimSettings>) => {
    const was = shown
    const next = { ...shown, ...patch }
    // Shown at once, saved behind; a refused save puts it back.
    setSettings(next)
    saveClaimSettings(next).catch((error: unknown) => {
      setSettings(was)
      showErrorToast(getClaimErrorMessage(error))
    })
  }

  return (
    <div className="grid gap-3 p-3">
      <PickGroup title="Claiming">
        <PickMenuRow
          label="Businesses can claim"
          value={shown.claimsEnabled ? "On" : "Off"}
          options={[
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
          selected={shown.claimsEnabled ? "on" : "off"}
          onPick={(value) => change({ claimsEnabled: value === "on" })}
        />
      </PickGroup>
      <PickGroup title="What visitors are told">
        <TextPickRow
          label="Button"
          value={shown.claimButtonLabel}
          placeholder="Is this your business?"
          onCommit={(value) => change({ claimButtonLabel: value.slice(0, 80) })}
        />
        <TextPickRow
          label="While it is read"
          value={shown.claimPendingMessage}
          multiline
          onCommit={(value) => change({ claimPendingMessage: value.slice(0, 300) })}
        />
        <TextPickRow
          label="Once it is theirs"
          value={shown.claimApprovedMessage}
          multiline
          onCommit={(value) => change({ claimApprovedMessage: value.slice(0, 300) })}
        />
      </PickGroup>
      <p className="text-xs text-muted-foreground">Leave a text empty to use the wording the app comes with.</p>
    </div>
  )
}
