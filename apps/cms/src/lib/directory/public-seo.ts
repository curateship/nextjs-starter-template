import {
  LISTING_SHARE_IMAGE_HEIGHT,
  LISTING_SHARE_IMAGE_TYPE,
  LISTING_SHARE_IMAGE_WIDTH,
  listingShareImageUrl,
} from "@/lib/directory/listing-share-image"
import {
  cleanListingCoordinates,
  cleanListingGallery,
  cleanListingHours,
  LISTING_WEEKDAYS,
  LISTING_WEEKDAY_LABELS,
} from "@/lib/directory/listing-details"

/**
 * What a public directory page tells a browser and a search engine about
 * itself: the tab title, the description under it in a result, and the JSON-LD
 * block a search engine reads instead of guessing.
 *
 * Plain functions over plain values, so they can be checked without a browser
 * — `public-seo.test.ts` is most of the proof that a page says the right thing
 * about the right site.
 *
 * **Everything here is per site.** The site's own name is the only thing the
 * shell holds per site today, so it is what the titles are built from; there
 * is no per-site tagline or default description field yet, and adding one is a
 * change to the shell rather than to this app.
 */

/** The separator the shell's own titles use, so every tab reads the same. */
const TITLE_SEPARATOR = " · "

/** How long a description may be before a search engine cuts it anyway. */
const MAX_DESCRIPTION = 160

/**
 * A page's title: what the page is, then the site it belongs to. Blank parts
 * drop out, so a site with no name still gets a title rather than a stray
 * separator.
 */
export function directoryTitle(...parts: (string | null | undefined)[]) {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(TITLE_SEPARATOR)
}

/**
 * The description meta tag, cut at a length a result can show. The first
 * non-empty of what it is handed wins, so a listing's own line beats the
 * fallback the page would otherwise use.
 */
export function directoryDescription(
  ...candidates: (string | null | undefined)[]
) {
  const chosen =
    candidates.map((value) => value?.trim() ?? "").find(Boolean) ?? ""
  return chosen.length > MAX_DESCRIPTION
    ? `${chosen.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…`
    : chosen
}

type DirectoryHeadImage =
  | string
  | {
      url: string
      type?: string
      width?: number
      height?: number
    }

/** A listing photo first, otherwise its versioned drawn card. */
export function listingPageShareImage(input: {
  featuredImage: string
  siteUrl: string
  slug: string
  version: string
}): DirectoryHeadImage {
  if (input.featuredImage) return input.featuredImage
  return {
    url: listingShareImageUrl(input.siteUrl, input.slug, input.version),
    type: LISTING_SHARE_IMAGE_TYPE,
    width: LISTING_SHARE_IMAGE_WIDTH,
    height: LISTING_SHARE_IMAGE_HEIGHT,
  }
}

/** The meta tags a public page adds, in the shape a route's `head` wants. */
export function directoryHead(
  title: string,
  description: string,
  image: DirectoryHeadImage = ""
) {
  const imageUrl = typeof image === "string" ? image : image.url
  return {
    links: [
      {
        rel: "alternate",
        type: "application/rss+xml",
        title: "New listings",
        href: "/feed.xml",
      },
    ],
    meta: [
      { title },
      ...(description
        ? [
            { name: "description", content: description },
            { property: "og:title", content: title },
            { property: "og:description", content: description },
            {
              name: "twitter:card",
              content: imageUrl ? "summary_large_image" : "summary",
            },
          ]
        : []),
      ...(imageUrl
        ? [
            { property: "og:image", content: imageUrl },
            ...(typeof image === "string" || !image.type
              ? []
              : [{ property: "og:image:type", content: image.type }]),
            ...(typeof image === "string" || image.width === undefined
              ? []
              : [{ property: "og:image:width", content: String(image.width) }]),
            ...(typeof image === "string" || image.height === undefined
              ? []
              : [
                  {
                    property: "og:image:height",
                    content: String(image.height),
                  },
                ]),
            { name: "twitter:image", content: imageUrl },
          ]
        : []),
    ],
  }
}

/** An absolute address on this site, for anything a search engine reads. */
export function siteUrlFor(siteUrl: string, path: string) {
  return `${siteUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`
}

type JsonLdNode = Record<string, unknown>

/**
 * The JSON-LD for one listing: who runs the site, and what this page is.
 *
 * Two things rather than one: the Organization ties every page on a site
 * together, and the second node describes this listing. A map pin supplies the
 * concrete location needed for LocalBusiness; without one the exact old
 * WebPage shape remains, so a listing never claims facts it cannot support.
 */
export function listingJsonLd(input: {
  siteName: string
  siteUrl: string
  title: string
  slug: string
  description: string
  image: string
  gallery?: unknown
  hours?: unknown
  address?: string
  latitude?: number | null
  longitude?: number | null
  createdAt: Date | string
  updatedAt: Date | string
}): JsonLdNode {
  const coordinates = cleanListingCoordinates(input.latitude, input.longitude)
  const page: JsonLdNode = {
    "@type": coordinates ? "LocalBusiness" : "WebPage",
    name: input.title,
    url: siteUrlFor(input.siteUrl, `/directory/${input.slug}`),
  }
  if (input.description) page.description = input.description
  const images = cleanListingGallery([
    input.image,
    ...cleanListingGallery(input.gallery),
  ])
  if (images.length) page.image = coordinates ? images : images[0]
  if (coordinates) {
    page.geo = {
      "@type": "GeoCoordinates",
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    }
    if (input.address?.trim()) page.address = input.address.trim()
    const specifications = openingHoursSpecifications(input.hours)
    if (specifications.length) page.openingHoursSpecification = specifications
  }
  page.datePublished = asDate(input.createdAt)
  page.dateModified = asDate(input.updatedAt)

  return graph([organisationJsonLd(input.siteName, input.siteUrl), page])
}

function openingHoursSpecifications(hours: unknown) {
  const cleaned = cleanListingHours(hours)
  return LISTING_WEEKDAYS.flatMap((day) => {
    const value = cleaned[day]
    return value
      ? [
          {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: `https://schema.org/${LISTING_WEEKDAY_LABELS[day]}`,
            opens: value.open,
            closes: value.close,
          },
        ]
      : []
  })
}

/** The same for a category page: the site, and the list this page is. */
export function categoryJsonLd(input: {
  siteName: string
  siteUrl: string
  name: string
  slug: string
  description: string
}): JsonLdNode {
  const page: JsonLdNode = {
    "@type": "CollectionPage",
    name: input.name,
    url: siteUrlFor(input.siteUrl, `/directory/category/${input.slug}`),
  }
  if (input.description) page.description = input.description

  return graph([organisationJsonLd(input.siteName, input.siteUrl), page])
}

function organisationJsonLd(siteName: string, siteUrl: string): JsonLdNode {
  return { "@type": "Organization", name: siteName, url: siteUrl }
}

function graph(nodes: JsonLdNode[]): JsonLdNode {
  return { "@context": "https://schema.org", "@graph": nodes }
}

function asDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value
}

/**
 * The JSON-LD as the text of a `<script>` tag.
 *
 * `<` is escaped because that is the one character that could end the script
 * tag early and turn data into markup — a listing whose title contained
 * `</script><img onerror=…>` would otherwise be running code rather than
 * describing a page. JSON escaping alone does not do it, because `<` is a
 * perfectly legal character in a JSON string.
 */
export function jsonLdText(data: JsonLdNode) {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
