import { ListOrderedIcon } from "lucide-react"
import type { ComponentProps } from "react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { WatchedOrdersList } from "@/components/trade/watched-orders-list"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

/**
 * Hand-placed orders waiting for the market to reach their price. The panel
 * fills whatever box it is given, in its own column or in the dropdown, and
 * the list scrolls inside it.
 */
export function ManualOrdersPanel(
  orders: ComponentProps<typeof WatchedOrdersList>
) {
  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card">
      <DashboardCardTitleHeader
        icon={<ListOrderedIcon className="size-4" />}
        title="Manual orders"
      />
      <ScrollArea className="min-h-0 flex-1">
        <WatchedOrdersList {...orders} />
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  )
}
