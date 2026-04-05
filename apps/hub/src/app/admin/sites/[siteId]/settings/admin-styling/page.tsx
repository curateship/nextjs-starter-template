import { SiteAdminStylingSettingsPage } from '@/components/admin/layout/settings/SiteAdminStylingSettingsPage'

interface SiteAdminStylingSettingsRouteProps {
  params: Promise<{
    siteId: string
  }>
}

export default async function SiteAdminStylingSettingsRoute({
  params,
}: SiteAdminStylingSettingsRouteProps) {
  const { siteId } = await params

  return <SiteAdminStylingSettingsPage siteId={siteId} />
}
