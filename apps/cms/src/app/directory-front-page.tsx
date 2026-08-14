import { Link } from "@tanstack/react-router"

import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { ListingGrid } from "@/components/directory/public/listing-grid"
import { Button } from "@/components/ui/button"
import type { DirectoryFrontPageData } from "@/lib/directory/front-page"

export function DirectoryFrontPage({ data }: { data: DirectoryFrontPageData }) {
  return (
    <DirectoryFrame>
      <section
        className="grid gap-4 md:gap-6"
        aria-labelledby="front-page-title"
      >
        <div className="grid gap-2">
          <h1
            id="front-page-title"
            className="text-2xl font-semibold tracking-tight"
          >
            {data.heading}
          </h1>
          {data.intro ? (
            <p className="max-w-3xl text-sm text-muted-foreground">
              {data.intro}
            </p>
          ) : null}
        </div>

        <ListingGrid
          listings={data.listings}
          emptyMessage="There are no listings to show yet."
        />

        <div>
          <Button asChild>
            <Link to="/directory" search={{}} preload="intent">
              See all listings
            </Link>
          </Button>
        </div>
      </section>
    </DirectoryFrame>
  )
}
