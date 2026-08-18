import { Link } from "@tanstack/react-router"

import { Card, CardContent } from "@/components/ui/card"
import type { DirectoryCategoryCard } from "@/lib/directory/category-cards"
import { plural } from "@/lib/format/plural"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * The card grid every row of categories uses: underneath a parent category, on a
 * site's home page, and at the top of the browse page.
 *
 * One component so all three read the same, the way `ListingGrid` is one
 * component for every row of listings. It draws the cards and nothing else — the
 * heading above them belongs to whoever placed the row, because each of the three
 * says something different ("Explore Eat", "Browse by category", or the words an
 * admin typed).
 *
 * A card is only ever drawn for a category with something published under it.
 * That is decided where the cards are read, not here: an invitation to an empty
 * shelf is worse than one card fewer, and a component cannot know what "empty"
 * means for the row it is in.
 */
export function CategoryGrid({
  categories,
}: {
  categories: DirectoryCategoryCard[]
}) {
  if (categories.length === 0) return null

  return (
    <ul className="grid gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-3">
      {categories.map((category) => (
        <li key={category.id} className="flex">
          <CategoryCard category={category} />
        </li>
      ))}
    </ul>
  )
}

/** One card. Not exported: nothing has wanted a category card on its own. */
function CategoryCard({
  category,
}: {
  category: DirectoryCategoryCard
}) {
  return (
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
          {/*
           * The whole card is the link rather than the name alone, the same way
           * a listing card works: a card where only one word is clickable reads
           * as broken to anybody who aims at the picture. The ring stays on the
           * name, which is where the words are.
           */}
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
  )
}
