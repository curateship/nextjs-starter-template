"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { useSiteContext } from "@/contexts/site-context"
import { Calendar } from "lucide-react"

export default function EventBuilderRootPage() {
  const router = useRouter()
  const { currentSite } = useSiteContext()

  // Redirect to current site event builder if site is available
  useEffect(() => {
    if (currentSite) {
      router.push(`/admin/events/builder/${currentSite.id}`)
    }
  }, [currentSite, router])

  // Show loading state while site context loads
  return (
    <AdminLayout noPadding>
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Calendar className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p>Loading...</p>
        </div>
      </div>
    </AdminLayout>
  )
}
