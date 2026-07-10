"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { BuilderSkeleton } from "@/components/admin/layout/skeletons"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"

export default function ProductBuilderRootPage() {
  const router = useRouter()
  const { currentSite } = useSiteSwitcher()

  // Redirect to current site product builder if site is available
  useEffect(() => {
    if (currentSite) {
      router.push(`/admin/products/builder/${currentSite.id}`)
    }
  }, [currentSite, router])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <StickyHeader />
      <BuilderSkeleton />
    </div>
  )
}
