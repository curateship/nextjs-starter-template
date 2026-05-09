"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

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
        router.replace("/admin/sites/new")
      }
    }
  }, [currentSite, loading, router])

  // Show skeleton state while redirecting
  return (
    <div className="px-5 pt-[15px]">
      <div className="mb-6 mx-4 mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex h-8 items-center gap-2">
          <div className="h-4 w-10 bg-muted animate-pulse rounded" />
          <div className="h-4 w-4 bg-muted animate-pulse rounded" />
          <div className="h-5 w-36 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-9 w-[332px] max-w-full bg-muted animate-pulse rounded-md" />
      </div>

      <div className="grid">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 bg-muted animate-pulse rounded-full" />
                  <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                </div>
                <div className="h-4 w-14 bg-muted animate-pulse rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                <div className="mt-2 h-3 w-40 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="h-6 w-24 bg-muted animate-pulse rounded" />
              <div className="h-4 w-48 bg-muted animate-pulse rounded" />
            </div>
            <div className="h-9 w-[278px] max-w-full bg-muted animate-pulse rounded-md" />
          </CardHeader>
          <CardContent>
            <div className="h-[360px] w-full bg-muted animate-pulse rounded-md" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
