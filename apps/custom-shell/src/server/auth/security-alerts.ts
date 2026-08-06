import { and, eq } from "drizzle-orm"

import { describeDevice } from "@/lib/format/device-label"
import { appUrlFor } from "@/server/app-url"
import { db, type CustomShellDb } from "@/server/db"
import { sendAuthEmail } from "@/server/email/send"
import { customShellKnownDevices } from "@/server/schema"
import {
  createUserSession,
  now,
  uuid,
  type SessionOrigin,
} from "@/server/auth/security"

/**
 * The emails that tell somebody their account was touched.
 *
 * None of these is asked for and none of them completes anything. They exist
 * for one case: somebody is quietly taking the account, and the only way its
 * owner finds out in time is a message arriving where the app already knows
 * how to reach them.
 *
 * Two rules run through all of it.
 *
 * **An alert never breaks the thing it is about.** Every send here is
 * swallowed. Failing a password reset because a mail server was briefly unhappy
 * would lock somebody out of their own account to tell them about their
 * account, which is worse than the message not arriving. The attempt is written
 * down either way — `sendAuthEmail` records every send — so a missing alert is
 * still answerable afterwards.
 *
 * **One alert per real event, never one per request.** That is the whole
 * difficulty of the new-device alert, and `known_devices` is the answer: see
 * `noteSignInDevice`.
 */

/** The time an alert reports, always in UTC because an email has no clock. */
const WHEN_IN_UTC = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  dateStyle: "medium",
  timeStyle: "short",
})

function describeWhen(at: Date) {
  return `${WHEN_IN_UTC.format(at)} UTC`
}

/**
 * Sends an alert, and never lets it get in the way.
 *
 * Deliberately not `throw`ing and deliberately not silent in the record: the
 * caller carries on regardless, and `system_email_sends` still holds the
 * attempt.
 */
async function sendAlert(email: Parameters<typeof sendAuthEmail>[0]) {
  try {
    await sendAuthEmail(email)
  } catch {
    // Nothing to do about it here, and nothing worth stopping for.
  }
}

/**
 * Tells the address an account just left where it went.
 *
 * The warning at request time is the one that can still be acted on; this one
 * is the receipt. It goes out anyway, because somebody who never saw the
 * warning — a full inbox, a weekend — still needs to know the account is gone
 * and that support is now the way back.
 */
export function alertEmailChanged(previousEmail: string, newEmail: string) {
  return sendAlert({
    kind: "email-change-done",
    to: previousEmail,
    tokens: { new_email: newEmail, when: describeWhen(now()) },
    actionUrl: appUrlFor("/"),
  })
}

/**
 * Confirms a password change to the address on the account.
 *
 * Sent for both ways a password can change — the Security tab and a completed
 * reset — because to the person receiving it they are the same event, and the
 * one they did not do is the one that matters.
 */
export function alertPasswordChanged(email: string, origin: SessionOrigin) {
  return sendAlert({
    kind: "password-changed",
    to: email,
    tokens: {
      when: describeWhen(now()),
      device: describeDevice(origin.userAgent),
    },
    actionUrl: appUrlFor("/forgot-password"),
  })
}

/**
 * Starts a session and, when the browser is one this account has never used,
 * says so by email.
 *
 * **Every way into the app must come through here**, not through
 * `createUserSession` directly — the password form, the sign-in link, Google
 * and passkeys all do. `security-alerts.test.ts` checks that, because a new
 * sign-in path that quietly skips the alert is exactly the kind of gap nobody
 * notices until it matters.
 *
 * What counts as a new device is the readable label the Security tab shows,
 * like "Chrome on macOS" — not the raw browser line, which changes with every
 * browser update and would alert constantly. So a second window, an update, or
 * another laptop of the same kind stay quiet. That is the intended trade: an
 * alert that arrives weekly is one nobody reads, and the sessions list is
 * already there for the fine detail.
 *
 * The first device on an account is recorded and says nothing. There is
 * nothing to compare it against, and telling somebody their own sign-in
 * happened on the browser they are looking at is noise, not safety.
 */
export async function startSessionWithAlert(
  user: { id: string; email: string },
  origin: SessionOrigin,
  database: CustomShellDb = db
) {
  const token = await createUserSession(user.id, origin, database)

  // The session is already made by this point, so anything that goes wrong
  // below must not turn a successful sign-in into an error page. Swallowing
  // the send was never enough on its own — the reads and writes that decide
  // whether to send can fail too, and they run after the door has opened.
  try {
    await noteSignInDevice(user, origin, database)
  } catch {
    // Nothing to do about it here, and nothing worth stopping a sign-in for.
  }

  return token
}

async function noteSignInDevice(
  user: { id: string; email: string },
  origin: SessionOrigin,
  database: CustomShellDb
) {
  const label = describeDevice(origin.userAgent)
  const timestamp = now()

  // The insert decides whether this device is new, rather than a read before
  // it. Two sign-ins from the same new device at the same moment both find
  // nothing when they look first, and both would then send — one alert each
  // for one device. Here the unique index picks a winner: exactly one insert
  // comes back with a row, and only that one goes on to send.
  const [created] = await database
    .insert(customShellKnownDevices)
    .values({
      id: uuid(),
      userId: user.id,
      label,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
    })
    .onConflictDoNothing()
    .returning({ id: customShellKnownDevices.id })

  if (!created) {
    // A device already on the list. Note that it is still in use and say
    // nothing — this is the ordinary sign-in, and it must stay silent.
    await database
      .update(customShellKnownDevices)
      .set({ lastSeenAt: timestamp })
      .where(
        and(
          eq(customShellKnownDevices.userId, user.id),
          eq(customShellKnownDevices.label, label)
        )
      )
    return
  }

  // Genuinely new. The only question left is whether it is the *first*, which
  // stays quiet — there is nothing to compare it against. Counted after the
  // insert, so this row is included and "first" means a count of one.
  const devices = await database
    .select({ id: customShellKnownDevices.id })
    .from(customShellKnownDevices)
    .where(eq(customShellKnownDevices.userId, user.id))
    .limit(2)

  if (devices.length <= 1) {
    return
  }

  await sendAlert({
    kind: "new-device",
    to: user.email,
    tokens: { device: label, when: describeWhen(timestamp) },
    actionUrl: appUrlFor("/forgot-password"),
  })
}
