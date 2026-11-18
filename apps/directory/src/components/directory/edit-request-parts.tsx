
import { WrittenPageBody } from "@/components/pages/written-page-body"
import {
  type EditRequestSummary,
} from "@/lib/api/directory/claims"
import { menuLinkLabel } from "@/lib/directory/contact-links"
import { OWNER_EDITABLE_FIELDS } from "@/lib/directory/review-status"

/**
 * What an owner wants changed, drawn for the Owner changes row of the
 * Listings dashboard (`sections/changes-section.tsx`). Only the fields they
 * actually touched are shown, each beside what the listing says now (Tyler's
 * polish pick, 18 Nov 2026: "An owner's edit request shows the listing's
 * current value beside the requested one"). What is drawn is the value that
 * would be written, already cleaned, so there is nothing between reading it
 * and it going live.
 */

/** Each kind of field drawn as what it is, rather than as raw stored data. */
export function ChangedValue({
  field,
  changes,
}: {
  field: (typeof OWNER_EDITABLE_FIELDS)[number]["key"]
  changes: EditRequestSummary["changes"]
}) {
  if (field === "featuredImage") {
    const src = changes.featuredImage ?? ""
    return src ? (
      <img
        src={src}
        alt=""
        className="max-w-24 rounded border object-cover"
      />
    ) : (
      <p className="text-sm text-muted-foreground">Removed</p>
    )
  }

  if (field === "contactLinks") {
    const links = changes.contactLinks
    if (!links) return null
    return (
      <div className="grid gap-1 text-sm">
        <span>{links.address || "No address"}</span>
        <span className="text-muted-foreground">
          {links.menuLinks.map((link) => menuLinkLabel(link)).join(" · ") ||
            "No links"}
        </span>
      </div>
    )
  }

  if (field === "body") {
    // The same renderer the public page uses. It builds elements from the
    // stored nodes and never a string of markup, so what an owner typed cannot
    // be anything but the text of a paragraph — including here, on an admin's
    // screen.
    return changes.body ? (
      <div className="text-sm">
        <WrittenPageBody body={changes.body} />
      </div>
    ) : null
  }

  const value = field === "title" ? changes.title : changes.metaDescription
  return (
    <p className="text-sm">
      {value || <span className="text-muted-foreground">Emptied</span>}
    </p>
  )
}
