"use client"

import { useEffect } from "react"
import { useRouter } from "@/lib/navigation-client"
import { BuilderSkeleton } from "@/components/admin/layout/skeletons"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"

export default function PageBuilderPage() {
  const router = useRouter()
  const { currentSite, sites, loading } = useSiteSwitcher()

  useEffect(() => {
    if (loading) {
      return
    }

    // Immediately redirect to first available site or sites page
    if (currentSite) {
      router.replace(`/admin/pages/${currentSite.id}`)
    } else if (sites.length > 0) {
      router.replace(`/admin/pages/${sites[0].id}`)
    } else {
      router.replace('/admin/sites')
    }
  }, [currentSite, loading, sites, router])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <StickyHeader />
      <BuilderSkeleton />
    </div>
  )
}
