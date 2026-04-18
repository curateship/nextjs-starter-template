"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"

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

  // Return nothing - just redirect
  return null
}
