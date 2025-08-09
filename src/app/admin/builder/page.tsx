"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSiteContext } from "@/contexts/site-context"

export default function SiteBuilderPage() {
  const router = useRouter()
  const { currentSite, sites } = useSiteContext()

  useEffect(() => {
    // Immediately redirect to first available site or sites page
    if (currentSite) {
      router.replace(`/admin/builder/${currentSite.id}`)
    } else if (sites.length > 0) {
      router.replace(`/admin/builder/${sites[0].id}`)
    } else {
      router.replace('/admin/sites')
    }
  }, [currentSite, sites, router])

  // Return nothing - just redirect
  return null
}