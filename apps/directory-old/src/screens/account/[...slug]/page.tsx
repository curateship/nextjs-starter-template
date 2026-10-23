import { renderAccountPage } from "../account-page-route"

interface AccountSlugPageProps {
  params: Promise<{
    slug: string[]
  }>
}

export default async function AccountSlugPage({ params }: AccountSlugPageProps) {
  const { slug } = await params
  return renderAccountPage(slug)
}
