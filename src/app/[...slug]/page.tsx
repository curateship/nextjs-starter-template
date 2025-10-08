import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { createClient } from '@supabase/supabase-js'
import { notFound, redirect } from "next/navigation"
import { cookies } from "next/headers"

// Create admin client for direct database queries
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

async function checkAuth() {
  // Check for Supabase auth cookie without hitting the database
  // This is much faster than calling getUser()
  const cookieStore = await cookies()
  const authCookies = cookieStore.getAll().filter(cookie =>
    cookie.name.includes('sb-') && cookie.name.includes('-auth-token')
  )
  return authCookies.length > 0 && authCookies.some(c => c.value && c.value.length > 0)
}

interface CatchAllPageProps {
  params: Promise<{ 
    slug: string[]
  }>
}

export default async function CatchAllPage({ params }: CatchAllPageProps) {
  const { slug } = await params
  const fullSlug = slug.join('/')

  // Get site data from headers with page slug to load page data
  const { success: siteSuccess, site } = await getSiteFromHeaders(fullSlug)

  if (!siteSuccess || !site) {
    notFound()
  }

  // Check maintenance mode - only redirect if not logged in
  if (site.settings?.maintenance?.enabled === true) {
    const isLoggedIn = await checkAuth()
    if (!isLoggedIn) {
      redirect('/maintenance')
    }
  }

  // First check if this is a page
  const { data: page } = await supabaseAdmin
    .from('pages')
    .select('*')
    .eq('site_id', site.id)
    .eq('slug', fullSlug)
    .eq('is_published', true)
    .single()

  if (page) {
    // Page exists, render it at root level
    return <BlockRenderer site={site} />
  }
  
}