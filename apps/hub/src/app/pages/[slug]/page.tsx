import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { notFound } from "next/navigation"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"
import { StructuredData } from "@/components/frontend/seo/StructuredData"

interface PagePageProps {
  params: Promise<{
    slug: string
  }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getListingPage(searchParams?: Record<string, string | string[] | undefined>) {
  const value = searchParams?.page
  const page = parseInt(Array.isArray(value) ? value[0] || "1" : value || "1", 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

export default async function PagePage({ params, searchParams }: PagePageProps) {
  const { slug } = await params

  const { success: siteSuccess, site } = await getSiteFromHeaders(slug, {
    listingPage: getListingPage(await searchParams),
  })

  if (!siteSuccess || !site) {
    notFound()
  }

  return (
    <>
      <StructuredData site={site} contentType="page" />
      <BlockRenderer site={site} />
    </>
  )
}

export async function generateMetadata({ params }: PagePageProps) {
  const { slug } = await params

  try {
    const { success: siteSuccess, site } = await getSiteFromHeaders(slug)

    if (!siteSuccess || !site) {
      return {
        title: 'Page Not Found',
        description: 'The requested page could not be found.',
      }
    }

    const page = site.page

    if (!page) {
      return {
        title: 'Page Not Found',
        description: 'The requested page could not be found.',
      }
    }

    return {
      title: `${page.title} | ${site.name}`,
      description: page.metaDescription || `Visit ${page.title} on ${site.name}`,
      ...buildSeoMetadata(site, page as any, 'page', `/pages/${slug}`),
    }
  } catch (error) {
    return {
      title: 'Page Not Found',
      description: 'The requested page could not be found.',
    }
  }
}
