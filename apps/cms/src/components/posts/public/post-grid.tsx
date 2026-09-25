import { Link } from "@tanstack/react-router"

import { CategoryPill } from "@/components/shared/card-chips"
import { Card, CardContent } from "@/components/ui/card"
import type { PublicPostCard } from "@/lib/api/posts/public"
import { formatUtcDate } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { publicCardHover } from "@/lib/layout/card-hover"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { mediaImageSrcSet } from "@/lib/media/image-sizes"
import { cn } from "@/lib/utils"

/**
 * The card grid for posts: the Posts page, the posts under a category, and a
 * home page row.
 *
 * Dates are read in UTC so the server and the browser print the same day and
 * the page never redraws itself after loading.
 */
export function PostGrid({
  posts,
  siteName,
  emptyMessage,
}: {
  posts: PublicPostCard[]
  /** Printed under each card, where a byline would be. Posts have no author. */
  siteName: string
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
      // The site's own gutter from Settings → Styling, the same as every other
      // public grid.
      style={{ gap: pageGutter }}
    >
      {posts.map((post) => (
        <li key={post.id}>
          <PostCard post={post} siteName={siteName} />
        </li>
      ))}
    </ul>
  )
}

/** "4 min read", over the top-right of the photo. */
function ReadTimeChip({ minutes }: { minutes: number }) {
  return (
    <span className="shrink-0 rounded-full bg-foreground/70 px-2.5 py-1 text-xs font-medium text-background">
      {minutes} min read
    </span>
  )
}

function PostCard({
  post,
  siteName,
}: {
  post: PublicPostCard
  siteName: string
}) {
  return (
    <Card
      className={cn(
        `relative w-full ${publicCardHover}`,
        // The photo runs to the card's edges with the title on it, so the card
        // keeps no padding of its own around the picture.
        post.coverImage && "gap-0 py-0"
      )}
    >
      {post.coverImage ? (
        <div className="relative">
          <img
            src={post.coverImage}
            srcSet={mediaImageSrcSet(post.coverImage)}
            sizes="(min-width: 640px) 50vw, 100vw"
            alt=""
            loading="lazy"
            className="aspect-[4/5] w-full object-cover"
          />
          {/*
           * The title is white and the photo under it is whatever was
           * uploaded, so this shade is what makes the words readable rather
           * than the photo happening to be dark. It rises from the bottom and
           * covers rather more than the title, because a two-line one needs
           * the room.
           */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
          />
          <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2">
            {post.category ? <CategoryPill name={post.category.name} /> : null}
            <ReadTimeChip minutes={post.readMinutes} />
          </div>
          <div className="absolute inset-x-0 bottom-0 grid gap-3 p-4">
            <h2 className="text-lg leading-snug font-semibold text-white">
              {/* The whole card is the link, the same as a listing card. */}
              <Link
                to="/posts/$slug"
                params={{ slug: post.slug }}
                className={`after:absolute after:inset-0 ${focusRing}`}
              >
                {post.title}
              </Link>
            </h2>
            {/* The dividing line and the two labels sit on the picture rather
                than under it, which is what the design does. The line names a
                shade because it is drawn on a photograph: the Divider lines
                setting is for lines on the page's own background, and at its
                default this one would be invisible against the shade. */}
            <div className="flex items-baseline justify-between gap-2 border-t border-white/25 pt-3 text-sm text-white/80">
              <span className="min-w-0 truncate">{siteName}</span>
              <time dateTime={post.publishedAt.toISOString()}>
                {formatUtcDate(post.publishedAt)}
              </time>
            </div>
          </div>
        </div>
      ) : (
        <CardContent className="grid gap-1">
          {/* A post with no photo has nowhere for the two chips, so they go
              above the title rather than vanishing, and the summary takes the
              place the picture would have had. */}
          <div className="flex flex-wrap items-center gap-2">
            {post.category ? (
              <CategoryPill name={post.category.name} tone="plain" />
            ) : null}
            <ReadTimeChip minutes={post.readMinutes} />
          </div>
          <h2 className="text-lg leading-snug font-semibold">
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
          <p className="flex items-baseline justify-between gap-2 border-t pt-3 text-sm text-muted-foreground">
            <span className="min-w-0 truncate">{siteName}</span>
            <time dateTime={post.publishedAt.toISOString()}>
              {formatUtcDate(post.publishedAt)}
            </time>
          </p>
        </CardContent>
      )}
    </Card>
  )
}
