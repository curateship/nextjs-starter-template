import { Breadcrumb } from "@/components/admin/structure-builder/Breadcrumb"

interface PageProps {
  params: Promise<{
    siteId: string
  }>
}

export default async function SiteBreadcrumbsPage({ params }: PageProps) {
  const { siteId } = await params

  return <Breadcrumb siteId={siteId} />
}
