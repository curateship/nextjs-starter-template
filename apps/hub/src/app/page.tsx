import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { isHubPlatformHost } from "@/lib/utils/platform-host"
import { redirect } from "next/navigation"
import Link from "next/link"
import { headers } from "next/headers"
import { getSessionCookie } from "better-auth/cookies"
import { toCdnUrl } from "@/lib/utils/cdn"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"
import { StructuredData } from "@/components/frontend/seo/StructuredData"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function getListingPage(searchParams?: Record<string, string | string[] | undefined>) {
  const value = searchParams?.page
  const page = parseInt(Array.isArray(value) ? value[0] || "1" : value || "1", 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

async function getHomePageSite(listingPage = 1) {
  return await getSiteFromHeaders('home', { listingPage })
}

async function checkAuth() {
  return !!getSessionCookie(await headers())
}

async function isHubHomeRequest() {
  const requestHeaders = await headers()
  return isHubPlatformHost(requestHeaders.get("host"))
}

function HubPlatformHome() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-16 sm:px-10">
        <div className="max-w-2xl">
          <p className="mb-4 text-sm font-medium uppercase text-zinc-400">
            System Everything
          </p>
          <h1 className="text-4xl font-semibold tracking-normal text-white sm:text-6xl">
            Hub platform
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
            The canonical admin home for managing sites, content, users, commerce, and platform settings.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="inline-flex h-11 items-center justify-center rounded-md bg-white px-5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
            >
              Open admin
            </Link>
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-700 px-5 text-sm font-medium text-white transition hover:bg-zinc-900"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

export default async function SiteHomePage({ searchParams }: { searchParams?: SearchParams }) {
  if (await isHubHomeRequest()) {
    return <HubPlatformHome />
  }

  const { success, site } = await getHomePageSite(getListingPage(await searchParams))
  const isLoggedIn = await checkAuth()

  // No site found for this host — redirect to login
  if (!success || !site) {
    redirect('/login')
  }

  // Check maintenance mode - only redirect if not logged in
  if (site.settings?.maintenance?.enabled === true) {
    if (!isLoggedIn) {
      redirect('/maintenance')
    }
  }

  // Find hero image for LCP preload
  const heroBlock = site.blocks?.find(block => block.type === 'hero')
  const heroStyle = heroBlock?.content?.heroStyle || 'default'
  const heroImage = heroBlock?.content?.styleConfig?.[heroStyle]?.heroImage || heroBlock?.content?.heroImage
  const lcpImageUrl = heroImage ? toCdnUrl(heroImage) : null

  return (
    <>
      {lcpImageUrl && (
        <link rel="preload" as="image" href={lcpImageUrl} fetchPriority="high" />
      )}
      <StructuredData site={site} contentType="home" />
      <BlockRenderer site={site} />
    </>
  )
}

export async function generateMetadata() {
  try {
    if (await isHubHomeRequest()) {
      return {
        title: 'System Everything Hub',
        description: 'Platform admin home for System Everything.',
      }
    }

    const { success, site } = await getHomePageSite()

    if (!success || !site) {
      return {
        title: 'System Everything',
        description: 'A platform for building and managing websites, stores, and content.',
      }
    }

    return buildSeoMetadata(site, null, 'home', '/')
  } catch (error) {
    return {
      title: 'Site Not Found',
      description: 'The requested site could not be found.',
    }
  }
}
