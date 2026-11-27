# Save from your phone

Tyler, 4 Nov 2026: "Phone share menu", for both phones. A video shared from
the YouTube or TikTok app on a phone opens Viral's Save to Viral page with
its link, and goes into the project you pick.

## The page

`/admin/share` (`src/components/viral/share-page.tsx`, route
`src/routes/_authenticated/admin/share.tsx`).

- **The link.** The phone sends it in `?url=`, `?text=` or `?title=`. Apps
  often put it inside the text, after words such as "Watch this on TikTok",
  so the page takes the first web address it finds (`findSharedLink` in
  `src/lib/viral/share.ts`). With none, the field is empty to paste into.
- **The project.** Your projects that aren't archived or samples. The last one
  picked is remembered in this browser.
- **Add to project.** It runs Paste a link (`pasteVideoLink`), so the server
  checks the link the same way and only takes one YouTube, TikTok or
  Instagram video. The video downloads and breaks down in the background. The
  link is only ever handed to that check; the page never follows it.
- **Signed out.** The page sends you to sign in first, like every admin page.

## Android

Viral is in Android's share menu once it is on the home screen. The shell's
manifest names the share page through the app option
`homeScreen.shareTarget` (`docs/shell/home-screen.md`), and Viral sets it to
`/admin/share` in `src/app/options.ts`. Only Android's Chrome reads it.

## iPhone

An iPhone never lists a website in its share menu. Settings → Save from phone
explains an Apple Shortcut instead: Show in Share Sheet, URL Encode the
shortcut's input, then Open URLs with this site's `/admin/share?url=`
followed by it. The tab shows that address with a Copy button.

## Not proven

Neither phone has shared a video to Viral yet. The local dev server never
hands a browser the manifest, so the Android entry can only be checked on the
deployed site.
