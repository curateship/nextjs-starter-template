import { createFileRoute, notFound } from "@tanstack/react-router"
import { z } from "zod"

import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { ListingGrid } from "@/components/directory/public/listing-grid"
import { loadPublicSavedProfile } from "@/lib/api/directory/public-profile"
import { directoryTitle } from "@/lib/directory/public-seo"

const profileId = z.string().uuid()

export const Route = createFileRoute("/profile_/$profileId")({
  loader: async ({ params }) => {
    if (!profileId.safeParse(params.profileId).success) throw notFound()
    const profile = await loadPublicSavedProfile(params.profileId)
    if (!profile) throw notFound()
    return profile
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: directoryTitle("Saved lists", loaderData?.site.name) },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PublicSavedProfileRoute,
  errorComponent: DirectoryRouteError,
})

function PublicSavedProfileRoute() {
  const { site, collections } = Route.useLoaderData()

  return (
    <DirectoryFrame>
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">Saved lists</h1>
        <p className="text-sm text-muted-foreground">
          Public lists shared on {site.name}.
        </p>
      </header>
      {collections.map((collection) => (
        <section key={collection.id} className="grid gap-2 md:gap-3">
          <h2 className="text-lg font-semibold">{collection.name}</h2>
          <ListingGrid
            listings={collection.listings}
            emptyMessage="There are no published listings in this list right now."
          />
        </section>
      ))}
    </DirectoryFrame>
  )
}
