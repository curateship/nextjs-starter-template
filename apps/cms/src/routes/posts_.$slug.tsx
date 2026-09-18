import * as React from "react"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"

import { DirectoryBreadcrumbs } from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { JsonLd } from "@/components/directory/public/json-ld"
import { PostBody } from "@/components/posts/public/post-body"
import { Card, CardContent } from "@/components/ui/card"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadPost } from "@/lib/api/posts/public"
import {
  directoryDescription,
  directoryHead,
  directoryTitle,
  postJsonLd,
} from "@/lib/directory/public-seo"
import { formatUtcDate } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * One post's page at /posts/<address>. It follows the Posts page's on/off
 * switch.
 *
 * No such address, a draft, and another site's post all answer the same
 * not-found page, so a draft cannot be told apart from a post never written.
 */
export const Route = createFileRoute("/posts_/$slug")({
  loader: async ({ params }) => {
    const [, page] = await Promise.all([
      requirePageVisible("/posts"),
      loadPost(params.slug),
    ])
    if (!page) throw notFound()
    return page
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { post, site } = loaderData
    return directoryHead(
      directoryTitle(post.title, site.name),
      directoryDescription(post.summary, `${post.title} on ${site.name}.`),
      post.coverImage
    )
  },
  component: PostRoute,
  // A visitor must never be shown the server's own words for a failure.
  errorComponent: DirectoryRouteError,
})

function PostRoute() {
  const { site, post, listingCards } = Route.useLoaderData()

  return (
    <DirectoryFrame>
      <JsonLd
        data={postJsonLd({
          siteName: site.name,
          siteUrl: site.url,
          title: post.title,
          slug: post.slug,
          summary: post.summary,
          image: post.coverImage,
          publishedAt: post.publishedAt,
          updatedAt: post.updatedAt,
        })}
      />

      <DirectoryBreadcrumbs
        crumbs={[
          { label: site.name, home: true },
          { label: "Posts", posts: true },
          { label: post.title },
        ]}
      />

      <Card>
        {post.coverImage ? (
          <img
            src={post.coverImage}
            alt=""
            className="aspect-[3/1] w-full object-cover"
          />
        ) : null}
        <CardContent className="grid gap-4">
          <header className="grid gap-1">
            <h1 className="text-2xl font-semibold">{post.title}</h1>
            {/* Inline text rather than a flex row, so it follows the site's
                own text alignment like the lines around it. */}
            <p className="text-xs text-muted-foreground">
              <time dateTime={post.publishedAt.toISOString()}>
                {formatUtcDate(post.publishedAt)}
              </time>
              {post.categories.map((category) => (
                <React.Fragment key={category.slug}>
                  {" · "}
                  <Link
                    to="/directory/category/$slug"
                    params={{ slug: category.slug }}
                    search={{}}
                    className={`rounded-sm hover:text-foreground hover:underline ${focusRing}`}
                  >
                    {category.name}
                  </Link>
                </React.Fragment>
              ))}
            </p>
            {post.summary ? (
              <p className="text-sm text-muted-foreground">{post.summary}</p>
            ) : null}
          </header>
          <PostBody body={post.body} listingCards={listingCards} />
        </CardContent>
      </Card>
    </DirectoryFrame>
  )
}
