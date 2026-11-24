import type { loadListingDeleteImpact } from "@/lib/api/directory/listings"
import { plural } from "@/lib/format/plural"

/** What a listing's Delete asks about: what goes with it, and which listings. */
export type DeleteImpact = Awaited<ReturnType<typeof loadListingDeleteImpact>> & { ids: string[]; title: string | null }

/** What deleting takes with it, said before anything goes. The Listings and Needs work rows ask with the same words. */
export function deleteWords(confirm: DeleteImpact) {
  const one = confirm.ids.length === 1
  return [
    one
      ? `${confirm.title ?? "The listing"} goes for good, and its public page stops existing.`
      : `${confirm.ids.length} listings go for good, and their public pages stop existing.`,
    confirm.categoryLinks
      ? `${confirm.categoryLinks === 1 ? "One category tag goes" : `${confirm.categoryLinks} category tags go`} too. The categories themselves stay.`
      : null,
    // First among the things that involve a person: somebody loses a page they were given.
    confirm.claims
      ? `${
          confirm.claims === 1
            ? "A business owner looks after this listing and loses it"
            : `${confirm.claims} business owners look after these listings and lose them`
        }.`
      : null,
    confirm.pendingRequests
      ? `${confirm.pendingRequests === 1 ? "One change waiting to be read goes" : `${confirm.pendingRequests} changes waiting to be read go`} with it.`
      : null,
    confirm.saves ? `${confirm.saves === 1 ? "One saved copy goes" : `${confirm.saves} saved copies go`} with it.` : null,
    confirm.deals
      ? `${confirm.deals === 1 ? "One deal goes" : `${confirm.deals} deals go`} with it, because a deal belongs to its listing.`
      : null,
    confirm.pendingFeatured
      ? `${plural(confirm.pendingFeatured, "One featured checkout is still open", `${confirm.pendingFeatured} featured checkouts are still open`)}, so deleting waits until ${confirm.pendingFeatured === 1 ? "it finishes or expires" : "they finish or expire"}.`
      : null,
    confirm.activeFeatured
      ? `${plural(confirm.activeFeatured, "One paid featured placement is still running", `${confirm.activeFeatured} paid featured placements are still running`)}, and deleting now ends ${confirm.activeFeatured === 1 ? "it" : "them"} with no refund.`
      : null,
  ]
    .filter(Boolean)
    .join(" ")
}
