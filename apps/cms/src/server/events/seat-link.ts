import { db } from "@/server/db"
import { plainLinkPage as page } from "@/server/directory/plain-page"
import { claimOfferedSeat } from "@/server/events/waiting-list"

/**
 * The "Claim your seat" link from a waiting-list email.
 *
 * No sign-in and no origin check, the same as the directory's "confirm your
 * email" link and for the same reason: it is opened from inside a mail client
 * by somebody who has no account here, and the unguessable token in the
 * address is the only thing proving the link is one this app sent to that
 * address.
 *
 * GET, because a link in an inbox is a GET. Claiming is the one thing the
 * person opening it wanted, so a mail client that fetches the link early does
 * the harmless half. There is no link that gives a seat up, which is what
 * would have made an early fetch a problem.
 */
export async function handleEventSeatRequest(
  request: Request
): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? ""
  if (!token || token.length > 128) {
    return page(
      "That link does not look right",
      "Check you copied the whole address from the email.",
      400
    )
  }

  const result = await claimOfferedSeat(token, undefined, db)
  switch (result.outcome) {
    case "claimed":
      return page(
        "The seat is yours",
        `You are on the list for ${result.title}. There is nothing more to do.`,
        200,
        { label: "Back to the event", href: result.eventUrl }
      )
    case "already":
      return page(
        "You already have your seat",
        `You are on the list for ${result.title}. There is nothing more to do.`,
        200,
        { label: "Back to the event", href: result.eventUrl }
      )
    case "ran-out":
      return page(
        "That offer is no longer open",
        `The seat for ${result.title} has gone to the next person on the list. You can check the event page in case another one frees up.`,
        410,
        { label: "Open the event", href: result.eventUrl }
      )
    case "started":
      return page(
        "That event has already started",
        `Sign-ups for ${result.title} closed when it began.`,
        410,
        { label: "Open the event", href: result.eventUrl }
      )
    case "unknown":
      return page(
        "We do not recognise that link",
        "Check you copied the whole address from the email.",
        404
      )
  }
}
