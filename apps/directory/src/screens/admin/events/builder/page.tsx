"use client"

import { useEffect } from "react"
import { useRouter } from "@/lib/navigation-client"
import { AdminLoading } from "@/components/admin/layout/loading"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"

export default function EventBuilderRootPage() {
  const router = useRouter()
  const { currentSite, sites, loading } = useSiteSwitcher()

  // Bounce to the current site's event builder. Uses replace so this
  // transient screen never lands in history (push would trap the Back button).
  useEffect(() => {
    if (loading) {
      return
    }

    if (currentSite) {
      router.replace(`/admin/events/builder/${currentSite.id}`)
    } else if (sites.length > 0) {
      router.replace(`/admin/events/builder/${sites[0].id}`)
    } else {
      router.replace('/admin/sites')
    }
  }, [currentSite, loading, sites, router])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <StickyHeader />
      <AdminLoading className="min-h-0 flex-1" />
    </div>
  )
}
