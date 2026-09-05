import * as React from "react"
import type {
  ExplorerOpening,
  ExplorerVenue,
} from "@/lib/api/trade/market-explorer"
import { useStreamed } from "@/lib/trade/use-streamed"

export function StreamedVenue({
  venue,
  accept,
}: {
  venue: ExplorerOpening["venues"][number]
  accept: (venue: ExplorerVenue) => void
}) {
  const promise = React.useMemo(
    () =>
      venue.answer.catch((): ExplorerVenue => ({
        protocol: venue.protocol,
        protocolLabel: venue.protocolLabel,
        catalog: null,
        hidden: 0,
        orders: false,
        message: "The market list did not arrive. Try again.",
      })),
    [venue.answer, venue.protocol, venue.protocolLabel]
  )
  const answer = useStreamed(promise)
  React.useEffect(() => {
    if (answer) accept(answer)
  }, [answer, accept])
  return null
}
