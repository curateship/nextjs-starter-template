import { redirect } from 'next/navigation'

interface SiteToolsRouteProps {
  params: Promise<{
    siteId: string
  }>
}

export default async function SiteToolsRoute({ params }: SiteToolsRouteProps) {
  const { siteId } = await params

  redirect(`/admin/sites/${siteId}/settings?tab=cron-jobs`)
}
