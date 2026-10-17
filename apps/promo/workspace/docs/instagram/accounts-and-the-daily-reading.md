# Instagram and TikTok accounts, and the daily reading

Instagram and TikTok accounts run on a phone only, in the real app, and each
is a network module inside a project, the same as Reddit. Once a day the
phone reads the account's followers, following, posts, whether the app says
it is shadowbanned, and the numbers of each post Promo made. Phone farm file
06, parts 32 and 39. TikTok works the same way; [what differs on
TikTok](../tiktok/what-differs-on-tiktok.md) lists the few places it does not.

Nothing here has run on a real phone yet. The steps through both apps were
written from how the apps are known to look; the daily self-test walks them
first ([the self-test](../phones/self-test-and-app-updates.md)), and a step
that does not find its button stops with a picture of the screen.

## On a phone only

- **Adding one:** Add account on the Accounts dashboard has a Network pick.
  Instagram and TikTok offer phones only, never a browser profile. Sign in to
  the app on the phone through its screen window on the Phones dashboard, then
  press Check now on the account's row.
- **A browser profile is refused,** when adding the account and when moving
  it: "An Instagram account runs on a phone only, in the Instagram app, never
  on a browser profile. Pick a phone." Instagram and TikTok are built for the
  phone, and a desktop browser stands out there.
- **One per phone per network.** A phone may carry a Reddit, an Instagram and a
  TikTok account at once, as one person's phone would, but never two Instagram
  accounts.
- **Important or throwaway** works as it does for Reddit
  ([important and throwaway accounts](../accounts/important-and-throwaway.md)).
  Every account starts as throwaway, so a project with Reddit throwaways can
  take an Instagram account without a refusal. Mark it important from its
  settings once it should be kept apart.
- **A Reddit job for an Instagram account** (a warm-up, say) is refused before
  anything reaches the phone: "That is Reddit's, and this is an Instagram
  account. Nothing was sent."

## Who is signed in

- After every job on the phone, the rack opens the app the job worked in, and
  only that app, and reads the name on the account's own profile. Opening
  every app on the phone after each job is not what a person does.
- A look that cannot be taken is "not checked", never "signed out", so one bad
  read never blanks the account.
- The daily reading finding the app's signed-out screen does write it down:
  the account's name is cleared, so Post and Apply refuse it, and the reading
  fails with "not signed in". Its first day starts again when it next reads
  signed in.
- The first time the phone reads the account signed in, after it was last
  read signed out, starts the account's first day. A profile change waits for
  that day to end ([the profile](profile.md)).

## The daily reading

- **When:** once a day for every Instagram and TikTok account that is on a
  phone, signed in and not retired, inside the account's waking hours, like a
  Reddit account's. Check now on the Accounts dashboard asks for one at once.
- **What it reads:** followers, following and posts off the account's own
  profile. TikTok's profile shows no post count, so that stays empty there.
- **The shadowban line:** Tyler, 16 Oct 2026, after asking "or are you talking
  about shadowban": "yes" to reading it. On these two apps a shadowban hides
  the posts from people who do not follow the account (hashtags, Explore, For
  You) while the profile still opens, so looking at the profile signed out
  would say "all fine". The phone opens the app's own Account status page in
  Settings and reads whether it says the account's posts are not shown to
  non-followers.
- **What the Accounts dashboard shows:** "Not shadowbanned" under the status,
  or "Shadowbanned" in red with the page's own words behind it. A page that
  could not be read leaves the last answer as it was, never "Not
  shadowbanned".
- **The bell:** "Shadowbanned: @name on Instagram" rings once, and the notice
  goes away on the first reading that says it is over.
- **No signed-out look.** Tyler, 16 Oct 2026: "Why does it need to check? if
  our account gets banned then we cant log in?" A ban on these two shows in
  the app the phone already opens, and the ban-screen watch stops the account
  ([freezes and ban screens](../phones/freezes-and-ban-screens.md)). Reddit
  keeps its outside look only because Reddit can hide an account from
  everyone else while its owner still signs in.
- **A glance at the inbox:** if the app's inbox button shows something unread
  that no notification brought in, the reading asks for a read of the
  messages ([the Messages dashboard](../messages-dashboard.md)).

## Each post's numbers

- The same visit opens each of the account's twelve newest posts Promo made,
  by its link, and reads its views, likes and comments. Instagram writes
  "2,345 plays" and "321 likes"; TikTok puts the counts beside its buttons.
- They show on the module's Posts tab, with the day they were read behind the
  views. A post that would not open keeps its last numbers and their date.
- A post whose link Promo never got (the app would not give it) has no numbers.

## The status on the Accounts dashboard

- **Banned** once a ban screen stopped the account, **Working** when it posted
  in the last week, **Ready** otherwise. There is no warm-up or karma here.
- **Karma or followers** is one column: karma for Reddit, followers for
  Instagram and TikTok, with following behind it. **Age** shows the post count.

## The module on a project's dashboard

Instagram and TikTok each join the project's Networks list once built
([networks as modules](../network-modules.md)). Picking one fills the middle
and right columns:

- **Posts** and **Comments** tabs across the middle column, with Jobs and New
  post at the top.
- **The right column** is a new post with the account it goes out as
  ([posting](posting.md)), or, with a comment open, that comment and the
  answer to it ([comments on your posts](comments.md)).
- **There is no search for posts to answer.** Tyler, 16 Oct 2026: "Skip the
  searching for posts to answer. IG and tiktok is not reddit."

## Where it is

- The list of networks and which run on phones only: `NETWORKS` and
  `PHONE_ONLY_NETWORKS` in `src/lib/social/networks.ts`.
- The limits and words both halves read: `src/lib/social/phone-apps.ts`.
- The server: `src/server/social/phone-apps/` (`health.ts` the reading,
  `calls.ts` the shapes each answer is checked against, `module.ts` what the
  module reads). Accounts: `addAccount` and `checkPicks` in
  `src/server/social/accounts.ts`. Who is signed in: `saveAppSignIn` in
  `src/server/social/runner.ts`.
- The rack: `action_app_state`, `action_app_health`, `app_profile_from_screen`,
  `shadowban_from_screen` and `post_numbers_from_screen` in
  `rack/promo_rack.py`, with every button in `APP_SCREENS`. The saved screens
  its tests read are in `rack/fixtures/instagram/` and `rack/fixtures/tiktok/`,
  written by hand.
- The columns: `followers`, `following`, `post_count`, `shadowbanned`,
  `shadowban_words`, `app_health_read_at` and `signed_in_at` on
  `promo_accounts`, from `drizzle/0120_promo_instagram_tiktok.sql`.
