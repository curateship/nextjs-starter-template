# Profiles

One member can run several dating profiles. A profile is one dating app's account, a Tinder login or a Hinge login, with its own phone, settings, leads, chats, AI drafts, Google Calendar and AI spend. The Dating dashboard shows one profile at a time.

Tyler asked for it on 20 Oct 2026: "We need to build a profile dashboard so that users can run multiple profiles". His answers the same day, which outrank the code:

- **A profile is one app account.** He asked "One account one phone means one phone can run one of tinder and one of hinge?" and picked that: one phone carries at most one Tinder profile and one Hinge profile. Hinge is not built yet (`../tasks/features/04-phone-tinder-and-hinge.md`), so New profile makes Tinder profiles only.
- **Inside the Dating dashboard**, not a dashboard of its own: a picker at the top of the left panel, and a Profiles section in it.
- **Everything per profile**: About you, who you're looking for, swiping, replies, limits, the AI spend cap and Google Calendar.
- **New profile**: a name and the app, then a pair code, starting with a copy of the open profile's settings.
- **Today's data became the first profile.**
- **Only its owner** sees and runs a profile.
- **Two profiles on one phone keep their own swiping hours**, and hours that overlap are refused.
- **Pause and Delete.** Pause stops swiping, replies and AI spend until Resume. Delete, after a confirm, removes the profile with its leads and chats and frees the phone.
- **No limit** on how many.

## On the dashboard

- **The picker** is the left panel's title: the open profile's first photo (or its letter) and its name. It lists every profile with its app and phone, then **New profile**.
- **The Profiles section**, under the phone's line, lists every profile: its name, "Tinder · Pixel 8a here" (or "away", or "no phone yet"), a green dot while its phone checks in, a **Paused** tag, and how many leads wait on you there. The open one is grey. Pressing another switches to it. The last row, under the profiles, is **New profile**.
- **Switching loads the whole page again** (`window.location.assign`), the way the shell's site switcher does, so nothing of the last profile stays on screen. Each profile remembers its own place: the place key is `date-dating-place:<profile id>`.
- **The pick is kept on the server** (`date_account_picks`), so every device opens the same profile, and every server function acts on it. A switch made on another device or tab reloads this one on its next refresh, because its buttons would otherwise act on a profile it is not showing.
- **A paused profile** says "Paused. Nothing runs until Resume." at the top of the left panel, with **Resume**.

## New profile

From the picker or the **New profile** row at the bottom of the Profiles section. A window asks for the name and the app (Hinge shows as coming and can't be picked). **Create profile** makes it with a copy of the open profile's settings, never its Google Calendar, which each profile connects for itself. The same window then shows the pair code and the four steps on the phone. **Done** opens the new profile.

A profile with no phone yet works like the dashboard before pairing: no phone, **Pair one** on its line, and sample data to look at.

## The settings window

The cog opens "Dating settings · <name>". Its first card, **Profile**, holds the name, which saves like every other setting there. The foot holds **Delete profile** at the far left, **Pause profile** (or **Resume profile**) and **Done**.

**Delete** closes the window and asks in the shared confirm, naming how many leads and chats go and the phone that is unpaired. It removes, through the database's cascade, the profile's cards, chats and messages, walks, own profile, settings and Google Calendar link, then its saved views and the pictures no other profile of the member's still shows. A picture that can't be removed is logged, never undoing the delete. Its phone's record is deleted too, unless another profile still runs on it, so the phone can be paired for a new profile. The next load opens the member's first profile, or a new "Tinder" profile when it was the last.

## Pause

- **Pause** stops the phone's loop, calls off everything waiting on the phone, and the background pass skips the profile: no swipes, no automate sends, no AI calls.
- **Walks are refused** while paused, from the dashboard or the AI, with "This profile is paused. Resume it in the Dating settings first." Start says the same.
- **The AI is refused** while paused, pressed by hand too: Regenerate, Show 3, Tidy, Read again, Review and Ask Date say the same sentence and spend nothing. Every Dating AI call asks `aiSpendStopped` (`src/server/dating/spend.ts`) first, which checks Pause before the spend cap.
- **Resume** starts nothing by itself. Start, or the profile's swiping schedule, starts swiping again.

## Two profiles on one phone

The phone runs one app at a time, so saving swiping hours that share an hour with another profile on the same phone is refused, for example "Tinder (Tyler) swipes on this phone from 19:00 to 22:00. Pick hours that don't overlap it." (`hourWindowsOverlap` in `src/lib/dating/settings.ts`). A profile with no schedule only swipes when Start is pressed.

Until Hinge is built a phone carries one profile, and the loop's state (running, the schedule's day, a stop screen) stays on the phone. Task 04's Hinge part moves it to the profile.

## How it is kept

- **`date_accounts`** is a profile: its member, site, app, name, phone and `paused_at`. A unique index allows one profile per app per phone. It is called an account in the code because `date_profiles` already means a card; on screen it is always "profile".
- **Every record carries `account_id`**: cards (`date_profiles`), chats (`date_matches`, and their messages through them), walks, and the own profile, which is now one per profile instead of one per phone. Deleting a profile cascades to all of them.
- **Settings and the Google Calendar** are keyed by `account_id`. Their member and site columns stay; only the primary key moved.
- **A pair code** names the profile it was made for, and pairing sets that profile's phone.
- **AI spend** is the shell's usage meter, whose rows have no column of Date's own, so each call writes `accountId` into the row's `metadata`, and the cap and the costs read it back (`ai/spend.md`).
- **The move**, `drizzle/0108_date_profiles.sql`, made one profile per phone, named after the name on that phone's own profile or "Tinder", and one for a member with Dating records and no phone. Records with no phone (the samples) went to the member's first profile. Settings were copied to each profile of their member, which only matters for a member who had two phones. A Google Calendar stayed with the first profile only, because a copy would share one Google sign-in and disconnecting either profile would cancel it for both. This month's AI calls were tied to the profile whose card, chat or phone they were about, else the first.
- **The code** is `src/server/dating/accounts.ts` (listing, picking, New, Pause, Delete and the Profiles section's counts), `src/lib/api/dating/profiles.ts` (the server functions) and `src/components/dating/profiles.tsx` (the picker, the section and New profile).
