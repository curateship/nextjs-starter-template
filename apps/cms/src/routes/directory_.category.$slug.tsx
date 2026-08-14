import { createFileRoute, notFound } from "@tanstack/react-router"

import {
  DirectoryBreadcrumbs,
  type Crumb,
} from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { DirectoryPagination } from "@/components/directory/public/directory-pagination"
import { JsonLd } from "@/components/directory/public/json-ld"
import { ListingGrid } from "@/components/directory/public/listing-grid"
import { SubcategoryGrid } from "@/components/directory/public/subcategory-grid"
import { loadDirectoryCategory } from "@/lib/api/directory/public"
import { requirePageVisible } from "@/lib/api/content/pages"
import {
  categoryJsonLd,
  directoryDescription,
  directoryHead,
  directoryTitle,
} from "@/lib/directory/public-seo"
import { readPage } from "@/lib/nav/list-search"

/**
 * One category: what it is, the categories under it, and its listings.
 *
 * **Its own listings, never its children's.** A listing put in "Italian" does
 * not appear under "Restaurants" as well — that is what the directory app this
 * is ported from does, and rolling children up would put a listing on a page
 * nobody ever assigned it to. The subcategories are drawn as links instead, so
 * a visitor can walk down to them.
 */
export const Route = createFileRoute("/directory_/category/$slug")({
  // Only the page number. A category page has no search box and no order
  // control — it is one shelf, in the order an admin arranged it — so there is
  // nothing else for the address to carry. Optional, so a link to a category
  // does not have to say which page it means.
  validateSearch: (search: Record<string, unknown>): { page?: number } => ({
    page: readPage(search.page),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    // Follows the directory's own switch, like a listing page does.
    const [, page] = await Promise.all([
      requirePageVisible("/directory"),
      loadDirectoryCategory({ slug: params.slug, page: deps.page }),
    ])

    if (!page) throw notFound()
    return page
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return directoryHead(
      directoryTitle(loaderData.category.name, loaderData.site.name),
      directoryDescription(
        loaderData.category.metaDescription,
        loaderData.category.description,
        `${loaderData.category.name} on ${loaderData.site.name}.`
      ),
      loaderData.category.featuredImage
    )
  },
  component: CategoryRoute,
  // A visitor must never be shown the server's own words for a failure.
  errorComponent: DirectoryRouteError,
})

function CategoryRoute() {
  const {
    site,
    category,
    ancestors,
    children,
    listings,
    total,
    page,
    pageSize,
    browseTitle,
  } = Route.useLoaderData()

  const crumbs: Crumb[] = [
    { label: site.name, home: true },
    { label: browseTitle },
    // `ancestors` ends with this category itself, so the last one is the page
    // you are on and the breadcrumb draws it as plain text.
    ...ancestors.map((step) => ({
      label: step.name,
      categorySlug: step.slug,
    })),
  ]

  return (
    <DirectoryFrame>
      <JsonLd
        data={categoryJsonLd({
          siteName: site.name,
          siteUrl: site.url,
          name: category.name,
          slug: category.slug,
          // When a meta description exists, this is the exact sentence in
          // the page's meta tag. With none, keep today's structured markup.
          description: category.metaDescription
            ? directoryDescription(category.metaDescription)
            : category.description,
        })}
      />

      <DirectoryBreadcrumbs crumbs={crumbs} />

      {category.featuredImage ? (
        <img
          src={category.featuredImage}
          alt=""
          className="aspect-[3/1] w-full rounded-lg object-cover"
        />
      ) : null}

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{category.name}</h1>
        {category.description ? (
          <p className="text-sm text-muted-foreground">{category.description}</p>
        ) : null}
      </header>

      <SubcategoryGrid categoryName={category.name} categories={children} />

      <ListingGrid
        listings={listings}
        emptyMessage={
          children.length
            ? "Choose a subcategory above to see its listings."
            : `There is nothing in ${category.name} yet.`
        }
      />

      <DirectoryPagination
        page={page}
        pageSize={pageSize}
        total={total}
        hrefForPage={(next) =>
          `/directory/category/${encodeURIComponent(category.slug)}${next > 1 ? `?page=${next}` : ""}`
        }
      />
    </DirectoryFrame>
  )
}
