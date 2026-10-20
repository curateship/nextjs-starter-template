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
  "video/export-shares.ts:readSharedExportFn":
    "A share link is opened by somebody with no account. The 64-character random token is the guard: a revoked, expired or deleted link returns null, and a live one returns only the export's own title and shape, and for a kept carousel its slide count and the caption it was exported with.",
}

/**
 * The handler does no checking because the thing it calls does it instead. The
 * reason names that function, so the claim can be checked.
 */
export const appGuardedDeeper: Record<string, string> = {
  "video/projects.ts:getProjectFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project before the owner check in getOwnedProjectDetail.",
  "video/projects.ts:saveProjectTimelineFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project before writeProjectTimeline's owner and version check.",
  "video/project-versions.ts:listVersionsFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project before listOwnedProjectVersions' owner check.",
  "video/project-versions.ts:getVersionFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project before getOwnedProjectVersion's owner check.",
  "video/project-versions.ts:restoreVersionFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project before restoreOwnedProjectVersion's owner check.",
  "video/exports.ts:startExportFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project before enqueueRenderJobs' owner check.",
  "video/exports.ts:projectExportFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project before getLatestRenderJobs' owner check.",
  "video/exports.ts:cancelExportFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project before cancelRenderJobs' owner check.",
  "video/exports.ts:stopExportFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForExport finds the export's project and checks it is the guest's before cancelRenderJob.",
  "video/exports.ts:retryExportFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForExport finds the export's project and checks it is the guest's before retryRenderJob.",
  "video/exports.ts:listExportsFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project, or signedInActor refuses a guest when no project is named.",
  "video/exports.ts:updateExportFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForExport finds the export's project and checks it is the guest's before updateOwnedExport.",
  "video/exports.ts:setExportHandEditedFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForExport finds the export's project and checks it is the guest's before setOwnedExportHandEdited.",
  "video/exports.ts:setExportCoverFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForExport finds the export's project and checks it is the guest's before setOwnedExportCover.",
  "video/saved-frames.ts:saveExportFrameFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForExport finds the export's project and checks it is the guest's before saveOwnedExportFrame.",
  "video/saved-frames.ts:saveProjectFrameFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project before saveOwnedProjectFrame's owner check.",
  "video/media.ts:listVideoMediaFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project for a project scope, and signedInActor refuses a guest any other scope.",
  "video/media.ts:attachPastedMediaFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project; a guest attaches nothing and only hears which files the project lacks.",
  "video/media.ts:retryPreparationFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForMedia checks the file is in the guest's project before retryOwnedMediaPreparation.",
  "video/editor-windows.ts:checkInFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project before checkInEditorWindow's owner check.",
  "video/editor-windows.ts:leaveFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project before leaveEditorWindow's owner check.",
  "video/project-guests.ts:loadGuestFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor finds the guest sign-in for the project and the handler refuses anyone without one.",
  "video/project-guests.ts:uploadFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project, and attachMediaToScope checks the project's owner again.",
}
