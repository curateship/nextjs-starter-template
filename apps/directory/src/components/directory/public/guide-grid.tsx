import { Link } from "@tanstack/react-router"

import { Card, CardContent } from "@/components/ui/card"
import { guidePlacesText, type PublicGuideCard } from "@/lib/directory/guides"
import { publicGridColumnsClassName } from "@/lib/layout/grid-columns"
import { publicCardHover } from "@/lib/layout/card-hover"
import { focusRing } from "@/lib/layout/focus-ring"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { mediaImageSrcSet } from "@/lib/media/image-sizes"
import { cn } from "@/lib/utils"

/**
 * The cards on the Guides page and in a front page row of the newest guides:
 * the cover, the title, the first lines of the intro and how many places a
 * visitor will find in it. The whole card is the link, the way a post card is.
 */
export function GuideGrid({
  guides,
  emptyMessage,
  columns,
}: {
  guides: PublicGuideCard[]
  emptyMessage: string
  /** A home page row's own column count. The Guides page names none. */
  columns?: number
}) {
  if (guides.length === 0) {
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
      // `w-full` because a home page row lines its children up from the left.
      className={cn(
        "grid w-full",
        publicGridColumnsClassName(columns, "sm:grid-cols-2 lg:grid-cols-3")
      )}
      // The site's own gutter from Settings → Styling, like every public grid.
      style={{ gap: pageGutter }}
    >
      {guides.map((guide) => (
        <li key={guide.id}>
          <Card
            className={cn(
              `relative h-full w-full ${publicCardHover}`,
              // The cover runs to the card's edges, so it keeps no padding above.
              guide.coverImage && "pt-0"
            )}
          >
            {guide.coverImage ? (
              <img
                src={guide.coverImage}
                srcSet={mediaImageSrcSet(guide.coverImage)}
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
            ) : null}
            <CardContent className="grid gap-1">
              <h2 className="text-lg leading-snug font-semibold">
                <Link
                  to="/guides/$slug"
                  params={{ slug: guide.slug }}
                  className={`after:absolute after:inset-0 ${focusRing}`}
                >
                  {guide.title}
                </Link>
              </h2>
              {guide.intro ? (
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {guide.intro}
                </p>
              ) : null}
              <p className="pt-2 text-sm text-muted-foreground">
                {guidePlacesText(guide.places)}
              </p>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}
