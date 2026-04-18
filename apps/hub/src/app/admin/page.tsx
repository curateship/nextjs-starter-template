"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"

export default function AdminDashboard() {
  const router = useRouter()
  const { currentSite, loading } = useSiteSwitcher()

  useEffect(() => {
    if (!loading) {
      if (currentSite) {
        // Redirect to current site's dashboard
        router.replace(`/admin/sites/${currentSite.id}/dashboard`)
      } else {
        // No sites available, redirect to create new site
        router.replace('/admin/sites/new')
      }
    }
  }, [currentSite, loading, router])

  // Show skeleton state while redirecting
  return (
    <div className="flex-1 p-6 space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-4 w-72 bg-muted animate-pulse rounded" />
      </div>
      {/* Stats grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-lg border p-6 space-y-3">
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            <div className="h-7 w-16 bg-muted animate-pulse rounded" />
          </div>
        ))}
      </div>
      {/* Content skeleton */}
      <div className="rounded-lg border p-6 space-y-4">
        <div className="h-5 w-36 bg-muted animate-pulse rounded" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-4 bg-muted animate-pulse rounded" style={{ width: `${85 - i * 10}%` }} />
          ))}
        </div>
      </div>
    </div>
  )
}
