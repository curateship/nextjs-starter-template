import { createFileRoute } from "@tanstack/react-router"

import { WalletDetailPage } from "@/components/scanner/wallet-detail"
import { loadWalletDetail } from "@/lib/api/scanner"

export const Route = createFileRoute("/_authenticated/scanner/whales/$address")({
  loader: ({ params }) => loadWalletDetail(params.address),
  component: WalletRoute,
})

function WalletRoute() {
  const initial = Route.useLoaderData()
  return <WalletDetailPage initial={initial} />
}
