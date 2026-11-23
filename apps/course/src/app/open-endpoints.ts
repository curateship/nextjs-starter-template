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
  "courses/public.ts:readCoursesFn":
    "The /courses page lists published courses for visitors who may not be signed in; drafts and locked chapters' words are never in the answer.",
  "courses/public.ts:readCourseIntroFn":
    "A course's intro page is shown to signed-out visitors so they can see what it covers and join; it carries titles, never a locked chapter's words.",
  "courses/public.ts:readChapterFn":
    "A chapter open to everyone, or marked as a free preview, has to be readable while signed out; server/courses/reader.ts sends a locked chapter without its words.",
  "courses/public.ts:chapterAddressFn":
    "A chapter link inside a course is followed by whoever is reading it; the answer is only the chapter's current public address, and none for a draft course.",
  "site-root.ts:readSiteRootFn":
    "Anybody opening / has to be told whether it is a site's front page or the deployment's own address; it takes no input and answers only that, plus whether the asker is signed in.",
}

/**
 * The handler does no checking because the thing it calls does it instead. The
 * reason names that function, so the claim can be checked.
 */
export const appGuardedDeeper: Record<string, string> = {}
