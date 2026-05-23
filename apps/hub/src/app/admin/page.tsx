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
        router.replace("/admin/sites/new")
      }
    }
  }, [currentSite, loading, router])

  return null
}
