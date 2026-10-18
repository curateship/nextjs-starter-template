# A phone's screen window

Any phone's live screen, inside Promo, from anywhere: the screen button on its
row on the Phones dashboard. It is for watching jobs and tapping through a
sign-in by hand, with the codes a sign-in asks for beside it.

## The picture

Tyler's choice, 14 Oct 2026: pictures a few times a second rather than video.

- **About three pictures a second** while the window is open, each shrunk to
  540 pixels wide, about 1 Mbit/s of home upload per phone watched. The first
  arrives within a few seconds.
- **Nothing at home is reachable.** The rack program sends the pictures to
  Promo over the connection it already opens (`/api/rack/screen`, signed like
  every rack message), and the window asks Promo for the newest one. A
  window not asked from for ten seconds counts as closed and the rack stops
  sending.
- **Behind admin sign-in.** Every ask checks the phone is the person's own.
  Signed out, the window gets nothing.
- **Kept in the web server's memory,** never in the database: a picture is
  stale in a second. A restart loses only the picture on screen.

## Control and the hold

- **Control is off when the window opens,** so looking never touches the
  phone. The keys and the typing box still answer a press, saying control is
  off.
- **Switched on,** a tap or a swipe on the picture, the Back, Home, Recent
  apps, Enter and Delete keys, and typing reach the phone. Taps are placed in
  the phone's own pixels, whatever size the picture is drawn. On an iPhone the
  keys read "Back (swipe)" and "App switcher (swipe)": the rack turns them
  into the iPhone's own swipes, in from the left edge and up from the bottom
  and hold, and a phone with a home button gets Home as a press. The key
  names on the wire are the same for both kinds.
- **While control is on the phone is held.** It shows Held, "In use on its
  screen", on the dashboard, and its jobs wait, so a person and a job never
  tap at once.
- **It lets go** when control is switched off, the window is closed, or 15
  minutes pass without a tap. Each tap moves that 15 minutes on. The server
  refuses a tap once control has gone, not only the page.
- **Typing** is plain letters, numbers and punctuation; Android's own typing
  command cannot send emoji or accented letters.

## Sign-in codes

- **Authenticator codes.** Each account on the phone with an authenticator
  secret saved shows its current six digits, the seconds left, and Copy. The
  secret is saved from the account's settings button on the Reddit accounts
  dashboard, as its letters or the `otpauth://` link from the QR code, and is
  kept encrypted with the server's key, the same way a window password is. It
  is never shown again; only the code is. The code is RFC 6238's, the one an
  authenticator app shows.
- **Texted codes.** While the window is open the rack reads the phone's new
  texts every few seconds and the newest code from the last ten minutes shows
  with who sent it. No helper app (Tyler's choice, 14 Oct 2026): the rack asks
  Android for the inbox over USB, and if the phone refuses that, reads the
  message's notification instead. Texts are never written down: the code is
  kept in memory for ten minutes, and closing the window stops the reading.
  Whether a given phone model allows either way has to be tried on that
  phone. On an iPhone, which gives a computer neither, the rack opens the
  Messages app every few seconds while the window is open with control on
  and reads the newest code off the screen; the window says so
  ([iPhones on the rack](iphones.md)). Promo tells the rack which watched
  phones a person has control of in every screen reply (`control`), so
  looking at an iPhone never opens Messages.

## Where it is

- The window: `src/components/phones/phone-screen-dialog.tsx`, its endpoints
  `src/lib/api/phones/screen.ts`.
- The server side: `src/server/phones/screens.ts` (pictures, taps, control,
  the hold) and the rack's address `src/routes/api/rack/screen.ts`.
- The codes: `src/server/social/two-factor.ts`, the account's card
  `src/components/social/accounts/two-factor-card.tsx`, and
  `promo_accounts.totp_secret_encrypted` from `drizzle/0115_promo_phone_jobs.sql`.
- On the rack computer: `screen_loop` in `rack/promo_rack.py`.
