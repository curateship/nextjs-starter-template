import { notFound, redirect } from 'next/navigation'
import { getUserPageBySlug } from '@/lib/actions/user-pages/user-pages-frontend-actions'
import { BlockRenderer } from '@/components/frontend/pages/PageBlockRenderer'
import { getSiteFromHeaders } from '@/lib/utils/site-resolver'
import { headers } from 'next/headers'
import { getSessionCookie } from 'better-auth/cookies'

interface UserPageProps {
  params: Promise<{
    slug?: string[]
  }>
}

export default async function UserPage({ params }: UserPageProps) {
  const { slug } = await params
  const pageSlug = slug?.[0] || 'home'
  const isLoggedIn = !!getSessionCookie(await headers())

  const { success: siteSuccess, site } = await getSiteFromHeaders()
  if (!siteSuccess || !site?.id) {
    notFound()
  }

  // Fetch user page data
  const { data, error } = await getUserPageBySlug(site.id, pageSlug)

  if (error || !data) {
    if (error === 'Authentication required') {
      redirect('/login')
    }
    notFound()
  }

  return <BlockRenderer site={data} initialHasSession={isLoggedIn} />
}
