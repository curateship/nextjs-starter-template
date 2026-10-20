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
export const appOpenEndpoints: Record<string, string> = {}

/**
 * The handler does no checking because the thing it calls does it instead. The
 * reason names that function, so the claim can be checked.
 *
 * Each of these lets in a signed-in admin or a guest sent from Project
 * (`workspace/docs/project-guests.md`). `editorGet`/`editorPost` read who
 * is calling; the helper named in the reason then decides who the call acts
 * as, and refuses a guest anything outside their one project.
 */
export const appGuardedDeeper: Record<string, string> = {
  "social/comments.ts:listFn":
    "editorGet, then actorFor in src/server/social/project-guests.ts: a guest only for their own project, whose list is cut to that project; anyone else must be a signed-in admin.",
  "social/comments.ts:checkFn":
    "editorPost, then actorForComments in src/server/social/project-guests.ts: every comment must be in the guest's project, otherwise the caller must be a signed-in admin.",
  "social/comments.ts:failuresFn":
    "editorGet, then actorFor in src/server/social/project-guests.ts: a guest only for their own project, whose failures are cut to that project; anyone else must be a signed-in admin.",
  "social/comments.ts:dismissFn":
    "editorPost, then actorForJobs in src/server/social/project-guests.ts: every failed job must be for the guest's project, otherwise the caller must be a signed-in admin.",
  "social/comments.ts:wordsFn":
    "editorGet, then actorForJobs in src/server/social/project-guests.ts: the failed job must be for the guest's project, otherwise the caller must be a signed-in admin.",
  "social/comments.ts:changeFn":
    "editorPost, then actorForComment in src/server/social/project-guests.ts: the comment must be in the guest's project, and a guest may edit but never delete; anyone else must be a signed-in admin.",
  "social/comments.ts:repliesFn":
    "editorGet, then actorForComment in src/server/social/project-guests.ts: the comment must be in the guest's project, otherwise the caller must be a signed-in admin.",
  "social/comments.ts:sendFn":
    "editorPost, then actorForComment in src/server/social/project-guests.ts: the comment answered must be in the guest's project, otherwise the caller must be a signed-in admin.",
  "social/comments.ts:cancelFn":
    "editorPost, then actorForComment in src/server/social/project-guests.ts: the comment must be in the guest's project, otherwise the caller must be a signed-in admin.",
  "social/phone-apps.ts:moduleFn":
    "editorGet, then actorFor in src/server/social/project-guests.ts: a guest only for their own project, with the owner's free accounts taken out; anyone else must be a signed-in admin.",
  "social/phone-apps.ts:replyFn":
    "editorPost, then actorForInbox in src/server/social/project-guests.ts: the inbox row's account must be in the guest's project, otherwise the caller must be a signed-in admin.",
  "social/phone-apps.ts:skipFn":
    "editorPost, then actorForInbox in src/server/social/project-guests.ts: every inbox row's account must be in the guest's project, otherwise the caller must be a signed-in admin.",
  "social/projects.ts:viewFn":
    "editorGet, then actorFor in src/server/social/project-guests.ts: a guest only for their own project, with the owner's free accounts taken out; anyone else must be a signed-in admin.",
  "social/projects.ts:updateFn":
    "editorPost, then actorFor in src/server/social/project-guests.ts: a guest only for their own project and only its description (guestOnlyDescription); anyone else must be a signed-in admin.",
  "social/projects.ts:threadsFn":
    "editorGet, then actorFor in src/server/social/project-guests.ts: a guest only for their own project, otherwise the caller must be a signed-in admin.",
  "social/projects.ts:lookFn":
    "editorPost, then actorFor in src/server/social/project-guests.ts: a guest only for their own project, otherwise the caller must be a signed-in admin.",
  "social/reddit/drafts.ts:postFn":
    "editorPost, then actorForFind in src/server/social/project-guests.ts: the post must be in the guest's project, and accountForFind then insists the account is in that project too; anyone else must be a signed-in admin.",
  "social/reddit/drafts.ts:cancelFn":
    "editorPost, then actorForFind in src/server/social/project-guests.ts: the post must be in the guest's project, otherwise the caller must be a signed-in admin.",
  "social/reddit/keywords.ts:loadKeywordsFn":
    "editorGet, then actorFor in src/server/social/project-guests.ts: a guest only for their own project, otherwise the caller must be a signed-in admin.",
  "social/reddit/keywords.ts:addKeywordFn":
    "editorPost, then actorFor in src/server/social/project-guests.ts: a guest only for their own project, otherwise the caller must be a signed-in admin.",
  "social/reddit/keywords.ts:deleteKeywordFn":
    "editorPost, then actorForKeyword in src/server/social/project-guests.ts: the keyword must be in the guest's project, otherwise the caller must be a signed-in admin.",
  "social/reddit/keywords.ts:enableKeywordFn":
    "editorPost, then actorForKeyword in src/server/social/project-guests.ts: the keyword must be in the guest's project, otherwise the caller must be a signed-in admin.",
  "social/reddit/keywords.ts:runKeywordFn":
    "editorPost, then actorForKeyword in src/server/social/project-guests.ts: the keyword must be in the guest's project, otherwise the caller must be a signed-in admin.",
  "social/reddit/keywords.ts:loadFindsFn":
    "editorGet, then actorFor in src/server/social/project-guests.ts: a guest only for their own project, otherwise the caller must be a signed-in admin.",
  "social/reddit/keywords.ts:loadFindFn":
    "editorGet, then actorForFind in src/server/social/project-guests.ts: the post must be in the guest's project, and a guest is shown none of the owner's past comments; anyone else must be a signed-in admin.",
  "social/reddit/keywords.ts:readThreadFn":
    "editorPost, then actorForFind in src/server/social/project-guests.ts: the post must be in the guest's project, otherwise the caller must be a signed-in admin.",
  "social/reddit/keywords.ts:readRulesFn":
    "editorPost, then actorForFind in src/server/social/project-guests.ts: the post must be in the guest's project, otherwise the caller must be a signed-in admin.",
  "social/reddit/keywords.ts:setStatusFn":
    "editorPost, then actorForFinds in src/server/social/project-guests.ts: every post must be in the guest's project, otherwise the caller must be a signed-in admin.",
  "social/reddit/own-posts.ts:sendFn":
    "editorPost, then actorFor in src/server/social/project-guests.ts: a guest only for their own project, and queueOwnPost insists the account is in it; anyone else must be a signed-in admin.",
  "social/reddit/own-posts.ts:rulesFn":
    "editorGet, then actorFor in src/server/social/project-guests.ts: a guest only for the project they name, otherwise the caller must be a signed-in admin.",
  "social/reddit/own-posts.ts:readRulesFn":
    "editorPost, then actorFor in src/server/social/project-guests.ts: a guest only for the project they name, otherwise the caller must be a signed-in admin.",
  "social/reddit/own-posts.ts:listFn":
    "editorGet, then actorFor in src/server/social/project-guests.ts: a guest only for their own project, whose posts are cut to that project; anyone else must be a signed-in admin.",
  "social/reddit/own-posts.ts:failedFn":
    "editorGet, then actorForJobs in src/server/social/project-guests.ts: the failed job must be for the guest's project, otherwise the caller must be a signed-in admin.",
  "social/project-guests.ts:guestFn":
    "editorGet, then actorFor in src/server/social/project-guests.ts: answers with the guest's own name for their own project only; anyone else must be a signed-in admin.",
  "social/today.ts:todayFn":
    "editorGet, then actorFor in src/server/social/project-guests.ts: a guest only for their own project, otherwise the caller must be a signed-in admin.",
}
