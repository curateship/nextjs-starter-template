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
  "pomodoro/rooms.ts:lookupRoomFn":
    "An invite link must say what it points at before sign-in: the lookup answers a status, the room's name and a member count, never member names, emails or ids.",
  "pomodoro/public-profile.ts:readPublicProfileFn":
    "A public profile is a page for the open internet, so its read must answer before sign-in. It returns only what that person switched on themselves, carries no user id and no email, and answers null for a handle nobody holds, a profile switched off and a deleted account alike.",
  "pomodoro/public-profile.ts:readUsersFn":
    "The /users directory is a public page listing the members who switched on a second opt-in asking to be listed. It answers a page of chosen names, pictures and one headline figure, carries no user id and no email, and a profile that is switched on but not listed never appears in it.",
  "pomodoro/profile-reports.ts:reportFn":
    "A public profile is read by strangers with no account, so the Report button beside it has to work without one. It writes a reason from a fixed list into the operator queue, answers the same way whatever happens, and is limited by address rather than by account.",
  "pomodoro/personal-room.ts:loadGuestMediaFn":
    "A guest's page draws a theme and lists the sounds before anybody signs in, so it needs the Live themes and sounds. It answers only what every member can already see on the Theme and Sounds pages, and a random free pair, with no account and nothing personal in it.",
  "pomodoro/public-profile.ts:readYearInReviewFn":
    "The year recap at /u/<handle>/<year> is the same public page one year at a time, and it is read by strangers following a shared link. It sums figures its owner already published by switching the figures on, names nobody else and carries no user id.",
  "pomodoro/shared-media.ts:listSharedFn":
    "Shared sounds and backgrounds are files their owners chose to show the public, listed on public profiles and under Shared by members. It answers names, tags, file addresses and an owner handle only while that owner's page is public, never an email, and hides files across the reader's blocks. A file address sits in a folder named by an opaque account id, as every bucket file does, and since 10 Oct 2026 never carries the member's own file name.",
  "pomodoro/shared-media.ts:reportSharedFileFn":
    "Shared files sit on public pages read by strangers with no account, so their Report button has to work without one. It checks the origin itself, writes a reason from a fixed list into the admins' queue, answers the same way whatever happens, and is limited by address.",
  "pomodoro/shared-media.ts:copyrightFn":
    "The public copyright page is for rights holders with no account. It checks the origin itself, is limited to five an hour by address, and only writes the sender's claim into the admins' report queue; it reads nothing back.",
  "pomodoro/shared-media.ts:readFeaturedFn":
    "The featured shared file sits on the signed-out front page. It answers the one file an admin chose to show the public, with its owner's handle only while that owner's page is public, held for a minute rather than read per visit.",
  "pomodoro/shared-media.ts:readSharedFileFn":
    "A shared file's own page at /u/<handle>/files/<id> is read by strangers following a shared link. It answers one file its owner chose to share and their public name, and null for every kind of missing so nothing can be learned from the difference.",
}

/**
 * The handler does no checking because the thing it calls does it instead. The
 * reason names that function, so the claim can be checked.
 */
export const appGuardedDeeper: Record<string, string> = {}
