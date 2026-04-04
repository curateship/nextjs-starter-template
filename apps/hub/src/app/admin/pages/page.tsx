"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSiteSwitcher } from "@/components/admin/providers/site-switcher-provider"

export default function PageBuilderPage() {
  const router = useRouter()
  const { currentSite, sites } = useSiteSwitcher()

  useEffect(() => {
    // Immediately redirect to first available site or sites page
    if (currentSite) {
      router.replace(`/admin/pages/${currentSite.id}`)
    } else if (sites.length > 0) {
      router.replace(`/admin/pages/${sites[0].id}`)
    } else {
      router.replace('/admin/sites')
    }
  }, [currentSite, sites, router])

  // Return nothing - just redirect
  return null
}