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

  return {
    "@context": "https://schema.org",
    "@graph": [organization, page],
  }
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
