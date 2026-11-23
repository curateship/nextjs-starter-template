"use client"

import dynamic from "@/lib/dynamic"
import { usePathname } from "@/lib/navigation-client"
import { useEffect, useMemo, useState } from "react"

import { selectCampaignsForPath, type PublicCampaign } from "@/lib/campaigns/campaigns"

const CampaignRuntime = dynamic(
  () => import("./CampaignRuntime").then((module) => module.CampaignRuntime),
  { ssr: false },
)

export function CampaignGate({ campaigns }: { campaigns: PublicCampaign[] }) {
  const pathname = usePathname() || "/"
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const selected = useMemo(() => selectCampaignsForPath(campaigns, pathname), [campaigns, pathname])

  if (!mounted || (!selected.bars.length && !selected.popup) || pathname.startsWith("/admin")) return null
  return <CampaignRuntime bars={selected.bars} popup={selected.popup} path={pathname} />
}
