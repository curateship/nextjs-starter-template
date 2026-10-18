# Signing in

Personal asks for one password before it shows anything. Until the right one
is typed, the menu, the top bar and the panel don't show, and the server
refuses to read or save the menu. Tyler asked for it on 18 Oct 2026: "I want
to protect thiss app with login". He chose one password, 30 days, and having
it on his Mac now rather than waiting for going live.

## Using it

- **One password, no accounts.** The password is the `PERSONAL_PASSWORD` line
  in `apps/personal/.env.local` on this Mac. That file never goes into git.
  When Personal goes live, it is a Coolify setting of the same name.
- **Changing it** is editing that line. The dev server notices the file
  change and restarts itself. Every browser is signed out, because the
  sign-in cookie is signed with a key made from the password.
- **With no password set**, the sign-in screen says "No password is set yet."
  and how to add one, with a Check again button. Nothing can sign in.
- **A sign-in lasts 30 days** in each browser, through reloads and closing
  the browser. After that the sign-in screen comes back.
- **Signing in opens the screen that was asked for.** The sign-in sits on the
  address that was typed, such as `/localhost:3015/admin/listings`, with no
  page reload.
- **A wrong password** says "That password is wrong." under the box, keeps the
  typed text selected and waits one second before answering.
- **After 10 wrong passwords in 15 minutes**, sign-in stops for 15 minutes and
  says how many minutes are left. The right password is refused too until
  then. The count lives in the server's memory, so a server restart clears
  it.
- **Sign out** is the last item in the cog dropdown at the top right. It
  clears the cookie and shows the sign-in screen. The browser's Back button
  doesn't bring the menu back.
- **If the 30 days run out mid-use**, the next save shows the sign-in screen.
  The change that save carried is kept and saved once you sign in again.

## What it doesn't cover

- **The other apps' screens in the panel.** Each frame loads the app from its
  own address, and each app keeps its own sign-in (`app-panels.md`). This
  sign-in guards Personal's menu, not CMS or anything else.
- **The page's code.** The JavaScript loads before the sign-in, the way any
  sign-in page's does. It holds nothing private; the menu only comes from the
  server after signing in.

## How it works

- **`server/sign-in.ts`** answers `/api/session`, `/api/sign-in` and
  `/api/sign-out`, and refuses every other `/api/` address with 401 "Sign in
  first." without a good cookie. A new API behind it is guarded without
  asking.
- **The cookie** is `personal_session`, holding its expiry and a signature of
  it. It is HttpOnly (the page's own code can't read it), SameSite=Strict
  (other sites can't send it), and Secure when the page is on https.
- **Sign-in and sign-out only work from Personal's own page**, the same check
  menu saves already had.
- **`vite.config.ts`** reads the password on the server side with `loadEnv`.
  It is never handed to the page.
- **The menu's folder is off limits to the dev server's file serving.** Vite
  serves the app's folder as files, so `/data/menu.json` handed out the whole
  menu with no sign-in until `server.fs.deny` in `vite.config.ts` listed
  `data/`. It now answers 403, as `.env.local` always did.
- **The page** checks `/api/session` first (`src/lib/use-session.ts`), then
  shows `src/components/sign-in.tsx` or loads the menu. `useMenu` waits for a
  sign-in and turns a 401 into the sign-in screen.
- **Tests** are in `server/sign-in.test.ts`: right and wrong passwords, no
  password, forged, stretched and expired cookies, a changed password, the
  lock-out, and another site's page.

## Known

- **The browser's console shows a red "401 (Unauthorized)" line** after a wrong
  password, and when a save meets a sign-in that ran out. That line is Chrome
  reporting the server's refusal, which is the sign-in doing its job. The app
  itself logs nothing.
- **The lock-out is for everyone at once**, not per computer. On the live site
  someone guessing could keep Tyler out for 15 minutes at a time. Per-computer
  counting needs the visitor's real address from the live proxy, so it waits
  for going live.
