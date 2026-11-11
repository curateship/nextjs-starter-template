import * as React from "react"
import { CopyIcon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Button } from "@/components/ui/button"
import { CardGroup } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { showErrorToast } from "@/lib/toast/error-toast"
import { SHARE_PATH } from "@/lib/viral/share"

/**
 * Settings → Save from phone (`workspace/docs/phone-save.md`, task part 22).
 * Tyler, 4 Nov 2026: "Phone share menu", for both phones. Android lists
 * Viral in its share menu once Viral is on the home screen. An iPhone never
 * lists a website there, so it uses an Apple Shortcut that opens the same
 * page with the link in its address. Nothing here is saved.
 */
function PhoneSettings() {
  // The address is this site's own, known once the page is in the browser.
  const origin = React.useSyncExternalStore(noChange, browserOrigin, () => "")
  const address = `${origin}${SHARE_PATH}?url=`

  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
    } catch {
      showErrorToast("The address could not be copied. Select it and copy it instead.")
    }
  }

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="viral-phone-android"
        title="Android"
        description="Viral shows in the share menu once it is on the home screen."
      >
        <ol className="grid list-decimal gap-1.5 pl-5 text-sm">
          <li>Open this site in Chrome on the phone and sign in.</li>
          <li>Press the menu, then Add to Home screen.</li>
          <li>In the YouTube or TikTok app, press Share on a video, then pick Viral.</li>
          <li>Viral opens with the link. Pick a project and press Add to project.</li>
        </ol>
      </CollapsibleSettingsCard>
      <CollapsibleSettingsCard
        storageId="viral-phone-iphone"
        title="iPhone"
        description="An iPhone never puts a website in its share menu, so an Apple Shortcut opens Viral with the link instead."
      >
        <div className="grid gap-4">
          <ol className="grid list-decimal gap-1.5 pl-5 text-sm">
            <li>Open the Shortcuts app and make a new shortcut called "Save to Viral".</li>
            <li>In its settings, switch on Show in Share Sheet, and let it receive URLs.</li>
            <li>Add the action URL Encode, with the Shortcut Input.</li>
            <li>Add the action Open URLs, with the address below followed by the URL Encode result.</li>
            <li>In the YouTube or TikTok app, press Share on a video, then pick Save to Viral.</li>
          </ol>
          <div className="grid gap-2">
            <Label htmlFor="viral-phone-address">The address</Label>
            <div className="flex gap-2">
              <Input id="viral-phone-address" readOnly value={address} onFocus={(event) => event.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={() => void copy()}>
                <CopyIcon />
                Copy
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}

function noChange() {
  return () => {}
}

function browserOrigin() {
  return window.location.origin
}

export default PhoneSettings
