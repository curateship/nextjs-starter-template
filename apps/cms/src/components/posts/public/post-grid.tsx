import { Link } from "@tanstack/react-router"

import { Card, CardContent } from "@/components/ui/card"
import type { PublicPostCard } from "@/lib/api/posts/public"
import { formatUtcDate } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { publicCardHover } from "@/lib/layout/card-hover"
import { pageGutter } from "@/lib/layout/shell-gutter"

/**
 * The card grid for posts: the Posts page and the posts under a category.
 *
 * Dates are read in UTC so the server and the browser print the same day and
 * the page never redraws itself after loading.
 */
export function PostGrid({
  posts,
  emptyMessage,
}: {
  posts: PublicPostCard[]
  emptyMessage: string
}) {
  if (posts.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <ul
      className="grid sm:grid-cols-2 lg:grid-cols-3"
      style={{ gap: pageGutter }}
    >
      {posts.map((post) => (
        <li key={post.id} className="flex">
          <Card className={`group/card relative w-full ${publicCardHover}`}>
            {post.coverImage ? (
              <img
                src={post.coverImage}
                alt=""
                loading="lazy"
                className="aspect-[3/2] w-full object-cover transition-opacity duration-200 group-hover/card:opacity-75"
              />
            ) : null}
            <CardContent className="grid gap-1">
              <p className="text-xs text-muted-foreground">
                <time dateTime={post.publishedAt.toISOString()}>
                  {formatUtcDate(post.publishedAt)}
                </time>
              </p>
              <h2 className="text-base leading-snug font-medium">
                {/* The whole card is the link, the same as a listing card. */}
                <Link
                  to="/posts/$slug"
                  params={{ slug: post.slug }}
                  className={`after:absolute after:inset-0 ${focusRing}`}
                >
                  {post.title}
                </Link>
              </h2>
              {post.summary ? (
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {post.summary}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}
