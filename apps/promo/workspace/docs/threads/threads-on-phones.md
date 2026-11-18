# Threads on the rack's phones

Threads is a network of its own, run on the rack's phones the way Instagram
and TikTok are. Tyler picked it on 18 Nov 2026 (part 9 of
`workspace/tasks/New features/new-features-18-nov.md`).

## What it does

- **A project adds Threads** from its ⋮, under Networks, like any network. Its
  module is the phone apps' module: Posts and Comments, an account dropdown,
  and the post writer on the right
  ([Networks as modules](../network-modules.md)).
- **An account is on a phone only.** Adding one offers phones and refuses a
  browser profile, as Instagram's does. One Threads account per phone.
- **It sits beside the phone's Instagram account.** Threads signs in through
  an Instagram account on the same phone, so a phone holding Instagram's
  u/quiet.maple can hold Threads' @quiet.maple too. Threads counts as its own
  network, so this keeps the one-per-phone-per-network rule.
- **The daily reading** reads who is signed in, the followers and each post's
  numbers off the profile, as Instagram's does. Threads has no Account status
  page, so there is no shadowban line.
- **A post is one picture or video with its words**, up to 500 characters and
  one topic tag, from the media library or From archive. Draft caption writes
  the words in the account's voice. The phone hands the file to Threads'
  share screen, types the words and presses Post once. A post with words and
  no picture is not done yet, and neither is a carousel or a thread of
  several posts.
- **Write captions** in the Archive writes a Threads caption too, when the
  project has a Threads account.
- **Comments on your posts** are read when the phone's notification says one
  arrived, and answered on a press, the same as Instagram's
  ([Comments on your posts](../instagram/comments.md)).
- **The profile** changes the bio, the link and the picture. The name is the
  Instagram account's, so Threads' profile card has no Name box, and a name
  change is refused with "Threads takes its name from the Instagram account it
  signed in with."
- **Bans, warm-up and pace** are the phone apps' rules, unchanged
  ([Bans](../bans.md), [Behaving like a person](../accounts/behaving-like-a-person.md)).
- **Results** on the Projects dashboard's Overview count Threads posts with
  their likes and replies.

## What is unproven

- **Every step is written from how Threads is known to look**, not from a
  phone. Its words (Start a thread, Post, "posted") are in `APP_SCREENS` in
  `rack/promo_rack.py`. The daily self-test walks each step to its last button
  without pressing it, and a post is refused until the self-test has passed
  `threads/post`, so a wrong word stops Threads' posts and nothing else.
- **Android only.** Threads' steps are not written for an iPhone, so a step
  on an iPhone is refused with "Threads's steps are not written for this kind
  of phone yet".
- **The self-test walks Threads only where it can.** A test phone without the
  Threads app, or an iPhone, leaves its walks out (`rehearsals_not_here`), so
  racks without Threads get no daily "Self-test failed" bells for it. Threads'
  posts stay refused until a test phone with Threads passes them.
- **Ban screens.** Threads' suspended and confirm-it's-you lines are in
  `BAN_SCREENS`; any other short ban-like screen is still caught as unknown.
- **The rack program's version** went to `2026.11.18.1`, so racks take the
  steps on their next update.

## Where it is

- `NETWORKS` and `PHONE_ONLY_NETWORKS` in `src/lib/social/networks.ts`.
- Its limits in `src/lib/social/phone-apps.ts`, the file types it takes and
  its post link's shape in `src/server/social/phone-apps/posts.ts`.
- The steps' names in `PHONE_APP_ROUTINES` in `src/lib/phones/options.ts`;
  `threads/post` and `threads/profile` need a self-test pass
  (`src/server/phones/action-checks.ts`).
- In the rack program: `com.instagram.barcelona` in `APP_PACKAGES`, its
  screens in `APP_SCREENS["threads"]`, its steps in `ACTIONS` and
  `REHEARSALS`, and its notifications in `alert_kind`.
