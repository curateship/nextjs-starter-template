# An account's profile

An Instagram or TikTok account's name, bio, link and picture, set from Promo
and typed into the app's Edit profile by its phone. Phone farm file 06, part
33. A new important account gets a finished profile without anyone touching
the phone.

Nothing here has run on a real phone yet.

## Where

The account's settings window on the Accounts dashboard has a Profile card for
an Instagram or TikTok account:

- **Name**, up to 30 characters.
- **Bio**, up to 150 characters on Instagram and 80 on TikTok.
- **Link**, a web address starting with https://. TikTok shows a link only
  once the account has 1,000 followers.
- **Picture**, picked from the media library.
- **Apply on the phone** sends what changed, on its own button apart from the
  window's Save changes.

The boxes start with what Promo last set, field by field. A box left as it was
is not sent, so the phone only touches what changed.

## The first day

A profile change is refused in the account's first day after it signed in on
its phone: "The account signed in on its phone less than a day ago. A new
profile straight after a new sign-in looks like a taken-over account and can
bring on a check, so it may be changed from 17 Oct 2026, 14:02." The card says
the same before Apply is pressed. The day starts the first time the phone
reads the account signed in after it was last read signed out.

## Also refused

- While a change for the account is still on its way. A change whose job
  failed or was dropped is not on its way.
- A picture that is not one of the person's own uploaded images.
- Before the daily self-test has walked the profile change on the test phone,
  or while it last found it broken.
- The account retired, paused, stopped by a ban screen or on no phone.

## What the phone does

1. It opens the app on the account's profile, then Edit profile.
2. Each field given is opened on its own screen, emptied, typed with a
   person's rhythm, and saved with one press.
3. A picture is downloaded from the media library, put in the gallery, and
   picked as the newest picture there. Instagram's crop screen is passed with
   Next, and only Save or Done counts the picture as changed.
4. Back on the profile, it reads the bio. A bio the profile does not show
   afterwards fails the change: "The phone saved the bio, but the profile
   shows "Old bio" afterwards." A bio it could not find on screen is left to
   the step pictures.

It is tried once and never again. The card says where the newest change
stands: on its way, done, or failed with why.

## Where it is

- The server: `queueProfileEdit`, `runProfileEdit` and `readProfileEdits` in
  `src/server/social/phone-apps/profile.ts`.
- The card: `src/components/social/accounts/app-profile-card.tsx`.
- The rack: `action_app_profile` in `rack/promo_rack.py`.
- The table: `promo_profile_edits`, from
  `drizzle/0120_promo_instagram_tiktok.sql`.
