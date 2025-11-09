import { notFound, redirect } from 'next/navigation'
import { getUserPageBySlug, getCurrentUserSiteId } from '@/lib/actions/user-pages/user-pages-frontend-actions'
import { BlockRenderer } from '@/components/frontend/pages/PageBlockRenderer'

interface UserPageProps {
  params: Promise<{
    slug?: string[]
  }>
}

export default async function UserPage({ params }: UserPageProps) {
  const { slug } = await params
  const pageSlug = slug?.[0] || 'home'

  // Get current user's site ID
  const { siteId, error: siteError } = await getCurrentUserSiteId()

  if (siteError || !siteId) {
    // Redirect to login if not authenticated
    redirect('/auth/login')
  }

  // Fetch user page data
  const { data, error } = await getUserPageBySlug(siteId, pageSlug)

  if (error || !data) {
    notFound()
  }

  return <BlockRenderer site={data} />
}
