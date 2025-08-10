"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSiteContext } from "@/contexts/site-context"

export default function AdminDashboard() {
  const router = useRouter()
  const { currentSite, loading } = useSiteContext()

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

  // Show loading state while redirecting
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading dashboard...</p>
      </div>
    </div>
  )
}
