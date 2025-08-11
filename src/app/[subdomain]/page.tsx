import { BlockRenderer } from "@/components/frontend/layout/block-renderer"
import { getSiteBySubdomain } from "@/lib/actions/frontend-actions"
import { notFound } from "next/navigation"

interface DynamicSitePageProps {
  params: Promise<{ subdomain: string }>
}

export default async function DynamicSitePage({ params }: DynamicSitePageProps) {
  const { subdomain } = await params
  
  // Get site data
  const { success, site, error } = await getSiteBySubdomain(subdomain)
  
  if (!success || !site) {
    notFound()
  }

  return (
    <BlockRenderer
      site={site}
    />
  )
}