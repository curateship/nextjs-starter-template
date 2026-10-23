import { db } from "@/server/db"
import { plainLinkPage as page } from "@/server/directory/plain-page"
import {
  tellAdminsAboutClaim,
  tellAdminsAboutSubmission,
} from "@/server/directory/notify"
import { verifyClaim } from "@/server/directory/claims"
import {
  listingTitlesFor,
  verifySubmission,
} from "@/server/directory/submissions"

/**
 * The link at the bottom of a "confirm your email" message.
 *
 * No sign-in and no origin check, and both on purpose: this is opened from
 * inside a mail client, often by somebody who has never had an account here.
 * The unguessable token in the address is what stands in for both — it is the
 * only thing proving the link is one this app sent to that address.
 *
 * It answers with a plain self-contained page rather than the app's shell, for
 * the same reason the unsubscribe link does: it has to render with no
 * JavaScript and no session. `plain-page.ts` draws it.
 */

export async function handleDirectoryVerifyRequest(
  request: Request
): Promise<Response> {
  const url = new URL(request.url)
  const kind = url.searchParams.get("kind")
  const token = url.searchParams.get("token") ?? ""

  if (!token || (kind !== "submission" && kind !== "claim")) {
    return page(
      "That link does not look right",
      "Check you copied the whole address from the email.",
      400
    )
  }

  if (kind === "submission") {
    const result = await verifySubmission(token, db)
    switch (result.outcome) {
      case "verified":
        // Only now do the admins hear about it. A submission nobody has proved
        // an address for is not yet anybody's work.
        await tellAdminsAboutSubmission(result.workspaceId, result.businessName)
        return page(
          "Thank you — that is confirmed",
          `We have your listing for ${result.businessName}. Somebody checks each one by hand, and you will hear back by email.`,
          200
        )
      case "already":
        return page(
          "That is already confirmed",
          "There is nothing more to do. Your listing is waiting to be looked at.",
          200
        )
      case "expired":
        return page(
          "That link has run out",
          "Links last three days. Send the form again and we will email you a fresh one.",
          410,
          { label: "Add your listing", href: "/add-listing" }
        )
      case "unknown":
        return page(
          "We do not recognise that link",
          "It may already have been used. Check you copied the whole address from the email.",
          404
        )
    }
  }

  const result = await verifyClaim(token, db)
  switch (result.outcome) {
    case "verified": {
      const titles = await listingTitlesFor(result.workspaceId, [
        result.listingId,
      ])
      const listing = titles.get(result.listingId)
      await tellAdminsAboutClaim(
        result.workspaceId,
        listing?.title ?? "a listing"
      )
      return page(
        "Thank you — that is confirmed",
        "An admin now checks the request by hand. You will hear back by email.",
        200,
        listing
          ? { label: "Back to the listing", href: `/directory/${listing.slug}` }
          : undefined
      )
    }
    case "already":
      return page(
        "That is already confirmed",
        "There is nothing more to do. Your request is waiting to be looked at.",
        200
      )
    case "expired":
      return page(
        "That link has run out",
        "Links last three days. Ask for the listing again and we will email you a fresh one.",
        410
      )
    case "unknown":
      return page(
        "We do not recognise that link",
        "It may already have been used. Check you copied the whole address from the email.",
        404
      )
  }
}
