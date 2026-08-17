/**
 * The app's own entries in the guard test's two exception lists.
 *
 * `src/server/guards.test.ts` insists every server function either carries a
 * guard or is written down here with a reason. Its own lists cover the shell's
 * endpoints — but an app adds endpoints of its own, and some of them have to be
 * reachable by somebody who is not signed in: a public page that loads
 * anything at all needs a door the open internet may knock on. That entry
 * cannot go in the shell's lists, because the test is a shell file and an app
 * never edits one.
 *
 * So it goes here. Same rules as the shell's own lists, checked by the same
 * tests: the reason must be a real sentence over thirty characters, an entry
 * whose function no longer exists fails, and an entry whose function has since
 * grown a guard fails too.
 *
 * Keys are `file:functionName`, named the way the walker names them — the path
 * under `src/lib/api` and the constant, like
 * `"directory/listings.ts:readPublicListingFn"`.
 *
 * This file belongs to the app, not the shell. **In custom-shell itself it
 * stays empty forever.** The moment the shell puts an entry here, every app
 * ever copied from it conflicts on this file on every future merge — which is
 * the exact problem the file exists to avoid.
 */

/**
 * Reachable without being signed in, on purpose. The reason says why the thing
 * behind the door is safe for anyone to read.
 */
export const appOpenEndpoints: Record<string, string> = {
  "directory/public.ts:readDirectoryBrowseFn":
    "The directory a site publishes is a public page, so its list of published listings has to be readable by somebody with no account.",
  "directory/public.ts:readDirectoryMapFn":
    "The map is the same public browse list drawn as pins, so it answers with published listings on the visited site only, and only when that site has switched its map on.",
  "directory/public.ts:readDirectoryListingFn":
    "A listing's own page is public. It answers with published listings on the visited site only, so a draft is missing rather than merely hidden.",
  "directory/public.ts:readDirectoryCategoryFn":
    "A category page is public, and it reads the same published listings the browse page does, scoped to the site whose address was typed.",
  "directory/public.ts:readDirectoryFrontPageFn":
    "A site's optional listings home page is public, and it returns published cards only for the site whose address the visitor typed. A row drawn as a map also carries that site's browser map key, which is a value its own admin chose to publish and is only sent when a map row exists.",
  "directory/public.ts:geocodeDirectoryPlaceFn":
    "A visitor may type a town when browser location is unavailable; this lookup is rate limited, cached, and returns no private site data.",
  "directory/public-profile.ts:readPublicSavedProfileFn":
    "A person can share the saved lists they explicitly made public, and this returns only those lists and published listings on the visited site.",
  "directory/submissions.ts:readSubmissionFormFn":
    "The add-your-listing form is for people with no account, so the site's name and its list of categories have to be readable without one.",
  "directory/submissions.ts:submitListingFn":
    "Anybody may suggest a listing, which is the whole feature — it still checks the request came from this app's own pages, is rate limited per site and per address, and produces nothing an admin sees until the address is confirmed by email.",
  "directory/submissions.ts:resendSubmissionEmailFn":
    "Somebody whose confirmation link expired has no account to sign in to, so asking for a fresh one cannot require one — it is rate limited and answers the same way whether or not a submission is waiting.",
}

/**
 * The handler does no checking because the thing it calls does it instead. The
 * reason names that function, so the claim can be checked.
 */
export const appGuardedDeeper: Record<string, string> = {}
