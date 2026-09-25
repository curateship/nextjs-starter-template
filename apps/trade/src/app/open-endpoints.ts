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
  "trade/public-profiles.ts:readPublicProfileFn":
    "A public trader profile is a page for visitors with no account. It answers only for a profile its member switched on and no admin hid, and it carries no coin, price, key or email, only the figures the member chose to publish.",
  "trade/public-profiles.ts:readLeaderboardFn":
    "The leaderboard is a public page. It lists only switched-on profiles that are not hidden and pass the 30-day and 20-trade minimums, with the same figures their own public pages already show.",
  "trade/copy-trading.ts:readViewerRelationFn":
    "The Follow and Copy buttons on a public profile ask who is looking. A visitor who is not signed in gets null and nothing else; a signed-in member gets only their own follow, their own copy and their own wallets.",
  "trade/public-profiles.ts:reportPublicProfileFn":
    "Anybody may report a public profile, which is the feature. It still checks the request came from this app's own pages, takes five reports an hour from one address, and writes a row only an admin can read.",
}

/**
 * The handler does no checking because the thing it calls does it instead. The
 * reason names that function, so the claim can be checked.
 */
export const appGuardedDeeper: Record<string, string> = {}
