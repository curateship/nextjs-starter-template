import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { pages } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { notFound } from "next/navigation"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"
import { JsonLd } from "@/components/seo/JsonLd"

interface PagePageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function PagePage({ params }: PagePageProps) {
  const { slug } = await params

  const { success: siteSuccess, site } = await getSiteFromHeaders(slug)

  if (!siteSuccess || !site) {
    notFound()
  }

  return (
    <>
      <JsonLd site={site} contentType="page" />
      <BlockRenderer site={site} />
    </>
  )
}

export async function generateMetadata({ params }: PagePageProps) {
  const { slug } = await params

  try {
    const { success: siteSuccess, site } = await getSiteFromHeaders()

    if (!siteSuccess || !site) {
      return {
        title: 'Page Not Found',
        description: 'The requested page could not be found.',
      }
    }

    const [page] = await db
      .select()
      .from(pages)
      .where(
        and(
          eq(pages.siteId, site.id),
          eq(pages.slug, slug),
          eq(pages.isPublished, true)
        )
      )
      .limit(1)

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
