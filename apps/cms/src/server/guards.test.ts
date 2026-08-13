import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { appGuardedDeeper, appOpenEndpoints } from "@/app/open-endpoints"
import { getFeedbackErrorMessage } from "@/lib/api/feedback"
import { getMediaErrorMessage } from "@/lib/api/media/media"
import { getWorkspaceErrorMessage } from "@/lib/api/people/workspaces"

/**
 * Every door in the app is locked unless somebody wrote down why it is not.
 *
 * `src/lib/api` holds every server function there is — each one an address the
 * open internet can call. This walks all of them and insists each either
 * carries one of the shared guards from `@/server/guards` or does its own
 * checking inside the handler.
 *
 * The two lists below are the exceptions, and they are the real content of
 * this test: adding to one is the only way to ship an endpoint without a guard
 * on it, which is the point — it cannot happen by forgetting.
 *
 * An app built on this shell has its own two lists in `src/app/open-endpoints.ts`,
 * merged in below. They exist because a public page an app adds needs an
 * endpoint anybody may call, and the app cannot write that down here — this is
 * a shell file. Every check in this file applies to those entries too.
 */

const API_DIR = join(process.cwd(), "src/lib/api")

/**
 * The handler does no checking because the thing it calls does it instead.
 * The reason names that function, so the claim can be checked.
 */
const GUARDED_DEEPER: Record<string, string> = {
  "notification.ts:listNotificationsPageFn":
    "listCurrentUserNotificationPage calls requireNotificationUser before it reads anything.",
  "notification.ts:markNotificationReadFn":
    "markCurrentUserNotificationRead calls requireAppOrigin and requireNotificationUser.",
  "notification.ts:markAllNotificationsReadFn":
    "markAllCurrentUserNotificationsRead calls requireAppOrigin and requireNotificationUser.",
  "notification.ts:deleteAdminNotificationsFn":
    "deleteAdminNotificationRows calls requireAppOrigin and requireAdminNotificationUser.",
  "notification.ts:clearAdminNotificationsFn":
    "clearAdminNotificationRows calls requireAppOrigin and requireAdminNotificationUser.",
}

/**
 * Reachable without being signed in, on purpose. Every one of these is either
 * a way *in* to the app or something a signed-out page has to draw.
 */
const OPEN_TO_EVERYONE: Record<string, string> = {
  "auth/auth.ts:loadCurrentUserFn":
    "Answers with null when nobody is signed in; that is how the app knows to show the signed-out shell.",
  "auth/auth.ts:loadSignInOptionsFn":
    "The sign-in page has to know which sign-in methods to offer before anybody has signed in.",
  "auth/auth.ts:registerFn": "Making an account is done by people who have none.",
  "auth/auth.ts:verifyEmailFn":
    "The link in a verification email is followed from a signed-out browser.",
  "auth/auth.ts:resendVerificationFn":
    "Asking for another verification email happens before the account is usable.",
  "auth/auth.ts:loginFn": "Signing in is the thing people do when not signed in.",
  "auth/auth.ts:logoutFn":
    "Signing out has to work from whatever state the browser is in, including an expired session.",
  "auth/auth.ts:requestSignInLinkFn":
    "Asking for a magic link is done from the signed-out sign-in page.",
  "auth/auth.ts:consumeSignInLinkFn":
    "Following a magic link is how the session gets created in the first place.",
  "auth/auth.ts:requestPasswordResetFn":
    "Forgotten-password is for people who cannot sign in.",
  "auth/auth.ts:resetPasswordFn":
    "The reset link is followed from a signed-out browser; the token is the guard.",
  "auth/auth.ts:confirmEmailChangeFn":
    "The confirmation link is followed from whichever browser opened the email; the token is the guard.",
  "auth/auth.ts:revokeEmailChangeFn":
    "The “this wasn’t me” link exists for somebody who may be losing the account, so it cannot require a session; the token is the guard.",
  "billing/billing.ts:loadPublicPricingFn":
    "The pricing page is public, so the plans on it have to be readable signed out.",
  "auth/passkeys.ts:beginPasskeySignInFn":
    "Starting a passkey sign-in happens before there is a session.",
  "auth/passkeys.ts:finishPasskeySignInFn":
    "Finishing a passkey sign-in is what creates the session; the signed challenge is the guard.",
  "maintenance.ts:readMaintenanceFn":
    "The maintenance notice has to render for people who are not signed in.",
  "content/pages.ts:readPageAccessFn":
    "Decides what a signed-out visitor is shown on a public page, so a session check here would hide every page it protects.",
  "content/pages.ts:readWrittenPageFn":
    "An admin-written page is a public page; requiring a session to read one would hide every page an admin ever writes.",
  "content/search.ts:readSiteSearchFn":
    "The site's search page is public. Its read resolves the site from the domain and returns only content already visible to everyone.",
  "content/announcements.ts:readVisitorAnnouncementsFn":
    "Public pages show these banners before a visitor has an account; the domain chooses the site and the query returns only live visitor announcements.",
  "people/view-as.ts:stopFn":
    "While the view is on the app treats the caller as the member, so an admin check here would be a door that locks from the inside. The session row is the guard.",
  "shell.ts:loadBrandingFn":
    "The app name and logo are on the sign-in page, so they are readable before there is a session.",
  "shell.ts:loadShellBootstrapFn":
    "Answers with empty defaults when nobody is signed in; the signed-out shell is built from exactly that.",
}

/** The shared guards. Anything else in a `.middleware([...])` is not a guard. */
const GUARDS = ["adminGet", "adminPost", "userGet", "userPost"]

/** A check written into the handler instead of attached as middleware. */
const INLINE_GUARD = /\brequire(Admin|User|OwnAccount|SessionOwner|Billing)\w*\(/

type ServerFn = { file: string; name: string; body: string }

/**
 * Every `.ts` under `src/lib/api`, however deep, named the way the exception
 * lists above name it — `people/contacts.ts`, not just `contacts.ts`.
 *
 * Walking only the top of the folder would be the quiet kind of broken: sort
 * the endpoints into subfolders and every moved one stops being checked, with
 * nothing failing to say so.
 */
function apiFiles(dir = API_DIR, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) return apiFiles(join(dir, entry.name), name)
    return entry.name.endsWith(".ts") ? [name] : []
  })
}

function collectServerFns(): ServerFn[] {
  const found: ServerFn[] = []

  for (const file of apiFiles()) {
    const source = readFileSync(join(API_DIR, file), "utf8")
    const matches = [...source.matchAll(/const (\w+) = createServerFn\(/g)]

    matches.forEach((match, index) => {
      // Everything up to the next server function is this one's definition —
      // its middleware, its validator and its handler.
      const start = match.index
      const end = matches[index + 1]?.index ?? source.length
      found.push({ file, name: match[1], body: source.slice(start, end) })
    })
  }

  return found
}

function isGuarded({ body }: ServerFn) {
  const hasMiddleware = GUARDS.some((guard) =>
    new RegExp(`\\.middleware\\(\\[[^\\]]*\\b${guard}\\b`).test(body)
  )
  return hasMiddleware || INLINE_GUARD.test(body)
}

describe("every server function is guarded", () => {
  const serverFns = collectServerFns()
  const excused = {
    ...GUARDED_DEEPER,
    ...OPEN_TO_EVERYONE,
    ...appGuardedDeeper,
    ...appOpenEndpoints,
  }

  it("finds the server functions to check", () => {
    // A parser that quietly matched nothing would make every test below pass.
    expect(serverFns.length).toBeGreaterThan(80)
  })

  it("reads every endpoint file, however deep it is filed", () => {
    // The count is the whole point of this one. The endpoint files were sorted
    // into subfolders, and a walker that only read the top of the folder would
    // still pass every test above while checking a fraction of the doors.
    //
    // A floor rather than an exact count, so an app built on this shell can
    // add endpoint files of its own without editing a shell test — a shallow
    // walker still reads far fewer than the shell's own 34 and fails.
    expect(apiFiles().length).toBeGreaterThanOrEqual(34)
  })

  it("locks every door that is not listed as an exception", () => {
    const unguarded = serverFns
      .filter(({ file, name }) => !(`${file}:${name}` in excused))
      .filter((fn) => !isGuarded(fn))
      .map(({ file, name }) => `${file}:${name}`)

    expect(unguarded).toEqual([])
  })

  it("keeps the exception lists honest", () => {
    // An entry left behind after its function was renamed or deleted would
    // silently excuse nothing — or worse, excuse a future function that
    // happens to reuse the name.
    const existing = new Set(serverFns.map(({ file, name }) => `${file}:${name}`))
    const stale = Object.keys(excused).filter((entry) => !existing.has(entry))

    expect(stale).toEqual([])
  })

  it("drops an exception once the function grows a guard of its own", () => {
    // Otherwise the list quietly rots into a set of claims nobody rechecks.
    const nowGuarded = serverFns
      .filter(({ file, name }) => `${file}:${name}` in excused)
      .filter((fn) => isGuarded(fn))
      .map(({ file, name }) => `${file}:${name}`)

    expect(nowGuarded).toEqual([])
  })

  it("gives every exception a reason", () => {
    for (const [entry, reason] of Object.entries(excused)) {
      expect(reason.length, `${entry} needs a real reason`).toBeGreaterThan(30)
    }
  })
})

/**
 * These three features write their own error text and hand it to the reader
 * as-is, so when the guards started throwing "AUTH_REQUIRED" and "FORBIDDEN"
 * the raw code went on screen. They have to say the codes in words.
 */
describe("a refused caller is told in words, not in codes", () => {
  const describers = {
    workspaces: getWorkspaceErrorMessage,
    media: getMediaErrorMessage,
    feedback: getFeedbackErrorMessage,
  }

  for (const [name, describe_] of Object.entries(describers)) {
    it(`${name} says what AUTH_REQUIRED and FORBIDDEN mean`, () => {
      expect(describe_(new Error("AUTH_REQUIRED"))).toBe("Please sign in again.")
      expect(describe_(new Error("FORBIDDEN"))).toBe(
        "You do not have access to that."
      )
    })
  }

  it("still passes through the messages written for the reader", () => {
    // These are thrown by the handlers themselves and are already sentences.
    expect(getMediaErrorMessage(new Error("File is empty"))).toBe("File is empty")
    expect(getMediaErrorMessage(new Error("RATE_LIMITED"))).toContain(
      "Please wait a few minutes"
    )
  })
})
