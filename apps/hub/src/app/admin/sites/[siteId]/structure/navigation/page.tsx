import { SiteChromeEditorPage } from "@/components/admin/layout/builder/SiteChromeEditorPage"
import { getPublicAuthPagePath } from "@/lib/actions/pages/page-frontend-actions"

interface PageProps {
  params: Promise<{
    siteId: string
  }>
}

export default async function SiteNavigationStructurePage({
  params,
}: PageProps) {
  const { siteId } = await params
  const { path: publicAuthPagePath } = await getPublicAuthPagePath(siteId)

  return (
    <SiteChromeEditorPage
      siteId={siteId}
      mode="navigation"
      publicAuthPagePath={publicAuthPagePath}
    />
  )
}
