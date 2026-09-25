import { appUrlFor } from "@/server/app-url"
import { db, type CustomShellDb } from "@/server/db"
import { adminEmails } from "@/server/directory/admins"
import { notifyAdmins } from "@/server/directory/mail"

/**
 * Telling the people who run the site that something is waiting.
 *
 * A server module of its own rather than a helper inside an endpoint file,
 * because the verification link needs these too — and a `src/server/*` module
 * that reaches into `src/lib/api/*` would build server functions while the
 * server is still starting, which throws outside a request.
 *
 * **This is not the shell's notification list.** Which kinds of notice exist is
 * a fixed list in a shell file, and an app never edits one. The queue screens
 * carry the waiting count on screen; this puts one line in an admin's inbox so
 * nobody has to keep checking a screen. Nothing here ever throws — a submission
 * that was accepted must not fail because the people who review it could not be
 * told.
 */

export async function tellAdminsAboutSubmission(
  workspaceId: string,
  businessName: string,
  database: CustomShellDb = db
) {
  await notifyAdmins(
    {
      workspaceId,
      subject: `New listing submitted: ${businessName}`,
      lines: [
        `${businessName} has been submitted, and the sender has confirmed their email address.`,
        "It is waiting in the submissions queue.",
      ],
      url: appUrlFor("/admin/listing-submissions"),
    },
    await adminEmails(database),
    database
  )
}

export async function tellAdminsAboutClaim(
  workspaceId: string,
  listingTitle: string,
  database: CustomShellDb = db
) {
  await notifyAdmins(
    {
      workspaceId,
      subject: `Somebody claimed ${listingTitle}`,
      lines: [
        `A claim on ${listingTitle} has been confirmed by email and is waiting for review.`,
      ],
      url: appUrlFor("/admin/listing-claims"),
    },
    await adminEmails(database),
    database
  )
}

export async function tellAdminsAboutEditRequest(
  workspaceId: string,
  listingTitle: string,
  database: CustomShellDb = db
) {
  await notifyAdmins(
    {
      workspaceId,
      subject: `Change requested for ${listingTitle}`,
      lines: [
        `The owner of ${listingTitle} has asked for a change.`,
        "Nothing is live until it is approved.",
      ],
      url: appUrlFor("/admin/listing-claims"),
    },
    await adminEmails(database),
    database
  )
}

/**
 * **The whole thing is wrapped, not just the sending.** `notifyAdmins` catches
 * a send that fails, but reading the list of admins happens before it is
 * called and is an ordinary query that can reject. Let that through and a
 * report that is already saved answers the visitor with a failure — and they
 * have spent their one report an hour, so pressing Send again is refused for
 * the next hour. The row is in the queue either way, which is the promise
 * `workspace/docs/listing-problem-reports.md` makes.
 */
export async function tellAdminsAboutReport(
  workspaceId: string,
  /** The listing's or event's title. */
  subjectTitle: string,
  reasonLabel: string,
  database: CustomShellDb = db
) {
  try {
    await notifyAdmins(
      {
        workspaceId,
        subject: `Problem reported on ${subjectTitle}`,
        lines: [
          `A visitor says something is wrong with ${subjectTitle}: ${reasonLabel}.`,
          "Nothing on the page has changed. It is waiting in the reports queue.",
        ],
        url: appUrlFor("/admin/listing-reports"),
      },
      await adminEmails(database),
      database
    )
  } catch {
    // Nothing to do about it here, and nothing worth failing a saved report
    // over.
  }
}

/**
 * A suggestion from the Suggest an event page, or an event a listing's owner
 * sent from My listings. Wrapped whole for the same
 * reason as a listing report: the suggestion is already saved, and a failed
 * admin lookup must not answer the person with a failure.
 */
export async function tellAdminsAboutEventSubmission(
  workspaceId: string,
  eventTitle: string,
  /** The listing, when its owner sent it from My listings. */
  ownerOf?: string,
  database: CustomShellDb = db
) {
  try {
    await notifyAdmins(
      {
        workspaceId,
        subject: ownerOf
          ? `New event from the owner of ${ownerOf}: ${eventTitle}`
          : `New event suggested: ${eventTitle}`,
        lines: [
          ownerOf
            ? `The owner of ${ownerOf} sent ${eventTitle} from My listings. Approving it publishes it.`
            : `Somebody suggested ${eventTitle} on the Suggest an event page.`,
          "It is waiting in the event suggestions queue.",
        ],
        url: appUrlFor("/admin/event-submissions"),
      },
      await adminEmails(database),
      database
    )
  } catch {
    // The suggestion is in the queue either way.
  }
}

/**
 * A deal or a change to one that a listing's owner sent from My listings.
 * Wrapped whole for the same reason as an event suggestion: the request is
 * already saved, and a failed admin lookup must not answer the owner with a
 * failure.
 */
export async function tellAdminsAboutDealRequest(
  workspaceId: string,
  dealTitle: string,
  listingTitle: string,
  kind: "new" | "change",
  database: CustomShellDb = db
) {
  try {
    await notifyAdmins(
      {
        workspaceId,
        subject:
          kind === "new"
            ? `New deal from the owner of ${listingTitle}: ${dealTitle}`
            : `A change to ${dealTitle} from the owner of ${listingTitle}`,
        lines: [
          kind === "new"
            ? `The owner of ${listingTitle} sent ${dealTitle} from My listings. Approving it publishes it.`
            : `The owner of ${listingTitle} sent new wording for ${dealTitle}. The live deal stays as it is until you approve it.`,
          "It is waiting in the deals from owners queue.",
        ],
        url: appUrlFor("/admin/promotion-requests"),
      },
      await adminEmails(database),
      database
    )
  } catch {
    // The request is in the queue either way.
  }
}
