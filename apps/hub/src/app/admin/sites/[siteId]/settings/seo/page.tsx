import { redirect } from 'next/navigation'

interface SiteSeoSettingsRouteProps {
  params: Promise<{
    siteId: string
  }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SiteSeoSettingsRoute({ params, searchParams }: SiteSeoSettingsRouteProps) {
  const { siteId } = await params
  const resolvedSearchParams = await searchParams
  const tab = resolvedSearchParams.tab

  redirect(`/admin/sites/${siteId}/settings/site-tools${typeof tab === 'string' ? `?tab=${tab}` : ''}`)
}
