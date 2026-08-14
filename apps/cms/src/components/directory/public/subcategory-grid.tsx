import { Link } from "@tanstack/react-router"

import { Card, CardContent } from "@/components/ui/card"
import type { PublicCategory } from "@/lib/api/directory/public"
import { plural } from "@/lib/format/plural"
import { focusRing } from "@/lib/layout/focus-ring"

/** The categories directly below a public category, using the listing grid's card shape. */
export function SubcategoryGrid({
  categoryName,
  categories,
}: {
  categoryName: string
  categories: PublicCategory[]
}) {
  if (categories.length === 0) return null

  return (
    <section className="grid gap-2 md:gap-3">
      <h2 className="text-lg font-semibold">Explore {categoryName}</h2>
      <ul className="grid gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-3">
        {categories.map((category) => (
          <li key={category.id} className="flex">
            <Card className="group/card relative w-full transition-colors hover:bg-accent/40">
              {category.featuredImage ? (
                <div className="overflow-hidden">
                  <img
                    src={category.featuredImage}
                    alt=""
                    loading="lazy"
                    className="aspect-[3/2] w-full object-cover transition-opacity duration-200 group-hover/card:opacity-75"
                  />
                </div>
              ) : null}
              <CardContent className="grid gap-1">
                <h3 className="text-base leading-snug font-medium">
                  <Link
                    to="/directory/category/$slug"
                    params={{ slug: category.slug }}
                    className={`after:absolute after:inset-0 ${focusRing}`}
                  >
                    {category.name}
                  </Link>
                </h3>
                <p className="text-xs text-muted-foreground">
                  {category.listingCount.toLocaleString()}{" "}
                  {plural(category.listingCount, "listing")}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}
