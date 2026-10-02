import * as React from "react"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"

import { DirectoryBreadcrumbs } from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { JsonLd } from "@/components/directory/public/json-ld"
import { PostBody } from "@/components/posts/public/post-body"
import { PostContents } from "@/components/posts/public/post-contents"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadPost } from "@/lib/api/posts/public"
import { usePublicHeader } from "@/lib/branding"
import {
  directoryDescription,
  directoryHead,
  directoryTitle,
  postJsonLd,
} from "@/lib/directory/public-seo"
import { formatUtcDate } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { postHeadings } from "@/lib/posts/post-headings"

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
  const { site, post, listingCards, showCoverImage } = Route.useLoaderData()
  const headings = postHeadings(post.body)
  // Where the contents list stops when it sticks. A site that keeps its header
  // on screen needs the card below it, or its first line is drawn underneath.
  const stickyTop = usePublicHeader().sticky ? "lg:top-24" : "lg:top-4"

  const article = (
    <article className="grid gap-4">
      {showCoverImage && post.coverImage ? (
        <img
          src={post.coverImage}
          alt=""
          className="aspect-[3/1] w-full rounded-xl object-cover"
        />
      ) : null}
      <header className="grid gap-2">
        <h1 className="text-3xl font-semibold text-pretty md:text-4xl">
          {post.title}
        </h1>
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
          <p className="text-base text-muted-foreground">{post.summary}</p>
        ) : null}
      </header>
      <PostBody body={post.body} listingCards={listingCards} />
    </article>
  )

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

      {/* Two columns on a wide screen, the contents list on the right, the
          same split and the same ratio as a listing's page. A post with no
          headings has nothing to put there, so it is one column. */}
      {headings.length > 0 ? (
        <div
          className="grid items-start lg:grid-cols-[minmax(0,1.36fr)_minmax(16rem,0.64fr)]"
          // The space between the columns is the site's own, from Settings →
          // Public → Styling → Spacing, like every other gap on a public page.
          style={{ gap: pageGutter }}
        >
          {/* First in the page and second on a wide screen, which is where
              the old Directory app put it: on a phone the contents list sits
              above the post, and `order` moves it beside the words once the
              two fit side by side.

              It sticks while the post scrolls past it, stopping clear of the
              top of the window rather than touching it. */}
          <div
            className={`grid content-start lg:sticky lg:order-2 ${stickyTop}`}
          >
            <PostContents headings={headings} />
          </div>
          <div className="lg:order-1">{article}</div>
        </div>
      ) : (
        article
      )}
    </DirectoryFrame>
  )
}
