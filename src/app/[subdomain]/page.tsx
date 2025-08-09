import { SiteContent } from "@/components/frontend/site-content"
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
    <SiteContent
      navigation={site.blocks.navigation}
      hero={site.blocks.hero}
      footer={site.blocks.footer}
    />
  )
}