import { Badge } from "@/components/ui/badge"
import {
  DIRECTORY_LISTING_STATUS_LABELS,
  type ListingStatus,
} from "@/lib/directory/listing-status"

/** A listing's status as the Listings rows and the listing window print it. */
export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  return (
    <Badge variant={status === "published" ? "secondary" : "outline"}>
      {DIRECTORY_LISTING_STATUS_LABELS[status]}
    </Badge>
  )
}
