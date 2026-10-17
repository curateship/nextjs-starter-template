# Posting a photo or video

A photo or video from the media library, a caption the AI can draft in the
account's voice, and Post, which sends it to the account's phone to post in
the app once. Phone farm file 06, parts 34 and 35. The same on TikTok.

Nothing here has run on a real phone yet.

## On the project's dashboard

Pick Instagram or TikTok in the project's left column. The right column is a
new post:

1. **Photo or video:** picked from the media library, or uploaded there.
2. **What the post is about:** a line or two for the AI. It is never posted.
3. **Draft caption** writes a caption and hashtags in the picked account's
   voice, into the box below. Edit it; only what is in the box when Post is
   pressed goes out.
4. **Caption:** under it, the characters used against the network's limit and
   the hashtags counted. Over the limit, the line turns red and says what to
   do.
5. **Post as:** the account dropdown, the same as Reddit's Comment as. Nothing
   is picked to begin with. It lists the project's accounts on this network
   with their phone and followers, puts an account in no project into this
   one, takes the picked one out, and Manage accounts opens the Accounts
   dashboard filtered to this network.
6. **Post from phone · slot 4** sends it.

On a phone or a narrow window the new post takes the screen after New post
is pressed, with a back arrow to the list.

## What the AI is told

The account's voice and its rules from the Voices dashboard, the project's
description, what Tyler said the post is about, whether it is a photo or a
video, and the network's limits: "at most 30 hashtags" on Instagram, and the
caption's length. A caption that comes back too long is still put in the box,
rather than thrown away after it was paid for; the box says what is wrong and
Post refuses it until it is fixed. What the AI wrote is kept beside the post
with what went out, so the two can be compared.

## When Post is refused, before anything is sent

- No account picked, no file picked, or a caption over the limit.
- A file that is not one of the person's own media library files, or a kind
  the app does not take. Instagram takes a JPEG or PNG photo, or an MP4 or MOV
  video; TikTok also takes WebP and WebM.
- More than 30 hashtags on Instagram. Instagram cuts a caption at 2,200
  characters; TikTok at 4,000.
- The account retired, paused, stopped by a ban screen, on no phone, or never
  read signed in.
- The phone offline or stopped for showing the wrong address, said under the
  dropdown before Post is pressed.
- The daily self-test has never walked the post on the test phone, or last
  found it broken ([the self-test](../phones/self-test-and-app-updates.md)).
- The same file and caption already on its way from the same account, so a
  second press never posts twice. The check and the post are written under a
  lock on the account, so two presses at the same moment cannot both pass. A
  post whose job failed or was dropped is not on its way, so the same file
  and caption may be posted again once a person has looked at the app.
- **Call off** takes one post or every ticked one in one request, and leaves
  any the phone has already started.

## What the phone does

Only after a person pressed Post, and tried once, never again.

1. It downloads the file from Promo's own media address, and only from an
   https address.
2. It puts it in the phone's camera folder under a camera-like name, such as
   `IMG_20261016_142233.jpg`, and has the gallery read it.
3. It hands the file to the app's own share screen, as sharing from the
   gallery does, and picks the feed when Instagram asks where.
4. It presses Next until the caption box shows, and types the caption one key
   at a time with a person's rhythm.
5. A short pause, then Share (Instagram) or Post (TikTok) is pressed once. A
   press is never repeated, even if it seemed to fail, because it may have
   gone through.
6. It counts as posted once the app says so within three minutes. An app that
   says it could not post fails the post at once.
7. **The link:** it opens the profile's newest post, its menu, Copy link, and
   reads the link. If the app will not give it, the post is saved as posted
   with no link, and it gets no numbers.
8. A little of the app's feed afterwards, which can never fail the post.

## Afterwards

- **The Posts tab** lists the project's posts on the network, newest first:
  the caption, the account, On its way, Posted or Failed, views, likes,
  comments, and when. The link opens the post in the app's website.
- **Call off** takes back a post the phone has not started on, deletes it, and
  nothing reaches the phone. Once the phone has started, it cannot be called
  off.
- **A failure** says why on its row, rings the bell "Did not go out: a post on
  Instagram", keeps a picture of each step on the phone's Actions tab, and is
  never tried again. A phone that stopped part-way says the post may already
  be up, so check the app before posting again.

## Where it is

- The server: `queueAppPost`, `runAppPost`, `listAppPosts` and `cancelAppPost`
  in `src/server/social/phone-apps/posts.ts`; the caption in `captions.ts`
  beside it.
- The endpoints: `sendAppPost`, `writeCaption` and `callOffAppPost` in
  `src/lib/api/social/phone-apps.ts`.
- The screen: `src/components/social/phone-apps/post-composer.tsx` and the
  Posts table in `app-tables.tsx`.
- The rack: `action_app_post`, `download_media`, `put_in_gallery` and
  `read_post_link` in `rack/promo_rack.py`.
- The table: `promo_app_posts`, from `drizzle/0120_promo_instagram_tiktok.sql`.
