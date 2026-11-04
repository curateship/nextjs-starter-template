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
  "video/phone-uploads.ts:openFn":
    "A phone opening the QR code's link has no account. The 64-character random secret is the guard: it must match a link made within 15 minutes and never opened, it works once, and it gives that phone a sign-in for one project's uploads only. It answers only the project's name or why it was refused.",
  "video/phone-uploads.ts:sessionFn":
    "The phone's page asks whether its own cookie is still a live sign-in. It answers yes or no and nothing else, so it tells a stranger nothing.",
  "video/export-shares.ts:readSharedExportFn":
    "A share link is opened by somebody with no account. The 64-character random token is the guard: a revoked, expired or deleted link returns null, and a live one returns only the export's own title and shape, and for a kept carousel its slide count and the caption it was exported with.",
}

/**
 * The handler does no checking because the thing it calls does it instead. The
 * reason names that function, so the claim can be checked.
 */
export const appGuardedDeeper: Record<string, string> = {
  "video/youtube-retention.ts:loadRetentionFn":
    "editorGet lets in a signed-in person or a guest sent from Project, then the handler answers null unless the caller is a signed-in admin with no guest sign-in, and getExportRetention checks the export is that admin's own.",
  "video/project-videos.ts:openVideoFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project before openProjectVideo's owner check and the video is looked up inside that project.",
  "video/project-videos.ts:rememberVideoFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForVideo reads the video's project and checks it is the guest's before rememberOpenVideo's owner check.",
  "video/project-videos.ts:listVideosFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project before listProjectVideos' owner check.",
  "video/project-videos.ts:saveTimelineFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForVideo reads the video's project and checks it is the guest's before writeVideoTimeline's owner and version check.",
  "video/project-versions.ts:listVersionsFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForVideo reads the video's project and checks it is the guest's before listOwnedVideoVersions' owner check.",
  "video/project-versions.ts:getVersionFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForVideo reads the video's project and checks it is the guest's before getOwnedVideoVersion's owner check.",
  "video/project-versions.ts:restoreVersionFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForVideo reads the video's project and checks it is the guest's before restoreOwnedVideoVersion's owner check.",
  "video/exports.ts:startExportFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForVideo reads the video's project and checks it is the guest's before enqueueRenderJobs' owner check.",
  "video/exports.ts:videoExportFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForVideo reads the video's project and checks it is the guest's before getLatestRenderJobs' owner check.",
  "video/exports.ts:cancelExportFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForVideo reads the video's project and checks it is the guest's before cancelRenderJobs' owner check.",
  "video/exports.ts:stopExportFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForExport finds the export's project and checks it is the guest's before cancelRenderJob.",
  "video/exports.ts:retryExportFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForExport finds the export's project and checks it is the guest's before retryRenderJob.",
  "video/exports.ts:listExportsFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForVideo checks the named video is in the guest's project, or signedInActor refuses a guest when no video is named.",
  "video/exports.ts:updateExportFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForExport finds the export's project and checks it is the guest's before updateOwnedExport.",
  "video/exports.ts:setExportHandEditedFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForExport finds the export's project and checks it is the guest's before setOwnedExportHandEdited.",
  "video/exports.ts:setExportCoverFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForExport finds the export's project and checks it is the guest's before setOwnedExportCover.",
  "video/saved-frames.ts:saveExportFrameFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForExport finds the export's project and checks it is the guest's before saveOwnedExportFrame.",
  "video/saved-frames.ts:saveVideoFrameFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForVideo reads the video's project and checks it is the guest's before saveOwnedVideoFrame's owner check.",
  "video/blur-follow.ts:findFacesFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then signedInActor refuses a guest, and requireVideoBudget looks the video up as the signed-in person's own.",
  "video/blur-follow.ts:followFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then signedInActor refuses a guest, and getOwnedVideo and requireVideoBudget look the video up as the signed-in person's own.",
  "video/picture-edits.ts:cleanUpFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then signedInActor refuses a guest, requireVideoBudget looks the video up as the signed-in person's own, and readOwnedPicture reads only their own library.",
  "video/thumbnails.ts:pictureFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForVideo checks the video is in the guest's project, and findOwnedImageByUrl finds only the owner's own pictures.",
  "video/thumbnails.ts:listFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForVideo reads the video's project and checks it is the guest's before the owner check in thumbnails.ts.",
  "video/thumbnails.ts:createFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForVideo reads the video's project and checks it is the guest's before the owner check in thumbnails.ts.",
  "video/thumbnails.ts:deleteTemplateFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForVideo reads the video's project and checks it is the guest's before the owner check in thumbnails.ts.",
  "video/thumbnails.ts:frameFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForVideo reads the video's project and checks it is the guest's before the owner check in thumbnails.ts.",
  "video/thumbnails.ts:saveFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForThumbnail reads the thumbnail's video from its row and actorForVideo checks it is the guest's before the owner check in thumbnails.ts.",
  "video/thumbnails.ts:setMainFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForThumbnail reads the thumbnail's video from its row and actorForVideo checks it is the guest's before the owner check in thumbnails.ts.",
  "video/thumbnails.ts:refreshMainFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForThumbnail reads the thumbnail's video from its row and actorForVideo checks it is the guest's before the owner check in thumbnails.ts.",
  "video/thumbnails.ts:deleteFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForThumbnail reads the thumbnail's video from its row and actorForVideo checks it is the guest's before the owner check in thumbnails.ts.",
  "video/thumbnails.ts:downloadFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForThumbnail reads the thumbnail's video from its row and actorForVideo checks it is the guest's before the owner check in thumbnails.ts.",
  "video/thumbnails.ts:setTitleFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForThumbnail reads the thumbnail's video from its row and actorForVideo checks it is the guest's before the owner check in thumbnails.ts.",
  "video/thumbnails.ts:saveTemplateFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForThumbnail reads the thumbnail's video from its row and actorForVideo checks it is the guest's before the owner check in thumbnails.ts.",
  "video/thumbnail-ai.ts:pictureFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForThumbnail reads the thumbnail's video from its row and actorForVideo checks it is the guest's, before getOwnedThumbnail's owner check.",
  "video/thumbnail-ai.ts:ideasFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForVideo checks the video is in the guest's project, and every call under it looks the video up as the owner's own.",
  "video/thumbnail-ai.ts:makeIdeaFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForVideo checks the video is in the guest's project, and every call under it looks the video up as the owner's own.",
  "video/thumbnail-ai.ts:actorFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForThumbnail reads the thumbnail's video from its row and actorForVideo checks it is the guest's, before getOwnedThumbnail's owner check.",
  "video/thumbnail-ai.ts:titlesFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForThumbnail reads the thumbnail's video from its row and actorForVideo checks it is the guest's, before getOwnedThumbnail's owner check.",
  "video/thumbnail-ai.ts:checkFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForThumbnail reads the thumbnail's video from its row and actorForVideo checks it is the guest's, before getOwnedThumbnail's owner check.",
  "video/thumbnail-ai.ts:copyStyleFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForVideo checks the video is in the guest's project, and every call under it looks the video up as the owner's own.",
  "video/thumbnail-ai.ts:languagesFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForVideo checks the video is in the guest's project, and every call under it looks the video up as the owner's own.",
  "video/thumbnail-ai.ts:translateFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then actorForThumbnail reads the thumbnail's video from its row and actorForVideo checks it is the guest's, before getOwnedThumbnail's owner check.",
  "video/media.ts:listVideoMediaFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project for a project scope, and signedInActor refuses a guest any other scope.",
  "video/media.ts:attachPastedMediaFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project; a guest attaches nothing and only hears which files the project lacks.",
  "video/media.ts:retryPreparationFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForMedia checks the file is in the guest's project before retryOwnedMediaPreparation.",
  "video/editor-windows.ts:checkInFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForVideo reads the video's project and checks it is the guest's before checkInEditorWindow's owner check.",
  "video/editor-windows.ts:leaveFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForVideo reads the video's project and checks it is the guest's before leaveEditorWindow's owner check.",
  "video/project-guests.ts:loadGuestFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor finds the guest sign-in for the project and the handler refuses anyone without one.",
  "video/sound-tools.ts:requestCleanSoundFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForMedia finds whose file it is before requestOwnedCleanSound checks that person owns it.",
  "video/sound-tools.ts:readBeatsFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorForMedia finds whose each file is, and readOwnedBeats only reads rows of files that person owns.",
  "video/project-guests.ts:uploadFn":
    "editorGet/editorPost let in a signed-in person or a guest sent from Project, then actorFor checks the guest's project, and attachMediaToScope checks the project's owner again.",
  "video/phone-uploads.ts:makeLinkFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then signedInActor refuses a guest, and createPhoneLink checks the project is the signed-in person's own with getOwnedProject.",
  "video/phone-uploads.ts:endLinkFn":
    "editorPost lets in a signed-in person or a guest sent from Project, then signedInActor refuses a guest, and endPhoneLink only changes a link whose user_id is the signed-in person.",
  "video/phone-uploads.ts:linkStatusFn":
    "editorGet lets in a signed-in person or a guest sent from Project, then signedInActor refuses a guest, and phoneLinkStatus only reads a link whose user_id is the signed-in person.",
  "video/phone-uploads.ts:pictureFn":
    "phonePost refuses anyone without a live phone sign-in, a cookie whose hash matches an opened link that has not run out, and the file goes only into that link's own owner's library and project.",
  "video/phone-uploads.ts:videoStartFn":
    "phonePost refuses anyone without a live phone sign-in, and the upload is opened in that link's owner's own folder by startVideoUpload, with the owner's upload rate limit.",
  "video/phone-uploads.ts:videoSignFn":
    "phonePost refuses anyone without a live phone sign-in, and signVideoUploadPart checks the upload's key is in that link's owner's own folder and the piece is in range.",
  "video/phone-uploads.ts:videoFinishFn":
    "phonePost refuses anyone without a live phone sign-in, finishVideoUpload checks the key is the link owner's and the file that arrived, and attachMediaToScope checks the owner owns the project.",
}
