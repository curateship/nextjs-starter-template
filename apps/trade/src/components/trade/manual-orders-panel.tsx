import { ListOrderedIcon } from "lucide-react"
import type { ComponentProps } from "react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { WatchedOrdersList } from "@/components/trade/watched-orders-list"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

type ManualOrdersPanelProps = ComponentProps<typeof WatchedOrdersList> & {
  compact?: boolean
}

/** Hand-placed orders waiting for the market to reach their price. */
export function ManualOrdersPanel({
  compact = false,
  ...orders
}: ManualOrdersPanelProps) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-card",
        compact && "max-h-[18rem]"
      )}
    >
      <DashboardCardTitleHeader
        icon={<ListOrderedIcon className="size-4" />}
        title="Manual orders"
      />
      <ScrollArea className="min-h-0 flex-1">
        <WatchedOrdersList {...orders} />
      </ScrollArea>
    </section>
  )
}
