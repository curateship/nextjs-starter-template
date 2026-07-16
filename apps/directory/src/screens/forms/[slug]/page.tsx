import { notFound } from "@/lib/navigation-server"
import { GuidedFormBlock } from "@/components/frontend/forms/GuidedFormBlock"
import { getPublicGuidedFormBySlug } from "@/lib/actions/guided-forms/guided-form-actions"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"

interface GuidedFormPageProps {
  params: Promise<{ slug: string }>
}

export default async function GuidedFormPage({ params }: GuidedFormPageProps) {
  const { slug } = await params
  const { success, site } = await getSiteFromHeaders()
  if (!success || !site) notFound()

  const formResult = await getPublicGuidedFormBySlug(site.id, slug)
  if (!formResult.data) notFound()

  return (
    <GuidedFormBlock
      siteId={site.id}
      preloadedForm={formResult.data}
      content={{
        title: formResult.data.headline,
        subtitle: formResult.data.subhead,
      }}
    />
  )
}

export async function generateMetadata({ params }: GuidedFormPageProps) {
  const { slug } = await params
  const { success, site } = await getSiteFromHeaders()
  if (!success || !site) {
    return { title: "Form Not Found" }
  }

  const formResult = await getPublicGuidedFormBySlug(site.id, slug)
  if (!formResult.data) {
    return { title: "Form Not Found" }
  }

  return {
    title: `${formResult.data.name} | ${site.name}`,
    description: formResult.data.subhead,
    ...buildSeoMetadata(site, {
      title: formResult.data.name,
      slug: `forms/${formResult.data.slug}`,
      metaDescription: formResult.data.subhead,
    } as any, "page", `/forms/${formResult.data.slug}`),
  }
}
