import { SiteToolsPage } from '@/components/admin/seo-settings/SiteToolsPage'

interface SiteToolsRouteProps {
  params: Promise<{
    siteId: string
  }>
}

export default async function SiteToolsRoute({ params }: SiteToolsRouteProps) {
  const { siteId } = await params

  return <SiteToolsPage siteId={siteId} />
}
