import { SeoSettingsPage } from '@/components/admin/seo-settings/SeoSettingsPage'

interface SiteToolsRouteProps {
  params: Promise<{
    siteId: string
  }>
}

export default async function SiteToolsRoute({ params }: SiteToolsRouteProps) {
  const { siteId } = await params

  return <SeoSettingsPage siteId={siteId} />
}
