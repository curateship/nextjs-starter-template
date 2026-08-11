import * as React from "react"
import { BookmarkIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getSaveErrorMessage,
  removeFromSaved,
  type SavedCollection,
} from "@/lib/api/directory/saves"
import { useAsyncAction } from "@/lib/hooks/use-async-action"

export function SavedListings({ initial }: { initial: SavedCollection[] }) {
  const [collections, setCollections] = React.useState(initial)
  const [run, busy] = useAsyncAction(getSaveErrorMessage)

  if (collections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No saved listings yet</CardTitle>
          <CardDescription>Open a directory listing and use Save to keep it here.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const sites = new Map<string, SavedCollection[]>()
  for (const collection of collections) {
    sites.set(collection.siteId, [...(sites.get(collection.siteId) ?? []), collection])
  }
  return (
    <div className="grid gap-2 md:gap-3">
      {[...sites.values()].map((siteCollections) => (
        <section key={siteCollections[0]!.siteId} className="grid gap-2 md:gap-3">
          <h1 className="text-xl font-semibold">{siteCollections[0]!.siteName}</h1>
          {siteCollections.map((collection) => (
            <Card key={collection.id}>
              <CardHeader>
                <CardTitle>{collection.name}</CardTitle>
                <CardDescription>{collection.items.length} {collection.items.length === 1 ? "listing" : "listings"}</CardDescription>
              </CardHeader>
              <CardContent>
                {collection.items.length ? (
                  <ul className="divide-y">
                    {collection.items.map((item) => (
                      <li key={item.id} className="flex min-h-12 items-center gap-3 py-2">
                        <BookmarkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.title}</p>
                          {item.address ? <p className="truncate text-xs text-muted-foreground">{item.address}</p> : null}
                        </div>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={busy}
                          aria-label={`Remove ${item.title} from ${collection.name}`}
                          onClick={() => void run(async () => {
                            await removeFromSaved({
                              workspaceId: collection.siteId,
                              collectionId: collection.id,
                              listingId: item.id,
                            })
                            setCollections((current) => current.map((row) =>
                              row.id === collection.id
                                ? { ...row, items: row.items.filter((saved) => saved.id !== item.id) }
                                : row
                            ))
                            toast.success("Removed from saved listings.")
                          })}
                        >
                          <Trash2Icon />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-sm text-muted-foreground">This saved list is empty.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      ))}
    </div>
  )
}
