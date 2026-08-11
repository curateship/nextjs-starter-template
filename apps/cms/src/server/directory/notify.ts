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
