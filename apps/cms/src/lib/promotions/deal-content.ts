import {
  blankListingHours,
  type ListingHours,
} from "@/lib/directory/listing-details"
import { dealDaysText } from "@/lib/promotions/deal-days"
import {
  DEAL_TYPE_LABELS,
  headlineIsBuilt,
  isDealType,
  type DealType,
} from "@/lib/promotions/deal-headline"
import { dealTimesLines } from "@/lib/promotions/deal-times"

/**
 * A deal's content as a window's boxes hold it, shared by Admin → Promotions'
 * window and a listing owner's window, so both start from the same blanks and
 * read a stored deal the same way.
 */

/** A deal's content as the boxes hold it. */
export type DealContentFields = {
  title: string
  description: string
  coverImage: string
  /** "2026-10-03", or empty while none is picked. */
  startDate: string
  /** Empty for a deal with no end. */
  endDate: string
  code: string
  smallPrint: string
  /** Empty on a new deal, and on an old deal made before types existed. */
  dealType: DealType | ""
  /** As typed, for money off and percent off. */
  amount: string
  /** As typed, for the types whose headline is typed. */
  headline: string
  /** Every day off means all day, every day. */
  times: ListingHours
  /** Visitors claim it with a name and email, each getting their own code. */
  takesClaims: boolean
  /** As typed. Empty means no limit. */
  claimLimit: string
}

export function blankDealContent(): DealContentFields {
  return {
    title: "",
    description: "",
    coverImage: "",
    startDate: "",
    endDate: "",
    code: "",
    smallPrint: "",
    dealType: "",
    amount: "",
    headline: "",
    times: blankListingHours(),
    takesClaims: false,
    claimLimit: "",
  }
}

/** A stored deal's content, as the boxes show it. */
export function dealContentFrom(deal: {
  title: string
  description: string
  coverImage: string
  startDate: string
  endDate: string | null
  code: string
  smallPrint: string
  dealType: string | null
  amount: number | null
  headline: string
  times: ListingHours
  takesClaims: boolean
  claimLimit: number | null
}): DealContentFields {
  const dealType = isDealType(deal.dealType) ? deal.dealType : ""
  return {
    title: deal.title,
    description: deal.description,
    coverImage: deal.coverImage,
    startDate: deal.startDate,
    endDate: deal.endDate ?? "",
    code: deal.code,
    smallPrint: deal.smallPrint,
    dealType,
    amount: deal.amount === null ? "" : String(deal.amount),
    // A built headline is made again from the number, so its box starts empty.
    headline: dealType && headlineIsBuilt(dealType) ? "" : deal.headline,
    times: deal.times,
    takesClaims: deal.takesClaims,
    claimLimit: deal.claimLimit === null ? "" : String(deal.claimLimit),
  }
}

/** The content as the doors take it. */
export function dealContentInput(fields: DealContentFields) {
  return { ...fields, endDate: fields.endDate || null }
}


/** A stored deal's content, as the admin's queue reads it line by line. */
type StoredDealContent = {
  title: string
  description: string
  coverImage: string
  startDate: string
  endDate: string | null
  code: string
  smallPrint: string
  dealType: string
  amount: number | null
  headline: string
  times: ListingHours
  takesClaims: boolean
  claimLimit: number | null
}

/**
 * The content as labelled lines, in the order the window shows the boxes, so
 * a change can be read beside the live deal one line at a time.
 */
export function dealContentLines(
  content: StoredDealContent
): { label: string; value: string }[] {
  const type = isDealType(content.dealType)
    ? DEAL_TYPE_LABELS[content.dealType]
    : ""
  return [
    { label: "Title", value: content.title },
    {
      label: "Headline",
      value: type ? `${content.headline} (${type})` : content.headline,
    },
    { label: "Days", value: dealDaysText(content) },
    {
      label: "Times",
      value: dealTimesLines(content.times).join("\n") || "All day, every day",
    },
    {
      label: "Claims",
      value: content.takesClaims
        ? content.claimLimit
          ? `Claimed with a name and email, the first ${content.claimLimit}`
          : "Claimed with a name and email, no limit"
        : "Off",
    },
    { label: "Description", value: content.description },
    { label: "Code", value: content.code },
    { label: "Small print", value: content.smallPrint },
    { label: "Photo", value: content.coverImage },
  ]
}

/**
 * A deal as a card draws it, with its words for this moment worked out by the
 * server. Spelled out here rather than taken from the server's own type,
 * because a browser-side file may not import from `@/server/*`.
 */
export type DealCardView = {
  id: string
  slug: string
  title: string
  headline: string
  coverImage: string
  listingTitle: string
  listingImage: string
  /** "Until Sun, Oct 12", "Starts Thu, Oct 1". */
  daysText: string
  /** "On now · until 6 PM", "Next: today at 4 PM", or null. */
  nowText: string | null
  /** How far away, in kilometres, only while narrowed to a distance. */
  distanceKm?: number
}
