type StructuredDataNode = Record<string, unknown>

export type PublicStructuredDataInput = {
  organization: {
    name?: string | null
    url?: string | null
    logo?: string | null
    socialProfiles?: readonly (string | null | undefined)[]
  }
  page: {
    name?: string | null
    url?: string | null
    description?: string | null
  }
  /**
   * The visible breadcrumb trail, front page first, when one is shown. The
   * same list the page draws, so what a search engine reads and what a visitor
   * sees cannot say two different things. A step with no address is the page
   * itself, which `BreadcrumbList` allows.
   */
  breadcrumbs?: readonly { name?: string | null; url?: string | null }[]
}

/** Describes the site and one public page without inventing missing details. */
export function publicStructuredData(
  input: PublicStructuredDataInput
): StructuredDataNode {
  const organization: StructuredDataNode = { "@type": "Organization" }
  addText(organization, "name", input.organization.name)
  addUrl(organization, "url", input.organization.url)
  addUrl(organization, "logo", input.organization.logo)

  const socialProfiles = uniqueWebUrls(input.organization.socialProfiles ?? [])
  if (socialProfiles.length) organization.sameAs = socialProfiles

  const page: StructuredDataNode = { "@type": "WebPage" }
  addText(page, "name", input.page.name)
  addUrl(page, "url", input.page.url)
  addText(page, "description", input.page.description)

  const graph: StructuredDataNode[] = [organization, page]

  const breadcrumbs = breadcrumbList(input.breadcrumbs ?? [])
  if (breadcrumbs) graph.push(breadcrumbs)

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  }
}

/**
 * The trail as a `BreadcrumbList`, or null when there is nothing to describe.
 *
 * One step is not a trail, so it is left out rather than published as a list
 * of one. A step whose name is blank drops the whole list: positions have to
 * run 1, 2, 3 without a hole in them.
 */
function breadcrumbList(
  steps: readonly { name?: string | null; url?: string | null }[]
) {
  if (steps.length < 2) return null

  const items: StructuredDataNode[] = []
  for (const step of steps) {
    const item: StructuredDataNode = {
      "@type": "ListItem",
      position: items.length + 1,
    }
    addText(item, "name", step.name)
    if (!item.name) return null
    addUrl(item, "item", step.url)
    items.push(item)
  }

  return { "@type": "BreadcrumbList", itemListElement: items }
}

/** Safe raw text for an application/ld+json script element. */
export function publicStructuredDataText(input: PublicStructuredDataInput) {
  return JSON.stringify(publicStructuredData(input)).replace(/</g, "\\u003c")
}

export function publicPageUrl(origin: string, path: string) {
  const normalizedOrigin = webUrl(origin)
  if (!normalizedOrigin) return ""

  try {
    const page = new URL(
      path.startsWith("/") ? path : `/${path}`,
      normalizedOrigin
    )
    return page.origin === new URL(normalizedOrigin).origin ? page.href : ""
  } catch {
    return ""
  }
}

function addText(
  target: StructuredDataNode,
  key: string,
  value: string | null | undefined
) {
  const cleaned = value?.replace(/\s+/g, " ").trim() ?? ""
  if (cleaned) target[key] = cleaned
}

function addUrl(
  target: StructuredDataNode,
  key: string,
  value: string | null | undefined
) {
  const cleaned = webUrl(value)
  if (cleaned) target[key] = cleaned
}

function uniqueWebUrls(values: readonly (string | null | undefined)[]) {
  return [...new Set(values.map(webUrl).filter(Boolean))]
}

function webUrl(value: string | null | undefined) {
  if (!value?.trim()) return ""
  try {
    const url = new URL(value.trim())
    return (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
      ? url.href
      : ""
  } catch {
    return ""
  }
}
