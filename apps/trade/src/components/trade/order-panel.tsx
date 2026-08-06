import { ArrowLeftRightIcon } from "lucide-react"

import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { PanelPlaceholder } from "@/components/trade/panel-placeholder"

/**
 * The lower row of the right panel: placing the order.
 *
 * Below the account rather than above it, because the account is what decides
 * where an order goes and what it is even allowed to be — reading down the
 * panel is the same order as making the decision.
 */
export function OrderPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkspacePanelHeader
        icon={<ArrowLeftRightIcon className="size-4" />}
        title="Order"
      />
      <div className="min-h-0 flex-1">
        <PanelPlaceholder
          icon={<ArrowLeftRightIcon className="size-4" />}
          title="Nothing to trade with yet"
        >
          Buying and selling opens up once an account is connected above.
        </PanelPlaceholder>
      </div>
    </div>
  )
}
