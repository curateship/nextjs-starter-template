import { SeoSettingsPage } from '@/components/admin/seo-settings/SeoSettingsPage'

interface SiteSeoSettingsRouteProps {
  params: Promise<{
    siteId: string
  }>
}

export default async function SiteSeoSettingsRoute({ params }: SiteSeoSettingsRouteProps) {
  const { siteId } = await params

  return <SeoSettingsPage siteId={siteId} />
}
