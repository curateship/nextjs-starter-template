import { notFound } from 'next/navigation'
import { SiteContentTypeSettingsPage } from '@/components/admin/layout/settings/SiteContentTypeSettingsPage'
import { getSiteSettingsContentTypeBySlug } from '@/components/admin/layout/settings/site-settings-content-types'

interface SiteContentTypeSettingsRouteProps {
  params: Promise<{
    siteId: string
    contentType: string
  }>
}

export default async function SiteContentTypeSettingsRoute({
  params,
}: SiteContentTypeSettingsRouteProps) {
  const { siteId, contentType } = await params
  const config = getSiteSettingsContentTypeBySlug(contentType)

  if (!config) {
    notFound()
  }

  return <SiteContentTypeSettingsPage siteId={siteId} contentTypeSlug={contentType} />
}
