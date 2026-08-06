import { WalletIcon } from "lucide-react"

import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { PanelPlaceholder } from "@/components/trade/panel-placeholder"

/**
 * The right panel: which account you are trading with, and the order form.
 *
 * "No account connected yet" is the truth rather than a stand-in — this app has
 * no accounts of any kind, so there is nothing to invent. Picking an account is
 * also the moment an exchange enters the page at all; everything to the left of
 * this panel works without one.
 */
export function AccountPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkspacePanelHeader
        icon={<WalletIcon className="size-4" />}
        title="Account"
      />
      <div className="min-h-0 flex-1">
        <PanelPlaceholder
          icon={<WalletIcon className="size-4" />}
          title="No account connected yet"
        >
          Choosing an account is what decides the exchange an order goes to.
          Nothing else on this page needs one.
        </PanelPlaceholder>
      </div>
    </div>
  )
}
